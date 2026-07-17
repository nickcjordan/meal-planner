import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  type ScanCommandInput,
  type QueryCommandInput,
  type ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";

/** The item shape DynamoDB returns — callers cast each item to their record type. */
type DynamoItems = NonNullable<ScanCommandOutput["Items"]>;

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? "meal-planner-dev";
const GSI1_NAME = "GSI1";
const GSI2_NAME = "GSI2";

let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

/**
 * Run a Scan and follow `LastEvaluatedKey` until the table is exhausted,
 * accumulating every matching item. Use instead of a single-shot `ScanCommand`
 * so results are never silently truncated at the 1 MB page boundary.
 */
export async function scanAll(input: ScanCommandInput): Promise<DynamoItems> {
  const items: DynamoItems = [];
  let lastKey: ScanCommandOutput["LastEvaluatedKey"];

  do {
    const result = await getDocClient().send(
      new ScanCommand({
        ...input,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }),
    );
    for (const item of result.Items ?? []) {
      items.push(item);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

/**
 * Run a Query and follow `LastEvaluatedKey` until the partition/index is
 * exhausted, accumulating every matching item. Use instead of a single-shot
 * `QueryCommand` when the caller wants the full result set (i.e. no bounded
 * `Limit` semantics).
 */
export async function queryAll(input: QueryCommandInput): Promise<DynamoItems> {
  const items: DynamoItems = [];
  let lastKey: ScanCommandOutput["LastEvaluatedKey"];

  do {
    const result = await getDocClient().send(
      new QueryCommand({
        ...input,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }),
    );
    for (const item of result.Items ?? []) {
      items.push(item);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

/**
 * Drop keys whose value is `undefined` so a partial-update spread
 * (`{ ...existing, ...updates }`) can never erase a stored field. Note that
 * the document client marshals with `removeUndefinedValues: true`, so an
 * `undefined` that survives into the merged object deletes the attribute from
 * the item entirely — this guard is what preserves existing values.
 */
export function stripUndefined<T extends Record<string, unknown>>(
  obj: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export { getDocClient, TABLE_NAME, GSI1_NAME, GSI2_NAME };
