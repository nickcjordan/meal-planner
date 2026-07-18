import { PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import type {
  PlanningSession,
  CreateSessionInput,
  DynamoDBRecord,
} from "@meal-planner/types";
import { getDocClient, TABLE_NAME, GSI1_NAME, scanAll, queryAll, stripUndefined } from "./client.js";
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
    ...stripUndefined(updates),
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
  // Fetch every session for the week (no uniqueness guard exists at create) and
  // return the most recently updated one so reads/updates bind deterministically.
  const items = await queryAll({
    TableName: TABLE_NAME,
    IndexName: GSI1_NAME,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": `WEEK#${weekOf}` },
  });

  if (items.length === 0) return null;

  const sessions = items.map((item) => fromRecord(item as SessionRecord));
  return sessions.reduce((latest, s) =>
    s.updatedAt > latest.updatedAt ? s : latest,
  );
}

export async function getRecentSessions(limit: number = 8): Promise<PlanningSession[]> {
  // Scan for session entities and sort client-side by weekOf descending
  const items = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: { ":type": "SESSION" },
  });

  const sessions = items
    .map((item) => fromRecord(item as SessionRecord))
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf));

  return sessions.slice(0, limit);
}

/** Delete a planning session and everything stored in its partition
 *  (the session item itself, per-recipe FEEDBACK rows, and the SHOPLIST
 *  snapshot). Recipe cook-HISTORY rows are intentionally kept — the meals
 *  were still cooked even if the plan record is removed.
 *  Returns false when no session exists for the id. */
export async function deleteSession(id: string): Promise<boolean> {
  const items = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": `SESSION#${id}` },
  });

  if (items.length === 0) return false;

  for (const item of items) {
    await getDocClient().send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK: item.PK as string, SK: item.SK as string },
      }),
    );
  }

  return true;
}
