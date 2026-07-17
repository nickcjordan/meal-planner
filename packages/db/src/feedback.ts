import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { MealFeedback, CreateFeedbackInput, DynamoDBRecord } from "@meal-planner/types";
import { getDocClient, TABLE_NAME, queryAll } from "./client.js";
import { updateRecipePlanningFields } from "./recipes.js";

type FeedbackRecord = DynamoDBRecord & MealFeedback;

function fromRecord(record: FeedbackRecord): MealFeedback {
  const { PK, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...feedback } = record;
  // Backfill recipeId for legacy HISTORY rows written before it was persisted —
  // the recipe id is encoded in the item's PK (RECIPE#<id>).
  if (!feedback.recipeId && PK.startsWith("RECIPE#")) {
    feedback.recipeId = PK.slice("RECIPE#".length);
  }
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

  // Also write to recipe history for recency tracking. The SK carries the
  // recipeId suffix so two feedbacks written in the same millisecond can't
  // collide (`begins_with(SK, "HISTORY#")` readers are unaffected), and recipeId
  // is persisted so readers no longer need to backfill it from the PK.
  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `RECIPE#${input.recipeId}`,
        SK: `HISTORY#${feedback.createdAt}#${input.recipeId}`,
        entityType: "HISTORY" as const,
        recipeId: input.recipeId,
        sessionId: input.sessionId,
        wasMade: input.wasMade,
        rating: input.rating,
        comment: input.comment,
        createdAt: feedback.createdAt,
      },
    }),
  );

  // Update recipe's avgRating and lastCookedAt from history
  if (input.wasMade) {
    const history = await getRecipeHistory(input.recipeId, 20);
    const rated = history.filter((h) => h.rating != null && h.wasMade);
    const avgRating = rated.length > 0
      ? rated.reduce((sum, h) => sum + h.rating, 0) / rated.length
      : null;
    const lastCookedAt = history.find((h) => h.wasMade)?.createdAt ?? null;

    await updateRecipePlanningFields(input.recipeId, { avgRating, lastCookedAt });
  }

  return feedback;
}

export async function getFeedbackForSession(sessionId: string): Promise<MealFeedback[]> {
  const items = await queryAll({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `SESSION#${sessionId}`,
      ":prefix": "FEEDBACK#",
    },
  });

  return items.map((item) => fromRecord(item as FeedbackRecord));
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
