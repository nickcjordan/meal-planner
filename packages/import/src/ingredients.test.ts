import { describe, it, expect } from "vitest";
import { parseIngredientString, standardizeUnit } from "./ingredients.js";

describe("parseIngredientString — parenthetical container sizes", () => {
  it("parses '1 (14.5 oz) can crushed tomatoes' into a can with the size in prep", () => {
    const result = parseIngredientString("1 (14.5 oz) can crushed tomatoes");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe("can");
    expect(result.prep).toBe("14.5 oz");
    // Name is never empty even though cleanName strips "crushed" as a prep verb.
    expect(result.name.length).toBeGreaterThan(0);
    expect(result.name).toContain("tomato");
  });

  it("parses '2 (15 oz) cans black beans, drained' with a canonical container unit", () => {
    const result = parseIngredientString("2 (15 oz) cans black beans, drained");
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe("can");
    expect(result.prep).toBe("15 oz");
    expect(result.name).toBe("black beans");
  });

  it("parses '1 (6 oz) jar tomato paste'", () => {
    const result = parseIngredientString("1 (6 oz) jar tomato paste");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe("jar");
    expect(result.prep).toBe("6 oz");
    expect(result.name).toBe("tomato paste");
  });

  it("parses '1 (12 oz) package frozen spinach'", () => {
    const result = parseIngredientString("1 (12 oz) package frozen spinach");
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe("package");
    expect(result.prep).toBe("12 oz");
    expect(result.name).toBe("frozen spinach");
  });

  it("multiplies the size when no container word follows the parenthetical", () => {
    // "2 (14 oz) diced tomatoes" → 28 oz of tomatoes (no container).
    const result = parseIngredientString("2 (14 oz) tomatoes");
    expect(result.quantity).toBe(28);
    expect(result.unit).toBe("oz");
    expect(result.name.length).toBeGreaterThan(0);
  });

  it("never returns an empty name for container ingredients", () => {
    const result = parseIngredientString("1 (28 oz) can crushed tomatoes");
    expect(result.name.trim()).not.toBe("");
  });
});

describe("standardizeUnit (MealDB imports rely on this)", () => {
  it("canonicalizes plural volume units", () => {
    expect(standardizeUnit("cups")).toBe("cup");
    expect(standardizeUnit("tablespoons")).toBe("tbsp");
    expect(standardizeUnit("teaspoons")).toBe("tsp");
  });

  it("passes through unknown units unchanged", () => {
    expect(standardizeUnit("handful")).toBe("handful");
    expect(standardizeUnit("")).toBe("");
  });
});
