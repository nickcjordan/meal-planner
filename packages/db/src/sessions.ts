import { PutCommand, GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type {
  PlanningSession,
  CreateSessionInput,
  DynamoDBRecord,
} from "@meal-planner/types";
import { getDocClient, TABLE_NAME, GSI1_NAME } from "./client.js";
import { randomUUID } from "crypto";

type SessionRecord = DynamoDBRecord & PlanningSession;

function toRecord(session: PlanningSession): SessionRecord {
  return {
    PK: `SESSION#${session.id}`,
    SK: `SESSION#${session.id}`,
    GSI1PK: `WEEK#${session.weekOf}`,
    GSI1SK: `SESSION#${session.id}`,
    entityType: "SESSION",
    ...session,
  };
}

function fromRecord(record: SessionRecord): PlanningSession {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...session } = record;
  return session;
}

export async function createSession(input: CreateSessionInput): Promise<PlanningSession> {
  const now = new Date().toISOString();
  const session: PlanningSession = {
    id: randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: toRecord(session),
    }),
  );

  return session;
}

export async function getSession(id: string): Promise<PlanningSession | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `SESSION#${id}`, SK: `SESSION#${id}` },
    }),
  );

  if (!result.Item) return null;
  return fromRecord(result.Item as SessionRecord);
}

export async function updateSession(
  id: string,
  updates: Partial<CreateSessionInput>,
): Promise<PlanningSession | null> {
  const existing = await getSession(id);
  if (!existing) return null;

  const updated: PlanningSession = {
    ...existing,
    ...updates,
    id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: toRecord(updated),
    }),
  );

  return updated;
}

export async function getSessionByWeek(weekOf: string): Promise<PlanningSession | null> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI1_NAME,
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `WEEK#${weekOf}` },
      Limit: 1,
    }),
  );

  if (!result.Items?.length) return null;
  return fromRecord(result.Items[0] as SessionRecord);
}

export async function getRecentSessions(limit: number = 8): Promise<PlanningSession[]> {
  // Scan for session entities and sort client-side by weekOf descending
  const result = await getDocClient().send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "entityType = :type",
      ExpressionAttributeValues: { ":type": "SESSION" },
    }),
  );

  const sessions = (result.Items ?? [])
    .map((item) => fromRecord(item as SessionRecord))
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf));

  return sessions.slice(0, limit);
}
