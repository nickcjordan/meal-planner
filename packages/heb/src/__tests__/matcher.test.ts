import { describe, it, expect } from "vitest";
import {
  diceCoefficient,
  nameSimilarity,
  selectBestCandidate,
  type MatchCandidate,
} from "../matcher.js";

describe("diceCoefficient", () => {
  it("is 1 for identical token sets", () => {
    expect(diceCoefficient(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("is 0 for disjoint sets", () => {
    expect(diceCoefficient(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("is 0 when either set is empty", () => {
    expect(diceCoefficient(new Set(), new Set(["a"]))).toBe(0);
    expect(diceCoefficient(new Set(["a"]), new Set())).toBe(0);
  });

  it("computes 2·|A∩B| / (|A|+|B|)", () => {
    // {chicken,broth} vs {chicken,noodle,soup} -> 2*1/(2+3) = 0.4
    expect(
      diceCoefficient(
        new Set(["chicken", "broth"]),
        new Set(["chicken", "noodle", "soup"]),
      ),
    ).toBeCloseTo(0.4, 10);
  });
});

describe("nameSimilarity", () => {
  it("is high for near-identical product names (case/punctuation-insensitive)", () => {
    expect(
      nameSimilarity("low sodium chicken broth", "Low-Sodium Chicken Broth"),
    ).toBeGreaterThanOrEqual(0.9);
  });

  it("treats plural and singular tokens as equal", () => {
    expect(nameSimilarity("eggs", "egg")).toBe(1);
    expect(nameSimilarity("tomatoes", "tomato")).toBe(1);
  });

  it("is 0 for completely unrelated names", () => {
    expect(nameSimilarity("chicken broth", "dish soap")).toBe(0);
  });
});

describe("selectBestCandidate (Dice match gate, threshold 0.4)", () => {
  it("returns null when no candidate clears the threshold", () => {
    const candidates: MatchCandidate[] = [
      { name: "Dish Soap", inStock: true },
      { name: "Paper Towels", inStock: true },
    ];
    expect(selectBestCandidate("low sodium chicken broth", candidates)).toBeNull();
  });

  it("returns null for an empty query (empty token set never matches)", () => {
    expect(selectBestCandidate("", [{ name: "Milk", inStock: true }])).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(selectBestCandidate("milk", [])).toBeNull();
  });

  it("accepts a candidate exactly at the 0.4 boundary", () => {
    // "chicken broth" vs "chicken noodle soup" == 0.4 (inclusive)
    const idx = selectBestCandidate("chicken broth", [
      { name: "chicken noodle soup", inStock: true },
    ]);
    expect(idx).toBe(0);
  });

  it("rejects a candidate just below the threshold", () => {
    // "chicken broth" vs "beef noodle soup" -> 0
    expect(
      selectBestCandidate("chicken broth", [
        { name: "beef noodle soup", inStock: true },
      ]),
    ).toBeNull();
  });

  it("prefers an in-stock candidate over a higher-scoring out-of-stock one", () => {
    const candidates: MatchCandidate[] = [
      { name: "Chicken Broth", inStock: false }, // score 1.0, out of stock
      { name: "Chicken Broth Organic Low Sodium", inStock: true }, // ~0.57, in stock
    ];
    expect(selectBestCandidate("chicken broth", candidates)).toBe(1);
  });

  it("falls back to the highest-scoring candidate when none are in stock", () => {
    const candidates: MatchCandidate[] = [
      { name: "Chicken Broth Organic Low Sodium", inStock: false },
      { name: "Chicken Broth", inStock: false },
    ];
    expect(selectBestCandidate("chicken broth", candidates)).toBe(1);
  });
});
