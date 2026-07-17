import { PutCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
  GroceryStaple,
  CreateGroceryStapleInput,
  DynamoDBRecord,
} from "@meal-planner/types";
import { getDocClient, TABLE_NAME, scanAll } from "./client.js";
import { randomUUID } from "crypto";

type StapleRecord = DynamoDBRecord & GroceryStaple;

function fromRecord(record: StapleRecord): GroceryStaple {
  const { PK: _, SK, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...item } = record;
  // Backfill id for records created before the UUID migration
  if (!item.id) {
    item.id = SK.startsWith("STAPLE#") ? SK.slice(7) : SK.replace("ITEM#", "");
  }
  return item;
}

export async function addGroceryStaple(input: CreateGroceryStapleInput): Promise<GroceryStaple> {
  const now = new Date().toISOString();
  const item: GroceryStaple = {
    id: randomUUID(),
    ...input,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "STAPLES#default",
        SK: `STAPLE#${item.id}`,
        entityType: "STAPLE" as const,
        ...item,
      },
    }),
  );

  return item;
}

/** Find a raw staple record by id, trying GetCommand first then falling back to scan. */
async function findRawRecord(id: string): Promise<StapleRecord | null> {
  // Fast path: current SK format
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: "STAPLES#default", SK: `STAPLE#${id}` },
    }),
  );
  if (result.Item) return result.Item as StapleRecord;

  // Slow path: legacy records where SK doesn't match STAPLE#<id>
  const scanned = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: { ":type": "STAPLE" },
  });
  for (const item of scanned) {
    const record = item as StapleRecord;
    const staple = fromRecord(record);
    if (staple.id === id) return record;
  }
  return null;
}

export async function updateGroceryStaple(
  id: string,
  updates: Partial<Omit<GroceryStaple, "id" | "createdAt" | "updatedAt">>,
): Promise<GroceryStaple | null> {
  const raw = await findRawRecord(id);
  if (!raw) return null;

  // Strip undefined values so callers can't accidentally erase fields
  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  );

  const existing = fromRecord(raw);
  const updated: GroceryStaple = {
    ...existing,
    ...defined,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: raw.PK,
        SK: raw.SK,
        entityType: "STAPLE" as const,
        ...updated,
      },
    }),
  );

  return updated;
}

export async function getGroceryStaple(id: string): Promise<GroceryStaple | null> {
  const raw = await findRawRecord(id);
  return raw ? fromRecord(raw) : null;
}

export async function getGroceryStapleByName(name: string): Promise<GroceryStaple | null> {
  const all = await listGroceryStaples();
  return all.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export async function removeGroceryStaple(id: string): Promise<boolean> {
  const raw = await findRawRecord(id);
  if (!raw) return false;

  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: raw.PK, SK: raw.SK },
    }),
  );
  return true;
}

export async function listGroceryStaples(): Promise<GroceryStaple[]> {
  const items = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: { ":type": "STAPLE" },
  });

  return items.map((item) => fromRecord(item as StapleRecord));
}

export async function listActiveGroceryStaples(): Promise<GroceryStaple[]> {
  const all = await listGroceryStaples();
  return all.filter((s) => s.isActive);
}
