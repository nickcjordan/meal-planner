import { PutCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
  IngredientSwap,
  CreateIngredientSwapInput,
  DynamoDBRecord,
} from "@meal-planner/types";
import { getDocClient, TABLE_NAME, scanAll } from "./client.js";
import { randomUUID } from "crypto";

type SwapRecord = DynamoDBRecord & IngredientSwap;

function fromRecord(record: SwapRecord): IngredientSwap {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...item } = record;
  return item;
}

export async function addIngredientSwap(input: CreateIngredientSwapInput): Promise<IngredientSwap> {
  const now = new Date().toISOString();
  const item: IngredientSwap = {
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
        PK: "SWAPS#default",
        SK: `SWAP#${item.id}`,
        entityType: "SWAP" as const,
        ...item,
      },
    }),
  );

  return item;
}

export async function updateIngredientSwap(
  id: string,
  updates: Partial<Omit<IngredientSwap, "id" | "createdAt" | "updatedAt">>,
): Promise<IngredientSwap | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: "SWAPS#default", SK: `SWAP#${id}` },
    }),
  );
  if (!result.Item) return null;

  const record = result.Item as SwapRecord;
  const existing = fromRecord(record);

  const defined = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  );

  const updated: IngredientSwap = {
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
        PK: "SWAPS#default",
        SK: `SWAP#${id}`,
        entityType: "SWAP" as const,
        ...updated,
      },
    }),
  );

  return updated;
}

export async function getIngredientSwap(id: string): Promise<IngredientSwap | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: "SWAPS#default", SK: `SWAP#${id}` },
    }),
  );
  return result.Item ? fromRecord(result.Item as SwapRecord) : null;
}

export async function removeIngredientSwap(id: string): Promise<boolean> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: "SWAPS#default", SK: `SWAP#${id}` },
    }),
  );
  if (!result.Item) return false;

  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: "SWAPS#default", SK: `SWAP#${id}` },
    }),
  );
  return true;
}

export async function listIngredientSwaps(): Promise<IngredientSwap[]> {
  const items = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: { ":type": "SWAP" },
  });

  return items.map((item) => fromRecord(item as SwapRecord));
}

export async function listActiveIngredientSwaps(): Promise<IngredientSwap[]> {
  const all = await listIngredientSwaps();
  return all.filter((s) => s.isActive);
}
