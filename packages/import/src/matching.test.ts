import { describe, it, expect } from "vitest";
import { normalizeTokens, namesMatchExact, nameIsSubset } from "./matching.js";

describe("normalizeTokens", () => {
  it("lowercases, strips punctuation, and splits on whitespace", () => {
    expect(normalizeTokens("Flat-Leaf Parsley")).toEqual(["flat", "leaf", "parsley"]);
  });

  it("singularizes trailing s/es", () => {
    expect(normalizeTokens("eggs")).toEqual(["egg"]);
    expect(normalizeTokens("tomatoes")).toEqual(["tomato"]);
    expect(normalizeTokens("olives")).toEqual(["olive"]);
  });

  it("does not strip a plural from words ending in ss", () => {
    expect(normalizeTokens("glass")).toEqual(["glass"]);
  });

  it("removes modifier stoplist words", () => {
    expect(normalizeTokens("extra virgin olive oil")).toEqual(["olive", "oil"]);
    expect(normalizeTokens("fresh organic boneless skinless chicken")).toEqual(["chicken"]);
  });

  it("returns an empty array for empty or stoplist-only names", () => {
    expect(normalizeTokens("")).toEqual([]);
    expect(normalizeTokens("   ")).toEqual([]);
    expect(normalizeTokens("fresh organic")).toEqual([]);
  });
});

describe("namesMatchExact (destructive contexts)", () => {
  it("matches olive oil against extra virgin olive oil", () => {
    expect(namesMatchExact("olive oil", "extra virgin olive oil")).toBe(true);
  });

  it("matches across plural forms", () => {
    expect(namesMatchExact("egg", "eggs")).toBe(true);
    expect(namesMatchExact("shallot", "shallots")).toBe(true);
  });

  it("does NOT match milk against coconut milk", () => {
    expect(namesMatchExact("milk", "coconut milk")).toBe(false);
  });

  it("does NOT match egg against eggplant", () => {
    expect(namesMatchExact("egg", "eggplant")).toBe(false);
  });

  it("does NOT match ice against rice", () => {
    expect(namesMatchExact("ice", "rice")).toBe(false);
    expect(namesMatchExact("ice", "juice")).toBe(false);
  });

  it("never matches an empty token set", () => {
    expect(namesMatchExact("", "milk")).toBe(false);
    expect(namesMatchExact("milk", "")).toBe(false);
    expect(namesMatchExact("", "")).toBe(false);
    expect(namesMatchExact("fresh organic", "chicken")).toBe(false);
  });
});

describe("nameIsSubset (display-only contexts)", () => {
  it("treats milk as a subset of coconut milk", () => {
    expect(nameIsSubset("milk", "coconut milk")).toBe(true);
  });

  it("is directional", () => {
    expect(nameIsSubset("coconut milk", "milk")).toBe(false);
  });

  it("does NOT treat egg as a subset of eggplant", () => {
    expect(nameIsSubset("egg", "eggplant")).toBe(false);
  });

  it("matches exact token sets", () => {
    expect(nameIsSubset("olive oil", "extra virgin olive oil")).toBe(true);
  });

  it("never matches an empty token set", () => {
    expect(nameIsSubset("", "milk")).toBe(false);
    expect(nameIsSubset("milk", "")).toBe(false);
  });
});
