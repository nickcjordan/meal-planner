import * as cheerio from "cheerio";
import type { CreateRecipeInput, NutritionalInfo } from "@meal-planner/types";
import { parseIngredientString } from "../ingredients.js";
import { parseIsoDuration, parseRecipeYield } from "./duration.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Result from JSON-LD extraction — a partial recipe plus metadata.
 */
export interface JsonLdResult {
  recipe: CreateRecipeInput;
  imageUrl?: string;
}

/**
 * Find Recipe-typed JSON-LD objects within parsed JSON-LD data.
 * Handles direct objects, arrays, and @graph arrays.
 */
function findRecipeObjects(data: any): any[] {
  const results: any[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      results.push(...findRecipeObjects(item));
    }
  } else if (data && typeof data === "object") {
    const type = data["@type"];
    const isRecipe = Array.isArray(type)
      ? type.includes("Recipe")
      : type === "Recipe";
    if (isRecipe) {
      results.push(data);
    }
    if (data["@graph"]) {
      results.push(...findRecipeObjects(data["@graph"]));
    }
  }

  return results;
}

/**
 * Extract the image URL from the polymorphic schema.org image field.
 * Can be a string, array of strings, or ImageObject(s).
 */
function extractImageUrl(image: any): string | undefined {
  if (!image) return undefined;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return extractImageUrl(image[0]);
  if (typeof image === "object" && image.url) return image.url;
  return undefined;
}

/**
 * Extract steps from the polymorphic recipeInstructions field.
 * Can be: string, string[], HowToStep[], HowToSection[], or mixed.
 */
function extractSteps(instructions: any): string[] {
  if (!instructions) return [];
  if (typeof instructions === "string") {
    // Split a text blob into steps by newlines or numbered patterns
    return instructions
      .split(/\n+|\.\s+(?=\d)/)
      .map((s: string) => s.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
  }
  if (Array.isArray(instructions)) {
    const steps: string[] = [];
    for (const item of instructions) {
      if (typeof item === "string") {
        steps.push(item.trim());
      } else if (item && typeof item === "object") {
        if (
          item["@type"] === "HowToStep" ||
          item.type === "HowToStep"
        ) {
          steps.push((item.text || item.name || "").trim());
        } else if (
          item["@type"] === "HowToSection" ||
          item.type === "HowToSection"
        ) {
          // HowToSection contains nested itemListElement of HowToSteps
          if (item.itemListElement) {
            steps.push(...extractSteps(item.itemListElement));
          }
        }
      }
    }
    return steps.filter(Boolean);
  }
  return [];
}

/**
 * Extract tags from keywords, recipeCuisine, and recipeCategory fields.
 */
function extractTags(data: any): string[] {
  const tags: string[] = [];

  const addValues = (val: any) => {
    if (!val) return;
    if (typeof val === "string") {
      // Could be comma-separated
      tags.push(
        ...val
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );
    } else if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "string") {
          tags.push(v.trim().toLowerCase());
        }
      }
    }
  };

  addValues(data.keywords);
  addValues(data.recipeCuisine);

  return [...new Set(tags)];
}

/**
 * Extract categories from recipeCategory.
 */
function extractCategories(data: any): string[] {
  const cats: string[] = [];
  const val = data.recipeCategory;
  if (!val) return ["dinner"]; // reasonable default
  if (typeof val === "string") {
    cats.push(
      ...val
        .split(",")
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  } else if (Array.isArray(val)) {
    for (const v of val) {
      if (typeof v === "string") {
        cats.push(v.trim().toLowerCase());
      }
    }
  }
  return [...new Set(cats)];
}

/**
 * Extract a numeric value from a nutrition string like "240 calories" or "12g".
 */
function parseNutritionValue(val: any): number | undefined {
  if (val == null) return undefined;
  if (typeof val === "number") return val;
  const match = String(val).match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : undefined;
}

/**
 * Extract nutritional info from the nutrition object.
 */
function extractNutrition(nutrition: any): NutritionalInfo | undefined {
  if (!nutrition || typeof nutrition !== "object") return undefined;

  const info: NutritionalInfo = {
    calories: parseNutritionValue(nutrition.calories),
    protein: parseNutritionValue(nutrition.proteinContent),
    carbs: parseNutritionValue(nutrition.carbohydrateContent),
    fat: parseNutritionValue(nutrition.fatContent),
    fiber: parseNutritionValue(nutrition.fiberContent),
    sodium: parseNutritionValue(nutrition.sodiumContent),
  };

  // Only return if at least one field has a value
  const hasValue = Object.values(info).some((v) => v !== undefined);
  return hasValue ? info : undefined;
}

/**
 * Parse JSON-LD Recipe data from an HTML string.
 * Returns the extracted recipe or null if no Recipe JSON-LD is found.
 */
export function parseJsonLd(
  html: string,
  pageUrl: string,
): JsonLdResult | null {
  const $ = cheerio.load(html);

  // Collect all JSON-LD scripts
  const jsonLdScripts = $('script[type="application/ld+json"]');
  const recipeObjects: any[] = [];

  jsonLdScripts.each((_, el) => {
    try {
      const text = $(el).text();
      const data = JSON.parse(text);
      recipeObjects.push(...findRecipeObjects(data));
    } catch {
      // Invalid JSON — skip
    }
  });

  if (recipeObjects.length === 0) return null;

  const data = recipeObjects[0]; // Take the first Recipe found

  // Parse ingredients
  const rawIngredients: string[] = data.recipeIngredient || [];
  const ingredients = rawIngredients.map(parseIngredientString);

  // Build the recipe
  const recipe: CreateRecipeInput = {
    name: (data.name || "").trim(),
    description: (data.description || "").trim(),
    ingredients,
    steps: extractSteps(data.recipeInstructions),
    cookTime: parseIsoDuration(data.cookTime),
    prepTime: parseIsoDuration(data.prepTime),
    servings: parseRecipeYield(data.recipeYield),
    tags: extractTags(data),
    categories: extractCategories(data),
    complexity: "standard", // Will be overridden by normalize()
    nutritionalInfo: extractNutrition(data.nutrition),
    sourceUrl: pageUrl,
  };

  // Extract image
  let imageUrl = extractImageUrl(data.image);

  // Fallback to og:image if no image in JSON-LD
  if (!imageUrl) {
    imageUrl =
      $('meta[property="og:image"]').attr("content") || undefined;
  }

  return { recipe, imageUrl };
}

/**
 * Extract the visible text content from HTML for fallback parsing.
 * Strips navigation, footer, sidebar, ads, and scripts.
 */
export function extractPageText(html: string): string {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $(
    "nav, footer, header, aside, .sidebar, .nav, .footer, .header, .ad, .ads, .advertisement, script, style, noscript, iframe",
  ).remove();

  // Get text content
  const text = $("body").text();

  // Clean up whitespace
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 10000); // Limit to ~10k chars for Claude
}
