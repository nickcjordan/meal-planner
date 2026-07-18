import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  UpdateTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { GSI1_NAME, GSI2_NAME } from "./client.js";

export interface CreateTableOptions {
  tableName: string;
  region?: string;
}

export async function createTableIfNotExists(options: CreateTableOptions): Promise<boolean> {
  const { tableName, region = "us-east-1" } = options;
  const client = new DynamoDBClient({ region });

  try {
    const existing = await client.send(new DescribeTableCommand({ TableName: tableName }));
    // Table predating GSI2 (planning summaries index): add it in place.
    const hasGsi2 = existing.Table?.GlobalSecondaryIndexes?.some(
      (i) => i.IndexName === GSI2_NAME,
    );
    if (!hasGsi2) {
      console.log(`Adding missing index ${GSI2_NAME} to "${tableName}"...`);
      await client.send(
        new UpdateTableCommand({
          TableName: tableName,
          AttributeDefinitions: [{ AttributeName: "GSI2PK", AttributeType: "S" }],
          GlobalSecondaryIndexUpdates: [
            {
              Create: {
                IndexName: GSI2_NAME,
                KeySchema: [
                  { AttributeName: "GSI2PK", KeyType: "HASH" },
                  { AttributeName: "PK", KeyType: "RANGE" },
                ],
                Projection: { ProjectionType: "ALL" },
              },
            },
          ],
        }),
      );
      console.log(
        `${GSI2_NAME} creation started (backfills in the background; existing recipes need GSI2PK — run "npm run backfill:planning" if recipes predate planning fields).`,
      );
    }

    // Backfill GSI2PK onto any RECIPE items that predate the planning index.
    // Creating the index does NOT populate it from items that lack the key
    // attribute, so without this the GSI2 query would succeed with [] and the
    // scan fallback in listRecipeSummaries never triggers — every recipe would
    // vanish from planning. Runs on every existing-table call; the
    // attribute_not_exists filter makes re-runs no-ops. Uses a locally-built
    // document client bound to this call's tableName (not the env-bound
    // getDocClient) so setup against an explicit table name is honored.
    const doc = DynamoDBDocumentClient.from(client);
    let backfilled = 0;
    let startKey: Record<string, unknown> | undefined;
    do {
      const scan = await doc.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "entityType = :t AND attribute_not_exists(GSI2PK)",
          ExpressionAttributeValues: { ":t": "RECIPE" },
          ProjectionExpression: "PK, SK",
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );
      for (const item of scan.Items ?? []) {
        await doc.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { PK: item.PK as string, SK: item.SK as string },
            UpdateExpression: "SET GSI2PK = :r",
            ExpressionAttributeValues: { ":r": "RECIPES" },
          }),
        );
        backfilled++;
      }
      startKey = scan.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (startKey);
    if (backfilled > 0) {
      console.log(`Backfilled GSI2PK on ${backfilled} recipe item(s) in "${tableName}".`);
    }

    return false; // table already existed
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) {
      throw err;
    }
  }

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
        { AttributeName: "GSI2PK", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: GSI1_NAME,
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: GSI2_NAME,
          KeySchema: [
            { AttributeName: "GSI2PK", KeyType: "HASH" },
            { AttributeName: "PK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );

  await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: tableName });

  return true; // table was created
}
