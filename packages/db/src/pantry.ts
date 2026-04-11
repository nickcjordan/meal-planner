import { PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { PantryItem, CreatePantryItemInput, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME } from "./client.js";

type PantryRecord = DynamoDBRecord & PantryItem;

function fromRecord(record: PantryRecord): PantryItem {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...item } = record;
  return item;
}

export async function addPantryItem(input: CreatePantryItemInput): Promise<PantryItem> {
  const item: PantryItem = {
    ...input,
    isDefault: input.isDefault ?? true,
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "PANTRY#default",
        SK: `ITEM#${item.name.toLowerCase()}`,
        entityType: "PANTRY" as const,
        ...item,
      },
    }),
  );

  return item;
}

export async function removePantryItem(name: string): Promise<boolean> {
  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: "PANTRY#default", SK: `ITEM#${name.toLowerCase()}` },
    }),
  );
  return true;
}

export async function listPantryItems(): Promise<PantryItem[]> {
  const result = await getDocClient().send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "entityType = :type",
      ExpressionAttributeValues: { ":type": "PANTRY" },
    }),
  );

  return (result.Items ?? []).map((item) => fromRecord(item as PantryRecord));
}
