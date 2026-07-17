import { PutCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
  DietaryAdaptation,
  CreateDietaryAdaptationInput,
  DynamoDBRecord,
} from "@meal-planner/types";
import { getDocClient, TABLE_NAME, GSI1_NAME, queryAll, stripUndefined } from "./client.js";
import { randomUUID } from "crypto";

type AdaptationRecord = DynamoDBRecord & DietaryAdaptation;

function fromRecord(record: AdaptationRecord): DietaryAdaptation {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...adaptation } = record;
  return adaptation;
}

export async function addDietaryAdaptation(
  input: CreateDietaryAdaptationInput,
): Promise<DietaryAdaptation> {
  const now = new Date().toISOString();
  const adaptation: DietaryAdaptation = {
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
        PK: "ADAPTATIONS#default",
        SK: `ADAPT#${adaptation.id}`,
        GSI1PK: `ADAPTATIONS#MEMBER#${adaptation.memberId}`,
        GSI1SK: `ADAPT#${adaptation.name.toLowerCase()}`,
        entityType: "ADAPTATION" as const,
        ...adaptation,
      },
    }),
  );

  return adaptation;
}

export async function updateDietaryAdaptation(
  id: string,
  updates: Partial<CreateDietaryAdaptationInput>,
): Promise<DietaryAdaptation | null> {
  const existing = await getDietaryAdaptation(id);
  if (!existing) return null;

  const updated: DietaryAdaptation = {
    ...existing,
    ...stripUndefined(updates),
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "ADAPTATIONS#default",
        SK: `ADAPT#${id}`,
        GSI1PK: `ADAPTATIONS#MEMBER#${updated.memberId}`,
        GSI1SK: `ADAPT#${updated.name.toLowerCase()}`,
        entityType: "ADAPTATION" as const,
        ...updated,
      },
    }),
  );

  return updated;
}

export async function getDietaryAdaptation(id: string): Promise<DietaryAdaptation | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: "ADAPTATIONS#default", SK: `ADAPT#${id}` },
    }),
  );

  if (!result.Item) return null;
  return fromRecord(result.Item as AdaptationRecord);
}

export async function removeDietaryAdaptation(id: string): Promise<boolean> {
  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: "ADAPTATIONS#default", SK: `ADAPT#${id}` },
    }),
  );
  return true;
}

export async function listDietaryAdaptations(): Promise<DietaryAdaptation[]> {
  const items = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": "ADAPTATIONS#default" },
  });

  return items.map((item) => fromRecord(item as AdaptationRecord));
}

export async function listAdaptationsForMember(
  memberId: string,
): Promise<DietaryAdaptation[]> {
  const items = await queryAll({
    TableName: TABLE_NAME,
    IndexName: GSI1_NAME,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `ADAPTATIONS#MEMBER#${memberId}` },
  });

  return items.map((item) => fromRecord(item as AdaptationRecord));
}
