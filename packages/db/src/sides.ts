import {
  PutCommand,
  GetCommand,
  DeleteCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  Side,
  CreateSideInput,
  UpdateSideInput,
  SideCategory,
  SideComplexity,
  DynamoDBRecord,
} from "@meal-planner/types";
import { getDocClient, TABLE_NAME, GSI1_NAME, scanAll, queryAll, stripUndefined } from "./client.js";
import { getRecentSessions } from "./sessions.js";
import { getRecipesBatch } from "./recipes.js";
import { randomUUID } from "crypto";

type SideRecord = DynamoDBRecord & Side;

function toRecord(side: Side): SideRecord {
  return {
    PK: `SIDE#${side.id}`,
    SK: `SIDE#${side.id}`,
    GSI1PK: `SIDEBASE#${side.baseIngredient.toLowerCase()}`,
    GSI1SK: `SIDE#${side.name.toLowerCase()}`,
    entityType: "SIDE",
    ...side,
  };
}

function fromRecord(record: SideRecord): Side {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...side } = record;
  return side;
}

export async function createSide(input: CreateSideInput): Promise<Side> {
  const now = new Date().toISOString();
  const side: Side = {
    id: randomUUID(),
    ...input,
    tags: [...new Set(input.tags.map((t) => t.toLowerCase()))],
    createdAt: now,
    updatedAt: now,
  };

  await getDocClient().send(
    new PutCommand({ TableName: TABLE_NAME, Item: toRecord(side) }),
  );

  for (const tag of side.tags) {
    await getDocClient().send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `SIDETAG#${tag}`,
          SK: `SIDE#${side.id}`,
          GSI1PK: `SIDETAG#${tag}`,
          GSI1SK: `SIDE#${side.id}`,
          entityType: "SIDETAG" as const,
          sideId: side.id,
          sideName: side.name,
        },
      }),
    );
  }

  return side;
}

export async function getSide(id: string): Promise<Side | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SIDE#${id}`, SK: `SIDE#${id}` },
    }),
  );
  if (!result.Item) return null;
  return fromRecord(result.Item as SideRecord);
}

export async function updateSide(id: string, input: UpdateSideInput): Promise<Side | null> {
  const existing = await getSide(id);
  if (!existing) return null;

  const updated: Side = {
    ...existing,
    ...stripUndefined(input),
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  if (input.tags) {
    updated.tags = [...new Set(input.tags.map((t) => t.toLowerCase()))];
  }

  await getDocClient().send(
    new PutCommand({ TableName: TABLE_NAME, Item: toRecord(updated) }),
  );

  if (input.tags) {
    for (const tag of existing.tags) {
      if (!updated.tags.includes(tag)) {
        await getDocClient().send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { PK: `SIDETAG#${tag}`, SK: `SIDE#${id}` },
          }),
        );
      }
    }
    for (const tag of updated.tags) {
      if (!existing.tags.includes(tag)) {
        await getDocClient().send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `SIDETAG#${tag}`,
              SK: `SIDE#${id}`,
              GSI1PK: `SIDETAG#${tag}`,
              GSI1SK: `SIDE#${id}`,
              entityType: "SIDETAG" as const,
              sideId: id,
              sideName: updated.name,
            },
          }),
        );
      }
    }
  }

  return updated;
}

export async function deleteSide(id: string): Promise<boolean> {
  const existing = await getSide(id);
  if (!existing) return false;

  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SIDE#${id}`, SK: `SIDE#${id}` },
    }),
  );

  for (const tag of existing.tags) {
    await getDocClient().send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `SIDETAG#${tag}`, SK: `SIDE#${id}` },
      }),
    );
  }

  return true;
}

export async function listSides(): Promise<Side[]> {
  const items = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: { ":type": "SIDE" },
  });
  return items.map((item) => fromRecord(item as SideRecord));
}

export async function getSidesByBase(base: string): Promise<Side[]> {
  const items = await queryAll({
    TableName: TABLE_NAME,
    IndexName: GSI1_NAME,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `SIDEBASE#${base.toLowerCase()}` },
  });

  const ids = items.map((item) => (item as { id: string }).id);
  const sides: Side[] = [];
  for (const id of ids) {
    const side = await getSide(id);
    if (side) sides.push(side);
  }
  return sides;
}

export async function getSidesByTag(tag: string): Promise<Side[]> {
  const items = await queryAll({
    TableName: TABLE_NAME,
    IndexName: GSI1_NAME,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `SIDETAG#${tag.toLowerCase()}` },
  });

  const ids = items.map((item) => (item as { sideId: string }).sideId);
  const sides: Side[] = [];
  for (const id of ids) {
    const side = await getSide(id);
    if (side) sides.push(side);
  }
  return sides;
}

export async function getSidesBatch(ids: string[]): Promise<Map<string, Side>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const results = new Map<string, Side>();

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    let keys = chunk.map((id) => ({ PK: `SIDE#${id}`, SK: `SIDE#${id}` }));

    while (keys.length > 0) {
      const response = await getDocClient().send(
        new BatchGetCommand({
          RequestItems: { [TABLE_NAME]: { Keys: keys } },
        }),
      );

      const items = response.Responses?.[TABLE_NAME] ?? [];
      for (const item of items) {
        const side = fromRecord(item as SideRecord);
        results.set(side.id, side);
      }

      keys = (response.UnprocessedKeys?.[TABLE_NAME]?.Keys ?? []) as typeof keys;
    }
  }

  return results;
}

export async function searchSides(opts: {
  category?: SideCategory;
  complexity?: SideComplexity;
  tags?: string[];
  query?: string;
}): Promise<Side[]> {
  let sides = await listSides();

  if (opts.category) {
    sides = sides.filter((s) => s.sideCategory === opts.category);
  }
  if (opts.complexity) {
    sides = sides.filter((s) => s.complexity === opts.complexity);
  }
  if (opts.tags?.length) {
    const lowerTags = opts.tags.map((t) => t.toLowerCase());
    sides = sides.filter((s) => lowerTags.some((t) => s.tags.includes(t)));
  }
  if (opts.query) {
    const q = opts.query.toLowerCase();
    sides = sides.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.baseIngredient.toLowerCase().includes(q) ||
        (s.prepStyle?.toLowerCase().includes(q) ?? false),
    );
  }

  return sides;
}

// --- Derived analytics ---

export interface SidePairingStat {
  sideKey: string;
  sideName: string;
  pairings: Array<{
    recipeId: string;
    recipeName: string;
    count: number;
    lastWeekOf: string;
  }>;
  totalUses: number;
}

export async function getSidePairingStats(sessionsBack: number = 12): Promise<SidePairingStat[]> {
  const sessions = await getRecentSessions(sessionsBack);

  const recipeIds = new Set<string>();
  for (const session of sessions) {
    for (const meal of session.meals) {
      recipeIds.add(meal.recipeId);
    }
  }
  const recipes = await getRecipesBatch([...recipeIds]);

  const pairMap = new Map<string, { name: string; byRecipe: Map<string, { recipeName: string; count: number; lastWeekOf: string }> }>();

  for (const session of sessions) {
    for (const meal of session.meals) {
      for (const side of meal.sides ?? []) {
        const sideKey = side.kind === "ref" ? side.sideId : side.name.toLowerCase();
        const sideName = side.kind === "ref" ? sideKey : side.name;

        if (!pairMap.has(sideKey)) {
          pairMap.set(sideKey, { name: sideName, byRecipe: new Map() });
        }
        const entry = pairMap.get(sideKey)!;

        const recipeName = recipes.get(meal.recipeId)?.name ?? meal.recipeId;
        const existing = entry.byRecipe.get(meal.recipeId);
        if (existing) {
          existing.count++;
          if (session.weekOf > existing.lastWeekOf) existing.lastWeekOf = session.weekOf;
        } else {
          entry.byRecipe.set(meal.recipeId, {
            recipeName,
            count: 1,
            lastWeekOf: session.weekOf,
          });
        }
      }
    }
  }

  // Resolve side names for ref sides
  const refIds = [...pairMap.entries()]
    .filter(([key]) => !key.includes(" ") && key.length === 36)
    .map(([key]) => key);
  if (refIds.length > 0) {
    const sideBatch = await getSidesBatch(refIds);
    for (const [key, entry] of pairMap) {
      const side = sideBatch.get(key);
      if (side) entry.name = side.name;
    }
  }

  return [...pairMap.entries()].map(([sideKey, entry]) => ({
    sideKey,
    sideName: entry.name,
    pairings: [...entry.byRecipe.entries()].map(([recipeId, data]) => ({
      recipeId,
      ...data,
    })),
    totalUses: [...entry.byRecipe.values()].reduce((sum, d) => sum + d.count, 0),
  }));
}

export interface InlineSideFrequency {
  name: string;
  baseIngredient?: string;
  count: number;
}

export async function getInlineSideFrequencies(sessionsBack: number = 12): Promise<InlineSideFrequency[]> {
  const sessions = await getRecentSessions(sessionsBack);

  const freq = new Map<string, { base?: string; count: number }>();

  for (const session of sessions) {
    for (const meal of session.meals) {
      for (const side of meal.sides ?? []) {
        if (side.kind !== "inline") continue;
        const key = side.name.toLowerCase().trim();
        const existing = freq.get(key);
        if (existing) {
          existing.count++;
        } else {
          freq.set(key, { base: side.baseIngredient, count: 1 });
        }
      }
    }
  }

  return [...freq.entries()]
    .filter(([, v]) => v.count >= 3)
    .map(([name, v]) => ({ name, baseIngredient: v.base, count: v.count }))
    .sort((a, b) => b.count - a.count);
}
