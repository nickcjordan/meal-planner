import { PutCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type {
  PantryItem,
  CreatePantryItemInput,
  UpdatePantryItemInput,
  DynamoDBRecord,
} from "@meal-planner/types";
import { getDocClient, TABLE_NAME } from "./client.js";
import { randomUUID } from "crypto";

type PantryRecord = DynamoDBRecord & PantryItem;

function fromRecord(record: PantryRecord): PantryItem {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...item } = record;
  // Backfill new fields for records created before the schema expansion
  if (!item.normalizedName) {
    item.normalizedName = item.name.toLowerCase();
  }
  if (!item.createdAt) {
    item.createdAt = new Date().toISOString();
  }
  if (!item.updatedAt) {
    item.updatedAt = item.createdAt;
  }
  return item;
}

export async function addPantryItem(input: CreatePantryItemInput): Promise<PantryItem> {
  const now = new Date().toISOString();
  const item: PantryItem = {
    id: randomUUID(),
    ...input,
    normalizedName: input.name.toLowerCase().trim(),
    isDefault: input.isDefault ?? true,
    createdAt: now,
    updatedAt: now,
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "PANTRY#default",
        SK: `PANTRY#${item.id}`,
        entityType: "PANTRY" as const,
        ...item,
      },
    }),
  );

  return item;
}

export async function updatePantryItem(
  id: string,
  updates: UpdatePantryItemInput,
): Promise<PantryItem | null> {
  const existing = await getPantryItem(id);
  if (!existing) return null;

  const updated: PantryItem = {
    ...existing,
    ...updates,
    id: existing.id,
    normalizedName: updates.name
      ? updates.name.toLowerCase().trim()
      : existing.normalizedName,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "PANTRY#default",
        SK: `PANTRY#${updated.id}`,
        entityType: "PANTRY" as const,
        ...updated,
      },
    }),
  );

  return updated;
}

export async function getPantryItem(id: string): Promise<PantryItem | null> {
  const all = await listPantryItems();
  return all.find((p) => p.id === id) ?? null;
}

export async function getPantryItemByNormalizedName(
  name: string,
): Promise<PantryItem | null> {
  const normalized = name.toLowerCase().trim();
  const all = await listPantryItems();
  return all.find((p) => p.normalizedName === normalized) ?? null;
}

export async function removePantryItem(id: string): Promise<boolean> {
  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: "PANTRY#default", SK: `PANTRY#${id}` },
    }),
  );
  return true;
}

export async function listPantryItems(): Promise<PantryItem[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": "PANTRY#default" },
    }),
  );

  return (result.Items ?? []).map((item) => fromRecord(item as PantryRecord));
}
