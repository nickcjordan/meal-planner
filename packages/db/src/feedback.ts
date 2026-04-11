import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { MealFeedback, CreateFeedbackInput, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME } from "./client.js";

type FeedbackRecord = DynamoDBRecord & MealFeedback;

function fromRecord(record: FeedbackRecord): MealFeedback {
  const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...feedback } = record;
  return feedback;
}

export async function saveFeedback(input: CreateFeedbackInput): Promise<MealFeedback> {
  const feedback: MealFeedback = {
    ...input,
    createdAt: new Date().toISOString(),
  };

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `SESSION#${input.sessionId}`,
        SK: `FEEDBACK#${input.recipeId}`,
        entityType: "FEEDBACK" as const,
        ...feedback,
      },
    }),
  );

  // Also write to recipe history for recency tracking
  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `RECIPE#${input.recipeId}`,
        SK: `HISTORY#${feedback.createdAt}`,
        entityType: "HISTORY" as const,
        sessionId: input.sessionId,
        wasMade: input.wasMade,
        rating: input.rating,
        comment: input.comment,
        createdAt: feedback.createdAt,
      },
    }),
  );

  return feedback;
}

export async function getFeedbackForSession(sessionId: string): Promise<MealFeedback[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `SESSION#${sessionId}`,
        ":prefix": "FEEDBACK#",
      },
    }),
  );

  return (result.Items ?? []).map((item) => fromRecord(item as FeedbackRecord));
}

export async function getRecipeHistory(
  recipeId: string,
  limit: number = 10,
): Promise<MealFeedback[]> {
  const result = await getDocClient().send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `RECIPE#${recipeId}`,
        ":prefix": "HISTORY#",
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  return (result.Items ?? []).map((item) => fromRecord(item as FeedbackRecord));
}
