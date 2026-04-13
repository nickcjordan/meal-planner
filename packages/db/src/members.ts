import { PutCommand, DeleteCommand, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { FamilyMember, CreateFamilyMemberInput, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME } from "./client.js";
import { randomUUID } from "crypto";

type MemberRecord = DynamoDBRecord & FamilyMember;

function fromRecord(record: MemberRecord): FamilyMember {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...member } = record;
  return member;
}

export async function addFamilyMember(input: CreateFamilyMemberInput): Promise<FamilyMember> {
  const now = new Date().toISOString();
  const member: FamilyMember = {
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
        PK: "MEMBERS#default",
        SK: `MEMBER#${member.id}`,
        entityType: "MEMBER" as const,
        ...member,
      },
    }),
  );

  return member;
}

export async function updateFamilyMember(
  id: string,
  updates: Partial<CreateFamilyMemberInput>,
): Promise<FamilyMember | null> {
  const existing = await getFamilyMember(id);
  if (!existing) return null;

  const updated: FamilyMember = {
    ...existing,
    ...updates,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: "MEMBERS#default",
        SK: `MEMBER#${id}`,
        entityType: "MEMBER" as const,
        ...updated,
      },
    }),
  );

  return updated;
}

export async function getFamilyMember(id: string): Promise<FamilyMember | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: "MEMBERS#default", SK: `MEMBER#${id}` },
    }),
  );

  if (!result.Item) return null;
  return fromRecord(result.Item as MemberRecord);
}

export async function removeFamilyMember(id: string): Promise<boolean> {
  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: "MEMBERS#default", SK: `MEMBER#${id}` },
    }),
  );
  return true;
}

export async function listFamilyMembers(): Promise<FamilyMember[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": "MEMBERS#default" },
    }),
  );

  return (result.Items ?? []).map((item) => fromRecord(item as MemberRecord));
}
