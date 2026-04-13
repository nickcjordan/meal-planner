import { PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type {
  GroceryStaple,
  CreateGroceryStapleInput,
  DynamoDBRecord,
} from "@meal-planner/types";
import { getDocClient, TABLE_NAME } from "./client.js";
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

export async function updateGroceryStaple(
  id: string,
  updates: Partial<Omit<GroceryStaple, "id" | "createdAt" | "updatedAt">>,
): Promise<GroceryStaple | null> {
  const existing = await getGroceryStaple(id);
  if (!existing) return null;

  const updated: GroceryStaple = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "STAPLES#default",
        SK: `STAPLE#${updated.id}`,
        entityType: "STAPLE" as const,
        ...updated,
      },
    }),
  );

  return updated;
}

export async function getGroceryStaple(id: string): Promise<GroceryStaple | null> {
  const all = await listGroceryStaples();
  return all.find((s) => s.id === id) ?? null;
}

export async function getGroceryStapleByName(name: string): Promise<GroceryStaple | null> {
  const all = await listGroceryStaples();
  return all.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export async function removeGroceryStaple(id: string): Promise<boolean> {
  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: "STAPLES#default", SK: `STAPLE#${id}` },
    }),
  );
  return true;
}

export async function listGroceryStaples(): Promise<GroceryStaple[]> {
  const result = await getDocClient().send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "entityType = :type",
      ExpressionAttributeValues: { ":type": "STAPLE" },
    }),
  );

  return (result.Items ?? []).map((item) => fromRecord(item as StapleRecord));
}

export async function listActiveGroceryStaples(): Promise<GroceryStaple[]> {
  const all = await listGroceryStaples();
  return all.filter((s) => s.isActive);
}
