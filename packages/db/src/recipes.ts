import {
  PutCommand,
  GetCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Recipe, CreateRecipeInput, UpdateRecipeInput, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME, GSI1_NAME } from "./client.js";
import { randomUUID } from "crypto";

type RecipeRecord = DynamoDBRecord & Recipe;

function toRecord(recipe: Recipe): RecipeRecord {
  return {
    PK: `RECIPE#${recipe.id}`,
    SK: `RECIPE#${recipe.id}`,
    entityType: "RECIPE",
    ...recipe,
  };
}

function fromRecord(record: RecipeRecord): Recipe {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...recipe } = record;
  return recipe;
}

export async function createRecipe(input: CreateRecipeInput): Promise<Recipe> {
  const now = new Date().toISOString();
  const recipe: Recipe = {
    id: randomUUID(),
    ...input,
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

export async function updateRecipe(id: string, input: UpdateRecipeInput): Promise<Recipe | null> {
  const existing = await getRecipe(id);
  if (!existing) return null;

  const updated: Recipe = {
    ...existing,
    ...input,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

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
  const result = await getDocClient().send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "entityType = :type",
      ExpressionAttributeValues: { ":type": "RECIPE" },
    }),
  );

  return (result.Items ?? []).map((item) => fromRecord(item as RecipeRecord));
}

export async function getRecipesByTag(tag: string): Promise<Recipe[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_NAME,
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `TAG#${tag}` },
    }),
  );

  const recipeIds = (result.Items ?? []).map(
    (item) => (item as { recipeId: string }).recipeId,
  );

  const recipes: Recipe[] = [];
  for (const recipeId of recipeIds) {
    const recipe = await getRecipe(recipeId);
    if (recipe) recipes.push(recipe);
  }

  return recipes;
}

export async function listTags(): Promise<string[]> {
  const result = await getDocClient().send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "entityType = :type",
      ExpressionAttributeValues: { ":type": "TAG" },
      ProjectionExpression: "PK",
    }),
  );

  const tags = new Set<string>();
  for (const item of result.Items ?? []) {
    const pk = item.PK as string;
    tags.add(pk.replace("TAG#", ""));
  }
  return Array.from(tags).sort();
}
