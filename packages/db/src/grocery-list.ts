import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { GroceryList, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME } from "./client.js";

const PK = "GROCERYLIST#active";
const SK = "GROCERYLIST#active";

type GroceryListRecord = DynamoDBRecord & GroceryList;

function fromRecord(record: GroceryListRecord): GroceryList {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...list } = record;
  return list;
}

export async function getActiveGroceryList(): Promise<GroceryList | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK, SK },
    }),
  );

  if (!result.Item) return null;
  return fromRecord(result.Item as GroceryListRecord);
}

export async function saveGroceryList(list: GroceryList): Promise<GroceryList> {
  const now = new Date().toISOString();
  const record = {
    PK,
    SK,
    entityType: "GROCERYLIST" as const,
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

/** Get the active grocery list, or create an empty one if none exists. */
export async function ensureGroceryList(): Promise<GroceryList> {
  const existing = await getActiveGroceryList();
  if (existing) return existing;

  const now = new Date().toISOString();
  const empty: GroceryList = {
    items: [],
    mergedSessionIds: [],
    createdAt: now,
    updatedAt: now,
  };

  return saveGroceryList(empty);
}
