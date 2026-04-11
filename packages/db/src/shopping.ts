import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { ShoppingList, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME } from "./client.js";

type ShoppingListRecord = DynamoDBRecord & ShoppingList;

function fromRecord(record: ShoppingListRecord): ShoppingList {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...list } = record;
  return list;
}

export async function saveShoppingList(list: ShoppingList): Promise<ShoppingList> {
  const now = new Date().toISOString();
  const record = {
    PK: `SESSION#${list.sessionId}`,
    SK: `SHOPLIST#${list.sessionId}`,
    entityType: "SHOPLIST" as const,
    ...list,
    updatedAt: now,
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: record,
    }),
  );

  return { ...list, updatedAt: now };
}

export async function getShoppingList(sessionId: string): Promise<ShoppingList | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SESSION#${sessionId}`, SK: `SHOPLIST#${sessionId}` },
    }),
  );

  if (!result.Item) return null;
  return fromRecord(result.Item as ShoppingListRecord);
}
