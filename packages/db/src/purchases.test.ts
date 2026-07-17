import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/lib-dynamodb", () => {
  const send = vi.fn();
  return {
    DynamoDBDocumentClient: {
      from: vi.fn(() => ({ send })),
    },
    ScanCommand: vi.fn((input: unknown) => ({ input, _type: "Scan" })),
    QueryCommand: vi.fn((input: unknown) => ({ input, _type: "Query" })),
    PutCommand: vi.fn((input: unknown) => ({ input, _type: "Put" })),
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getPurchasePatterns, getSmartPromotionCandidates } from "./purchases.js";

function getMockSend() {
  const client = DynamoDBDocumentClient.from({} as never);
  return client.send as ReturnType<typeof vi.fn>;
}

/** Route each scan to items keyed by the entityType filter it carries. */
function mockByEntityType(map: Record<string, unknown[]>) {
  const send = getMockSend();
  send.mockImplementation((cmd: { input?: { ExpressionAttributeValues?: Record<string, unknown> } }) => {
    const type = cmd.input?.ExpressionAttributeValues?.[":type"] as string | undefined;
    return Promise.resolve({ Items: (type && map[type]) || [] });
  });
}

describe("getPurchasePatterns — distinct-week aggregation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts occurrences as distinct weeks and collapses same-week purchases", async () => {
    mockByEntityType({
      PURCHASELOG: [
        // Week of 2026-07-06 (Monday)
        {
          PK: "PURCHASELOG#1",
          SK: "META",
          entityType: "PURCHASELOG",
          clearedAt: "2026-07-06T10:00:00.000Z",
          items: [
            { name: "Milk", quantity: 1, unit: "gal", category: "dairy" },
            { name: "Eggs", quantity: 12, unit: "ct", category: "dairy" },
          ],
        },
        // Same week (Wed) — eggs purchased again; must NOT double-count
        {
          PK: "PURCHASELOG#2",
          SK: "META",
          entityType: "PURCHASELOG",
          clearedAt: "2026-07-08T12:00:00.000Z",
          items: [{ name: "eggs", quantity: 12, unit: "ct", category: "dairy" }],
        },
        // Week of 2026-07-13 — milk again in a new week
        {
          PK: "PURCHASELOG#3",
          SK: "META",
          entityType: "PURCHASELOG",
          clearedAt: "2026-07-13T10:00:00.000Z",
          items: [{ name: "milk", quantity: 1, unit: "gal", category: "dairy" }],
        },
      ],
    });

    const patterns = await getPurchasePatterns(8);

    const milk = patterns.find((p) => p.itemName === "milk");
    const eggs = patterns.find((p) => p.itemName === "eggs");

    expect(milk?.occurrences).toBe(2); // two distinct weeks
    expect(eggs?.occurrences).toBe(1); // one week, despite two purchases
    expect(milk?.totalWeeks).toBe(2); // two distinct weeks in the window
    expect(milk?.lastPurchasedWeekOf).toBe("2026-07-13");
    // Sorted by occurrences descending
    expect(patterns[0].itemName).toBe("milk");
  });

  it("merges legacy SHOPLIST checked items across sources by distinct week", async () => {
    mockByEntityType({
      PURCHASELOG: [
        {
          PK: "PURCHASELOG#1",
          SK: "META",
          entityType: "PURCHASELOG",
          clearedAt: "2026-07-06T10:00:00.000Z",
          items: [{ name: "milk", quantity: 1, unit: "gal", category: "dairy" }],
        },
      ],
      SESSION: [
        {
          PK: "SESSION#s1",
          SK: "SESSION#s1",
          entityType: "SESSION",
          id: "s1",
          weekOf: "2026-07-13",
          meals: [],
          status: "confirmed",
          createdAt: "2026-07-13",
          updatedAt: "2026-07-13",
        },
      ],
      SHOPLIST: [
        {
          PK: "SESSION#s1",
          SK: "SHOPLIST#s1",
          entityType: "SHOPLIST",
          sessionId: "s1",
          items: [
            { name: "Milk", quantity: 1, unit: "gal", category: "dairy", checked: true, recipeIds: [] },
            { name: "unchecked thing", quantity: 1, unit: "ea", category: "other", checked: false, recipeIds: [] },
          ],
          createdAt: "2026-07-13",
          updatedAt: "2026-07-13",
        },
      ],
    });

    const patterns = await getPurchasePatterns(8);
    const milk = patterns.find((p) => p.itemName === "milk");

    expect(milk?.occurrences).toBe(2); // one week from PURCHASELOG, one from SHOPLIST
    // Unchecked items are ignored
    expect(patterns.find((p) => p.itemName === "unchecked thing")).toBeUndefined();
  });
});

describe("getSmartPromotionCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns non-staple items meeting the distinct-week threshold", async () => {
    mockByEntityType({
      PURCHASELOG: [
        {
          PK: "PURCHASELOG#1",
          SK: "META",
          entityType: "PURCHASELOG",
          clearedAt: "2026-07-06T10:00:00.000Z",
          items: [{ name: "milk", quantity: 1, unit: "gal", category: "dairy" }],
        },
        {
          PK: "PURCHASELOG#2",
          SK: "META",
          entityType: "PURCHASELOG",
          clearedAt: "2026-07-13T10:00:00.000Z",
          items: [
            { name: "milk", quantity: 1, unit: "gal", category: "dairy" },
            { name: "one-off", quantity: 1, unit: "ea", category: "other" },
          ],
        },
      ],
    });

    const candidates = await getSmartPromotionCandidates(8, 2);

    expect(candidates.map((c) => c.itemName)).toEqual(["milk"]);
  });
});
