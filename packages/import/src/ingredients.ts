import type { Ingredient } from "@meal-planner/types";

/**
 * Known units mapped to their canonical form.
 * Keys are lowercase variants, values are the standardized unit string.
 */
const UNIT_MAP: Record<string, string> = {
  // Volume
  cup: "cup",
  cups: "cup",
  c: "cup",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  tbs: "tbsp",
  tb: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  "fl oz": "fl oz",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  l: "L",
  milliliter: "ml",
  milliliters: "ml",
  ml: "ml",
  gallon: "gallon",
  gallons: "gallon",
  quart: "quart",
  quarts: "quart",
  qt: "quart",
  pint: "pint",
  pints: "pint",
  pt: "pint",

  // Weight
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  gram: "g",
  grams: "g",
  g: "g",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",

  // Count / other
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  pinch: "pinch",
  dash: "dash",
  bunch: "bunch",
  bunches: "bunch",
  sprig: "sprig",
  sprigs: "sprig",
  head: "head",
  heads: "head",
  stalk: "stalk",
  stalks: "stalk",
  stick: "stick",
  sticks: "stick",
  package: "package",
  packages: "package",
  pkg: "package",
  jar: "jar",
  jars: "jar",
  bag: "bag",
  bags: "bag",
  box: "box",
  boxes: "box",
  large: "large",
  medium: "medium",
  small: "small",
  whole: "whole",
};

/** Words written as numbers */
const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  half: 0.5,
  quarter: 0.25,
};

/** Common unicode fractions */
const UNICODE_FRACTIONS: Record<string, number> = {
  "\u00BC": 0.25, // 1/4
  "\u00BD": 0.5, // 1/2
  "\u00BE": 0.75, // 3/4
  "\u2153": 0.333, // 1/3
  "\u2154": 0.667, // 2/3
  "\u215B": 0.125, // 1/8
  "\u215C": 0.375, // 3/8
  "\u215D": 0.625, // 5/8
  "\u215E": 0.875, // 7/8
};

/** Prep-note words to strip from the end of ingredient names */
const PREP_NOTES =
  /,?\s*\b(chopped|diced|minced|sliced|grated|shredded|crushed|melted|softened|divided|packed|sifted|peeled|deveined|trimmed|thawed|drained|rinsed|cubed|julienned|halved|quartered|optional|to taste|for garnish|for serving|at room temperature)\b.*$/i;

/**
 * Parse a fraction string like "1/2" into a number.
 */
function parseFraction(str: string): number | null {
  const match = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  const denom = parseInt(match[2], 10);
  if (denom === 0) return null;
  return parseInt(match[1], 10) / denom;
}

/**
 * Parse a quantity from the start of a string.
 * Handles: "2", "2.5", "1/2", "1 1/2", unicode fractions, word numbers.
 * Returns [quantity, remainingString] or null if no quantity found.
 */
function parseQuantity(text: string): [number, string] | null {
  const remaining = text.trim();

  // Check for unicode fractions at the start
  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (remaining.startsWith(char)) {
      return [val, remaining.slice(char.length).trim()];
    }
  }

  // Pattern: "2 1/2" (whole + fraction) or "1/2" (just fraction) or "2.5" or "2"
  const mixedMatch = remaining.match(
    /^(\d+)\s+(\d+)\s*\/\s*(\d+)(?:\s+|$|-)/,
  );
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const denom = parseInt(mixedMatch[3], 10);
    if (denom !== 0) {
      const frac = parseInt(mixedMatch[2], 10) / denom;
      return [whole + frac, remaining.slice(mixedMatch[0].length).trim()];
    }
  }

  const fractionMatch = remaining.match(/^(\d+)\s*\/\s*(\d+)(?:\s+|$|-)/);
  if (fractionMatch) {
    const val = parseFraction(fractionMatch[1] + "/" + fractionMatch[2]);
    if (val !== null) {
      return [val, remaining.slice(fractionMatch[0].length).trim()];
    }
  }

  const decimalMatch = remaining.match(/^(\d+\.?\d*)(?:\s+|$|-)/);
  if (decimalMatch) {
    return [
      parseFloat(decimalMatch[1]),
      remaining.slice(decimalMatch[0].length).trim(),
    ];
  }

  // Word numbers: "one", "two", "half"
  const firstWord = remaining.split(/\s+/)[0].toLowerCase();
  if (firstWord in WORD_NUMBERS) {
    return [
      WORD_NUMBERS[firstWord],
      remaining.slice(firstWord.length).trim(),
    ];
  }

  return null;
}

/**
 * Try to match a unit from the start of a string.
 * Returns [canonicalUnit, remainingString] or null.
 */
function parseUnit(text: string): [string, string] | null {
  const lower = text.toLowerCase();

  // Handle parenthetical sizes: "(14.5 oz)" or "(14-oz)"
  const parenMatch = lower.match(
    /^\((\d+\.?\d*)\s*-?\s*([a-z]+\.?)\)\s*/,
  );
  if (parenMatch) {
    const innerUnit = parenMatch[2].replace(".", "");
    const canonical = UNIT_MAP[innerUnit];
    if (canonical) {
      return [canonical, text.slice(parenMatch[0].length).trim()];
    }
  }

  // Try matching multi-word units first, then single-word
  const words = text.split(/\s+/);
  for (let len = Math.min(2, words.length); len >= 1; len--) {
    const candidate = words
      .slice(0, len)
      .join(" ")
      .toLowerCase()
      .replace(/\.$/, "");
    if (candidate in UNIT_MAP) {
      const matched = words.slice(0, len).join(" ");
      return [UNIT_MAP[candidate], text.slice(matched.length).trim()];
    }
  }

  return null;
}

/**
 * Clean up the ingredient name by stripping prep notes and extra whitespace.
 */
function cleanName(name: string): string {
  return name
    .replace(PREP_NOTES, "")
    .replace(/^\s*of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a single ingredient string like "2 cups all-purpose flour, sifted"
 * into a structured Ingredient object.
 */
export function parseIngredientString(raw: string): Ingredient {
  const text = raw.trim();

  // Handle "to taste" items
  if (/to taste/i.test(text)) {
    const name = text.replace(/,?\s*to taste\s*/i, "").trim();
    return { name: cleanName(name) || text, quantity: 0, unit: "to taste" };
  }

  // Handle "for garnish" / "for serving"
  if (/for (garnish|serving)/i.test(text)) {
    const name = text.replace(/,?\s*for (garnish|serving)\s*/i, "").trim();
    return { name: cleanName(name) || text, quantity: 0, unit: "" };
  }

  // Try to parse quantity
  const qtyResult = parseQuantity(text);
  if (!qtyResult) {
    // No quantity found — treat entire string as name with quantity 1
    return { name: cleanName(text), quantity: 1, unit: "" };
  }

  const [quantity, afterQty] = qtyResult;

  // Handle parenthetical size embedded in quantity: "1 (14.5 oz) can"
  const parenSizeMatch = afterQty.match(
    /^\((\d+\.?\d*)\s*-?\s*([a-z]+\.?)\)\s*/i,
  );
  if (parenSizeMatch) {
    const afterParen = afterQty.slice(parenSizeMatch[0].length).trim();
    // Try to get the container unit after the paren
    const containerUnit = parseUnit(afterParen);
    if (containerUnit) {
      const [, afterContainerUnit] = containerUnit;
      return {
        name: cleanName(afterContainerUnit),
        quantity,
        unit: parenSizeMatch[2].replace(".", "").toLowerCase(),
      };
    }
    return {
      name: cleanName(afterParen),
      quantity: parseFloat(parenSizeMatch[1]) * quantity,
      unit:
        UNIT_MAP[parenSizeMatch[2].replace(".", "").toLowerCase()] ||
        parenSizeMatch[2].replace(".", ""),
    };
  }

  // Try to parse unit
  const unitResult = parseUnit(afterQty);
  if (unitResult) {
    const [unit, afterUnit] = unitResult;
    return { name: cleanName(afterUnit) || afterQty, quantity, unit };
  }

  // No recognized unit — treat remaining as name
  return { name: cleanName(afterQty), quantity, unit: "" };
}

/**
 * Standardize a unit string to its canonical form.
 */
export function standardizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim().replace(/\.$/, "");
  return UNIT_MAP[lower] || unit;
}
