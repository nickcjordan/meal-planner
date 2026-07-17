import { PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { getDocClient, TABLE_NAME } from "@meal-planner/db";
import type { HebStoreConfig } from "@meal-planner/types";

const HEB_PK = "CONFIG#heb";

// --- Cookie persistence ---

export async function saveHebCookies(
  cookies: string,
  storeId: string,
): Promise<void> {
  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: HEB_PK,
        SK: "COOKIES",
        entityType: "HEBCONFIG" as const,
        cookies,
        storeId,
        capturedAt: new Date().toISOString(),
      },
    }),
  );
}

export async function getHebCookies(): Promise<{
  cookies: string;
  storeId: string;
  capturedAt: string;
} | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: HEB_PK, SK: "COOKIES" },
    }),
  );

  if (!result.Item) return null;
  return {
    cookies: result.Item.cookies as string,
    storeId: result.Item.storeId as string,
    capturedAt: result.Item.capturedAt as string,
  };
}

export async function deleteHebCookies(): Promise<void> {
  await getDocClient().send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: HEB_PK, SK: "COOKIES" },
    }),
  );
}

// --- Store persistence ---

export async function saveHebStore(config: HebStoreConfig): Promise<void> {
  await getDocClient().send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: HEB_PK,
        SK: "STORE",
        entityType: "HEBCONFIG" as const,
        ...config,
      },
    }),
  );
}

const DEFAULT_STORE: HebStoreConfig = {
  storeId: "790",
  storeName: "H-E-B",
  address: "",
};

/**
 * Read the stored store record, or `null` when the user has never chosen a
 * store. Callers that need to distinguish a real selection from the hardcoded
 * default (e.g. the `storeConfigured` status flag) use this; callers that just
 * need *a* store use `getHebStore`.
 */
export async function getHebStoreIfConfigured(): Promise<HebStoreConfig | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: HEB_PK, SK: "STORE" },
    }),
  );

  if (!result.Item) return null;
  return {
    storeId: result.Item.storeId as string,
    storeName: result.Item.storeName as string,
    address: result.Item.address as string,
    postalCode: result.Item.postalCode as string | undefined,
  };
}

export async function getHebStore(): Promise<HebStoreConfig> {
  return (await getHebStoreIfConfigured()) ?? DEFAULT_STORE;
}
