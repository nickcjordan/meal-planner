import * as cheerio from "cheerio";
import type { CreateRecipeInput, NutritionalInfo, StepSection } from "@meal-planner/types";
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
 * Extract a flat list of step strings from a HowToStep array or mixed content.
 */
function extractFlatSteps(instructions: any): string[] {
  if (!instructions) return [];
  if (typeof instructions === "string") {
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
        }
      }
    }
    return steps.filter(Boolean);
  }
  return [];
}

/**
 * Extract step sections from the polymorphic recipeInstructions field.
 * Preserves HowToSection headers when present.
 * Can be: string, string[], HowToStep[], HowToSection[], or mixed.
 */
function extractStepSections(instructions: any): StepSection[] {
  if (!instructions) return [{ steps: [] }];
  if (typeof instructions === "string") {
    const steps = instructions
      .split(/\n+|\.\s+(?=\d)/)
      .map((s: string) => s.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
    return [{ steps }];
  }
  if (Array.isArray(instructions)) {
    const sections: StepSection[] = [];
    const looseParts: string[] = [];

    for (const item of instructions) {
      if (typeof item === "string") {
        looseParts.push(item.trim());
      } else if (item && typeof item === "object") {
        if (
          item["@type"] === "HowToSection" ||
          item.type === "HowToSection"
        ) {
          // Flush any loose steps before this section
          if (looseParts.length > 0) {
            sections.push({ steps: looseParts.filter(Boolean) });
            looseParts.length = 0;
          }
          const sectionSteps = extractFlatSteps(item.itemListElement);
          if (sectionSteps.length > 0) {
            sections.push({
              header: (item.name || "").trim() || undefined,
              steps: sectionSteps,
            });
          }
        } else if (
          item["@type"] === "HowToStep" ||
          item.type === "HowToStep"
        ) {
          looseParts.push((item.text || item.name || "").trim());
        }
      }
    }

    // Flush remaining loose steps
    if (looseParts.length > 0) {
      sections.push({ steps: looseParts.filter(Boolean) });
    }

    return sections.length > 0 ? sections : [{ steps: [] }];
  }
  return [{ steps: [] }];
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

  // Build the recipe. `complexity` is intentionally omitted so that
  // normalize()'s inference (which only fires when the field is absent) can run
  // instead of everything being hardcoded to "standard".
  const recipe = {
    name: (data.name || "").trim(),
    description: (data.description || "").trim(),
    ingredientSections: [{ items: ingredients }],
    stepSections: extractStepSections(data.recipeInstructions),
    cookTime: parseIsoDuration(data.cookTime),
    prepTime: parseIsoDuration(data.prepTime),
    servings: parseRecipeYield(data.recipeYield),
    tags: extractTags(data),
    categories: extractCategories(data),
    nutritionalInfo: extractNutrition(data.nutrition),
    sourceUrl: pageUrl,
  } as CreateRecipeInput;

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
