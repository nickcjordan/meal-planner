import {
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
  BatchGetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Recipe, CreateRecipeInput, UpdateRecipeInput, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME, GSI1_NAME, GSI2_NAME, scanAll, queryAll, stripUndefined } from "./client.js";
import { randomUUID } from "crypto";

type RecipeRecord = DynamoDBRecord & Recipe;

function toRecord(recipe: Recipe): RecipeRecord {
  return {
    PK: `RECIPE#${recipe.id}`,
    SK: `RECIPE#${recipe.id}`,
    GSI2PK: "RECIPES",
    entityType: "RECIPE",
    ...recipe,
  };
}

function fromRecord(record: RecipeRecord): Recipe {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, GSI2PK: ______, entityType: _______, ...recipe } = record;

  // Backwards compat: wrap legacy flat arrays into single headerless sections
  const raw = recipe as Record<string, unknown>;
  if ("ingredients" in raw && !("ingredientSections" in raw)) {
    raw.ingredientSections = [{ items: raw.ingredients }];
  }
  if ("steps" in raw && !("stepSections" in raw)) {
    raw.stepSections = [{ steps: raw.steps }];
  }
  delete raw.ingredients;
  delete raw.steps;

  // Coerce notes/equipment to arrays if stored incorrectly (e.g. plain string)
  if (raw.notes !== undefined && !Array.isArray(raw.notes)) {
    raw.notes = typeof raw.notes === "string" && raw.notes ? [raw.notes] : [];
  }
  if (raw.equipment !== undefined && !Array.isArray(raw.equipment)) {
    raw.equipment = typeof raw.equipment === "string" && raw.equipment ? [raw.equipment] : [];
  }

  return recipe;
}

function deriveIngredientNames(sections: Recipe["ingredientSections"]): string[] {
  return sections.flatMap((s) => s.items.map((i) => i.name));
}

export async function createRecipe(input: CreateRecipeInput): Promise<Recipe> {
  const now = new Date().toISOString();
  const recipe: Recipe = {
    id: randomUUID(),
    ...input,
    ingredientNames: deriveIngredientNames(input.ingredientSections),
    createdAt: now,
    updatedAt: now,
  };

  const record = toRecord(recipe);
  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: record,
    }),
  );

  // Write tag index entries
  for (const tag of recipe.tags) {
    await getDocClient().send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `TAG#${tag}`,
          SK: `RECIPE#${recipe.id}`,
          GSI1PK: `TAG#${tag}`,
          GSI1SK: `RECIPE#${recipe.id}`,
          entityType: "TAG" as const,
          recipeId: recipe.id,
          recipeName: recipe.name,
        },
      }),
    );
  }

  return recipe;
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `RECIPE#${id}`, SK: `RECIPE#${id}` },
    }),
  );

  if (!result.Item) return null;
  return fromRecord(result.Item as RecipeRecord);
}

/**
 * Update a recipe. Undefined fields in `input` are stripped so they never erase
 * stored values. `enrichedStepSections` honors an explicit `null` sentinel: on
 * `null` the key is deleted from the merged item before the Put, so a DynamoDB
 * NULL is never written (see UpdateRecipeInput). Omitting it leaves it unchanged.
 */
export async function updateRecipe(id: string, input: UpdateRecipeInput): Promise<Recipe | null> {
  const existing = await getRecipe(id);
  if (!existing) return null;

  // Pull enrichedStepSections out so the `null` sentinel never spreads into a
  // Recipe (whose field is `EnrichedStepSection[] | undefined`).
  const { enrichedStepSections: enrichedInput, ...restInput } = input;
  const defined = stripUndefined(restInput);

  const updated: Recipe = {
    ...existing,
    ...defined,
    id,
    // Re-derive ingredientNames if ingredients changed
    ingredientNames: input.ingredientSections
      ? deriveIngredientNames(input.ingredientSections)
      : existing.ingredientNames ?? deriveIngredientNames(existing.ingredientSections),
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  if (enrichedInput === null) {
    // Explicit clear — remove the key so no NULL is stored.
    delete updated.enrichedStepSections;
  } else if (enrichedInput !== undefined) {
    updated.enrichedStepSections = enrichedInput;
  }

  const record = toRecord(updated);
  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: record,
    }),
  );

  // Update tag entries if tags changed
  if (input.tags) {
    // Remove old tag entries
    for (const tag of existing.tags) {
      if (!input.tags.includes(tag)) {
        await getDocClient().send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { PK: `TAG#${tag}`, SK: `RECIPE#${id}` },
          }),
        );
      }
    }
    // Add new tag entries
    for (const tag of input.tags) {
      if (!existing.tags.includes(tag)) {
        await getDocClient().send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `TAG#${tag}`,
              SK: `RECIPE#${id}`,
              GSI1PK: `TAG#${tag}`,
              GSI1SK: `RECIPE#${id}`,
              entityType: "TAG" as const,
              recipeId: id,
              recipeName: updated.name,
            },
          }),
        );
      }
    }
  }

  return updated;
}

export async function deleteRecipe(id: string): Promise<boolean> {
  const existing = await getRecipe(id);
  if (!existing) return false;

  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `RECIPE#${id}`, SK: `RECIPE#${id}` },
    }),
  );

  // Remove tag entries
  for (const tag of existing.tags) {
    await getDocClient().send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: `TAG#${tag}`, SK: `RECIPE#${id}` },
      }),
    );
  }

  return true;
}

export async function listRecipes(): Promise<Recipe[]> {
  const items = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: { ":type": "RECIPE" },
  });

  return items.map((item) => fromRecord(item as RecipeRecord));
}

export async function getRecipesByTag(tag: string): Promise<Recipe[]> {
  const items = await queryAll({
    TableName: TABLE_NAME,
    IndexName: GSI1_NAME,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `TAG#${tag}` },
  });

  const recipeIds = items.map((item) => (item as { recipeId: string }).recipeId);

  const recipes: Recipe[] = [];
  for (const recipeId of recipeIds) {
    const recipe = await getRecipe(recipeId);
    if (recipe) recipes.push(recipe);
  }

  return recipes;
}

export async function listTags(): Promise<string[]> {
  const items = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: { ":type": "TAG" },
    ProjectionExpression: "PK",
  });

  const tags = new Set<string>();
  for (const item of items) {
    const pk = item.PK as string;
    tags.add(pk.replace("TAG#", ""));
  }
  return Array.from(tags).sort();
}

export async function findRecipeBySourceUrl(url: string): Promise<Recipe | null> {
  // Paginated filtered scan: DynamoDB applies Limit before the filter, so a
  // single-shot `Limit: 1` scan would almost always miss the match. Follow every
  // page and return the first item that passes the FilterExpression.
  const items = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type AND sourceUrl = :url",
    ExpressionAttributeValues: { ":type": "RECIPE", ":url": url },
  });

  if (items.length === 0) return null;
  return fromRecord(items[0] as RecipeRecord);
}

/** Summary type returned by GSI2 query — recipe data without steps/notes/equipment */
export interface RecipeSummary {
  id: string;
  name: string;
  description: string;
  complexity: Recipe["complexity"];
  tags: string[];
  categories: string[];
  primaryProtein?: string;
  cuisineType?: string;
  ingredientNames?: string[];
  prepTime: number;
  cookTime: number;
  servings: number;
  avgRating?: number | null;
  lastCookedAt?: string | null;
}

let warnedMissingGsi2 = false;

/** Query all recipe summaries via GSI2. Returns compact records for planning.
 *  Tables created before GSI2 existed fall back to a paginated scan so the app
 *  keeps working; run `npm run setup:db` to add the index in place. */
export async function listRecipeSummaries(): Promise<RecipeSummary[]> {
  const summaries: RecipeSummary[] = [];
  let lastKey: Record<string, unknown> | undefined;

  let items: Record<string, unknown>[];
  try {
    items = [];
    do {
      const result = await getDocClient().send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: GSI2_NAME,
          KeyConditionExpression: "GSI2PK = :pk",
          ExpressionAttributeValues: { ":pk": "RECIPES" },
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
        }),
      );
      items.push(...(result.Items ?? []));
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
  } catch (err) {
    const isMissingIndex =
      err instanceof Error &&
      err.name === "ValidationException" &&
      err.message.includes(GSI2_NAME);
    if (!isMissingIndex) throw err;
    if (!warnedMissingGsi2) {
      warnedMissingGsi2 = true;
      console.warn(
        `[db] Table is missing index ${GSI2_NAME}; using scan fallback for recipe summaries. Run "npm run setup:db" to add it.`,
      );
    }
    items = await scanAll({
      TableName: TABLE_NAME,
      FilterExpression: "entityType = :type",
      ExpressionAttributeValues: { ":type": "RECIPE" },
    });
  }

  for (const raw of items) {
    const item = raw as unknown as Recipe;
    summaries.push({
      id: item.id,
      name: item.name,
      description: item.description,
      complexity: item.complexity,
      tags: item.tags,
      categories: item.categories,
      primaryProtein: item.primaryProtein,
      cuisineType: item.cuisineType,
      ingredientNames: item.ingredientNames,
      prepTime: item.prepTime,
      cookTime: item.cookTime,
      servings: item.servings,
      avgRating: item.avgRating,
      lastCookedAt: item.lastCookedAt,
    });
  }

  return summaries;
}

/** Update only the planning-derived fields on a recipe item (avgRating, lastCookedAt). */
export async function updateRecipePlanningFields(
  recipeId: string,
  fields: { avgRating?: number | null; lastCookedAt?: string | null },
): Promise<void> {
  const expParts: string[] = [];
  const expNames: Record<string, string> = {};
  const expValues: Record<string, unknown> = {};

  if (fields.avgRating !== undefined) {
    expParts.push("#ar = :ar");
    expNames["#ar"] = "avgRating";
    expValues[":ar"] = fields.avgRating;
  }
  if (fields.lastCookedAt !== undefined) {
    expParts.push("#lc = :lc");
    expNames["#lc"] = "lastCookedAt";
    expValues[":lc"] = fields.lastCookedAt;
  }

  if (expParts.length === 0) return;

  await getDocClient().send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `RECIPE#${recipeId}`, SK: `RECIPE#${recipeId}` },
      UpdateExpression: `SET ${expParts.join(", ")}`,
      ExpressionAttributeNames: expNames,
      ExpressionAttributeValues: expValues,
    }),
  );
}

export async function getRecipesBatch(ids: string[]): Promise<Map<string, Recipe>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();

  const results = new Map<string, Recipe>();

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    let keys = chunk.map((id) => ({ PK: `RECIPE#${id}`, SK: `RECIPE#${id}` }));

    while (keys.length > 0) {
      const response = await getDocClient().send(
        new BatchGetCommand({
          RequestItems: {
            [TABLE_NAME]: { Keys: keys },
          },
        }),
      );

      const items = response.Responses?.[TABLE_NAME] ?? [];
      for (const item of items) {
        const recipe = fromRecord(item as RecipeRecord);
        results.set(recipe.id, recipe);
      }

      keys = (response.UnprocessedKeys?.[TABLE_NAME]?.Keys ?? []) as typeof keys;
    }
  }

  return results;
}
