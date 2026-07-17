import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/lib-dynamodb", () => {
  const send = vi.fn();
  return {
    DynamoDBDocumentClient: {
      from: vi.fn(() => ({ send })),
    },
    PutCommand: vi.fn((input: unknown) => ({ input, _type: "Put" })),
    GetCommand: vi.fn((input: unknown) => ({ input, _type: "Get" })),
    DeleteCommand: vi.fn((input: unknown) => ({ input, _type: "Delete" })),
    QueryCommand: vi.fn((input: unknown) => ({ input, _type: "Query" })),
    ScanCommand: vi.fn((input: unknown) => ({ input, _type: "Scan" })),
    BatchGetCommand: vi.fn((input: unknown) => ({ input, _type: "BatchGet" })),
    UpdateCommand: vi.fn((input: unknown) => ({ input, _type: "Update" })),
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { saveFeedback, getRecipeHistory } from "./feedback.js";

function getMockSend() {
  const client = DynamoDBDocumentClient.from({} as never);
  return client.send as ReturnType<typeof vi.fn>;
}

describe("getRecipeHistory — legacy recipeId backfill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("backfills recipeId from the PK for legacy HISTORY rows that lack it", async () => {
    const send = getMockSend();
    send.mockResolvedValueOnce({
      Items: [
        // Legacy row — no recipeId persisted
        {
          PK: "RECIPE#abc123",
          SK: "HISTORY#2026-01-01T00:00:00.000Z",
          entityType: "HISTORY",
          sessionId: "s1",
          wasMade: true,
          rating: 4,
          comment: "good",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        // New row — recipeId already present
        {
          PK: "RECIPE#abc123",
          SK: "HISTORY#2026-02-01T00:00:00.000Z#abc123",
          entityType: "HISTORY",
          recipeId: "abc123",
          sessionId: "s2",
          wasMade: true,
          rating: 5,
          comment: "great",
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    });

    const history = await getRecipeHistory("abc123", 10);

    expect(history).toHaveLength(2);
    expect(history[0].recipeId).toBe("abc123");
    expect(history[1].recipeId).toBe("abc123");
  });
});

describe("saveFeedback — HISTORY row shape", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the HISTORY row with recipeId and a recipeId-suffixed SK", async () => {
    const send = getMockSend();
    send.mockResolvedValue({});

    await saveFeedback({
      sessionId: "s1",
      recipeId: "abc123",
      wasMade: false,
      rating: 0,
      comment: "",
    });

    const putCalls = (PutCommand as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const historyItem = putCalls
      .map((c) => c[0].Item)
      .find((item) => item.entityType === "HISTORY");

    expect(historyItem.recipeId).toBe("abc123");
    expect(historyItem.SK).toMatch(/^HISTORY#.*#abc123$/);
  });
});
