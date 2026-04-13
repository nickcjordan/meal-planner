import { PutCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { InventoryItem, SetInventoryInput, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME, GSI1_NAME } from "./client.js";

type InventoryRecord = DynamoDBRecord & InventoryItem;

function fromRecord(record: InventoryRecord): InventoryItem {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...item } = record;
  return item;
}

export async function setInventoryStatus(input: SetInventoryInput): Promise<InventoryItem> {
  const now = new Date().toISOString();
  const item: InventoryItem = {
    ...input,
    lastUpdated: now,
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "INVENTORY#default",
        SK: `ITEM#${input.name.toLowerCase()}`,
        GSI1PK: `INVENTORY#STATUS#${input.status}`,
        GSI1SK: `ITEM#${input.name.toLowerCase()}`,
        entityType: "INVENTORY" as const,
        ...item,
      },
    }),
  );

  return item;
}

export async function removeInventoryStatus(name: string): Promise<boolean> {
  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: "INVENTORY#default", SK: `ITEM#${name.toLowerCase()}` },
    }),
  );
  return true;
}

export async function listInventory(): Promise<InventoryItem[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": "INVENTORY#default" },
    }),
  );

  return (result.Items ?? []).map((item) => fromRecord(item as InventoryRecord));
}

export async function getItemsByStatus(status: string): Promise<InventoryItem[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_NAME,
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `INVENTORY#STATUS#${status}` },
    }),
  );

  return (result.Items ?? []).map((item) => fromRecord(item as InventoryRecord));
}
