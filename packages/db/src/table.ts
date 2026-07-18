import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  UpdateTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
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
