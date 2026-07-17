import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { getDocClient, TABLE_NAME } from "./client.js";
import { randomUUID } from "crypto";

/** A single line recorded as purchased when a grocery list's checked items are cleared. */
export interface PurchaseLogItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
}

/**
 * Record a batch of purchased items so purchase-pattern analytics survive the
 * clear-checked action (which deletes the grocery items themselves). Writes one
 * PURCHASELOG entity per clear event: PK `PURCHASELOG#<uuid>`, SK `META`.
 * No-ops on an empty batch so we never write an empty log.
 */
export async function recordPurchases(
  items: PurchaseLogItem[],
  clearedAt: string,
): Promise<void> {
  if (items.length === 0) return;

  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `PURCHASELOG#${randomUUID()}`,
        SK: "META",
        entityType: "PURCHASELOG" as const,
        clearedAt,
        items,
      },
    }),
  );
}
