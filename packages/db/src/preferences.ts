import { PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import type { FamilyPreference, CreatePreferenceInput, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME, GSI1_NAME, queryAll } from "./client.js";

type PreferenceRecord = DynamoDBRecord & FamilyPreference;

function toKey(type: string, key: string) {
  return `${type.toUpperCase()}#${key.toLowerCase()}`;
}

function fromRecord(record: PreferenceRecord): FamilyPreference {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...pref } = record;
  return pref;
}

export async function setPreference(input: CreatePreferenceInput): Promise<FamilyPreference> {
  const now = new Date().toISOString();
  const pref: FamilyPreference = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "PREFS#default",
        SK: toKey(input.type, input.key),
        GSI1PK: `PREFS#TYPE#${input.type}`,
        GSI1SK: input.key.toLowerCase(),
        entityType: "PREFERENCE" as const,
        ...pref,
      },
    }),
  );

  return pref;
}

export async function removePreference(type: string, key: string): Promise<boolean> {
  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: "PREFS#default", SK: toKey(type, key) },
    }),
  );
  return true;
}

export async function listPreferences(): Promise<FamilyPreference[]> {
  const items = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": "PREFS#default" },
  });

  return items.map((item) => fromRecord(item as PreferenceRecord));
}

export async function getPreferencesByType(type: string): Promise<FamilyPreference[]> {
  const items = await queryAll({
    TableName: TABLE_NAME,
    IndexName: GSI1_NAME,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `PREFS#TYPE#${type}` },
  });

  return items.map((item) => fromRecord(item as PreferenceRecord));
}
