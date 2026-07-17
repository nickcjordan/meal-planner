import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/lib-dynamodb", () => {
  const send = vi.fn();
  return {
    DynamoDBDocumentClient: {
      from: vi.fn(() => ({ send })),
    },
    ScanCommand: vi.fn((input: unknown) => ({ input, _type: "Scan" })),
    QueryCommand: vi.fn((input: unknown) => ({ input, _type: "Query" })),
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { scanAll, queryAll, stripUndefined } from "./client.js";

function getMockSend() {
  const client = DynamoDBDocumentClient.from({} as never);
  return client.send as ReturnType<typeof vi.fn>;
}

describe("scanAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("follows LastEvaluatedKey across pages and concatenates items", async () => {
    const send = getMockSend();
    send
      .mockResolvedValueOnce({ Items: [{ id: 1 }, { id: 2 }], LastEvaluatedKey: { PK: "a" } })
      .mockResolvedValueOnce({ Items: [{ id: 3 }], LastEvaluatedKey: { PK: "b" } })
      .mockResolvedValueOnce({ Items: [{ id: 4 }] });

    const items = await scanAll({ TableName: "t" });

    expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("passes ExclusiveStartKey on subsequent pages only", async () => {
    const send = getMockSend();
    send
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { PK: "cursor" } })
      .mockResolvedValueOnce({ Items: [] });

    await scanAll({ TableName: "t" });

    const firstArg = (ScanCommand as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const secondArg = (ScanCommand as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0];
    expect(firstArg.ExclusiveStartKey).toBeUndefined();
    expect(secondArg.ExclusiveStartKey).toEqual({ PK: "cursor" });
  });

  it("returns an empty array when there are no items", async () => {
    const send = getMockSend();
    send.mockResolvedValueOnce({});
    expect(await scanAll({ TableName: "t" })).toEqual([]);
  });
});

describe("queryAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("follows LastEvaluatedKey across pages", async () => {
    const send = getMockSend();
    send
      .mockResolvedValueOnce({ Items: [{ id: 1 }], LastEvaluatedKey: { PK: "a" } })
      .mockResolvedValueOnce({ Items: [{ id: 2 }] });

    const items = await queryAll({ TableName: "t", KeyConditionExpression: "PK = :pk" });

    expect(items).toEqual([{ id: 1 }, { id: 2 }]);
    expect((QueryCommand as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });
});

describe("stripUndefined", () => {
  it("drops only keys whose value is undefined", () => {
    expect(stripUndefined({ a: 1, b: undefined, c: null, d: "" })).toEqual({
      a: 1,
      c: null,
      d: "",
    });
  });

  it("returns an empty object when everything is undefined", () => {
    expect(stripUndefined({ a: undefined, b: undefined })).toEqual({});
  });
});
