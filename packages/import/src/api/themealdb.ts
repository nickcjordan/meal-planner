import type { CreateRecipeInput, Ingredient } from "@meal-planner/types";
import { standardizeUnit } from "../ingredients.js";

const BASE_URL = "https://www.themealdb.com/api/json/v1/1";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MealDbSearchResult {
  id: string;
  name: string;
  category: string;
  area: string;
  thumbnail: string;
  tags: string[];
}

export interface MealDbRecipe extends MealDbSearchResult {
  recipe: CreateRecipeInput;
}

/** Lightweight result from filter endpoints (no category/area/tags) */
export interface MealDbFilterResult {
  id: string;
  name: string;
  thumbnail: string;
}

export interface MealDbCategory {
  name: string;
  thumbnail: string;
  description: string;
}

/**
 * List all categories with thumbnails and descriptions.
 */
export async function listCategories(): Promise<MealDbCategory[]> {
  const url = `${BASE_URL}/categories.php`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const data = (await response.json()) as any;
  if (!data.categories || !Array.isArray(data.categories)) return [];

  return data.categories.map((cat: any) => ({
    name: cat.strCategory,
    thumbnail: cat.strCategoryThumb,
    description: cat.strCategoryDescription || "",
  }));
}

/**
 * List all available cuisines/areas.
 */
export async function listAreas(): Promise<string[]> {
  const url = `${BASE_URL}/list.php?a=list`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const data = (await response.json()) as any;
  if (!data.meals || !Array.isArray(data.meals)) return [];

  return data.meals
    .map((m: any) => m.strArea as string)
    .filter(Boolean);
}

/**
 * Browse recipes by category.
 */
export async function filterByCategory(
  category: string,
): Promise<MealDbFilterResult[]> {
  const url = `${BASE_URL}/filter.php?c=${encodeURIComponent(category)}`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const data = (await response.json()) as any;
  if (!data.meals || !Array.isArray(data.meals)) return [];

  return data.meals.map((m: any) => ({
    id: m.idMeal,
    name: m.strMeal,
    thumbnail: m.strMealThumb,
  }));
}

/**
 * Browse recipes by cuisine/area.
 */
export async function filterByArea(
  area: string,
): Promise<MealDbFilterResult[]> {
  const url = `${BASE_URL}/filter.php?a=${encodeURIComponent(area)}`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const data = (await response.json()) as any;
  if (!data.meals || !Array.isArray(data.meals)) return [];

  return data.meals.map((m: any) => ({
    id: m.idMeal,
    name: m.strMeal,
    thumbnail: m.strMealThumb,
  }));
}

/**
 * Get a random recipe.
 */
export async function getRandomMeal(): Promise<MealDbRecipe | null> {
  const url = `${BASE_URL}/random.php`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const data = (await response.json()) as any;
  if (!data.meals || !Array.isArray(data.meals) || data.meals.length === 0)
    return null;

  const id = data.meals[0].idMeal;
  // Use the full lookup to get a properly mapped recipe
  return getMealDbRecipe(id);
}

/**
 * Search TheMealDB by name.
 */
export async function searchMealDb(
  queryStr: string,
): Promise<MealDbSearchResult[]> {
  const url = `${BASE_URL}/search.php?s=${encodeURIComponent(queryStr)}`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const data = (await response.json()) as any;
  const meals = data.meals;
  if (!meals || !Array.isArray(meals)) return [];

  return meals.map((meal: any) => ({
    id: meal.idMeal,
    name: meal.strMeal,
    category: meal.strCategory || "",
    area: meal.strArea || "",
    thumbnail: meal.strMealThumb || "",
    tags: meal.strTags
      ? meal.strTags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean)
      : [],
  }));
}

/**
 * Extract ingredients from TheMealDB's 20 separate ingredient/measure fields.
 */
function extractIngredients(meal: any): Ingredient[] {
  const ingredients: Ingredient[] = [];

  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];

    if (!name || !name.trim()) continue;

    const parsed = parseMeasure(measure?.trim() || "");

    ingredients.push({
      name: name.trim(),
      quantity: parsed.quantity,
      unit: parsed.unit,
    });
  }

  return ingredients;
}

/**
 * Parse a TheMealDB measure string like "2 cups" or "1/2 tsp" into quantity + unit.
 */
function parseMeasure(measure: string): { quantity: number; unit: string } {
  if (!measure) return { quantity: 1, unit: "" };

  // Try "2 1/2 cups" pattern
  const mixedMatch = measure.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const denom = parseInt(mixedMatch[3], 10);
    const frac = denom > 0 ? parseInt(mixedMatch[2], 10) / denom : 0;
    return { quantity: whole + frac, unit: standardizeUnit(mixedMatch[4].trim()) };
  }

  // Try "1/2 cups" pattern
  const fracMatch = measure.match(/^(\d+)\/(\d+)\s*(.*)/);
  if (fracMatch) {
    const denom = parseInt(fracMatch[2], 10);
    return {
      quantity: denom > 0 ? parseInt(fracMatch[1], 10) / denom : 0,
      unit: standardizeUnit(fracMatch[3].trim()),
    };
  }

  // Try "2 cups" or "200g" pattern
  const numMatch = measure.match(/^([\d.]+)\s*(.*)/);
  if (numMatch) {
    return {
      quantity: parseFloat(numMatch[1]),
      unit: standardizeUnit(numMatch[2].trim()),
    };
  }

  // Can't parse — treat as unit with quantity 1
  return { quantity: 1, unit: standardizeUnit(measure) };
}

/**
 * Split a TheMealDB instruction blob into steps.
 */
function splitInstructions(instructions: string): string[] {
  if (!instructions) return [];

  // Try splitting by numbered steps first (e.g., "1. Do this\r\n2. Do that")
  const numbered = instructions.split(/\r?\n/).filter(Boolean);
  if (numbered.length > 1) {
    return numbered
      .map((s) => s.replace(/^\d+[.)]\s*/, "").trim())
      .filter((s) => s.length > 10); // Filter out very short fragments
  }

  // Fall back to splitting by sentences/paragraphs
  return instructions
    .split(/\r?\n\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

/**
 * Fetch full recipe details from TheMealDB by ID and map to CreateRecipeInput.
 */
export async function getMealDbRecipe(
  id: string,
): Promise<MealDbRecipe | null> {
  const url = `${BASE_URL}/lookup.php?i=${encodeURIComponent(id)}`;
  const response = await fetch(url);
  if (!response.ok) return null;

  const data = (await response.json()) as any;
  const meals = data.meals;
  if (!meals || !Array.isArray(meals) || meals.length === 0) return null;

  const meal = meals[0];

  const ingredients = extractIngredients(meal);
  const steps = splitInstructions(meal.strInstructions || "");
  const tags = [
    ...(meal.strTags
      ? meal.strTags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean)
      : []),
    meal.strArea ? meal.strArea.toLowerCase() : null,
  ].filter(Boolean) as string[];

  // `complexity` is intentionally omitted so normalize()'s inference (which only
  // fires when the field is absent) runs instead of defaulting to "standard".
  const recipe = {
    name: meal.strMeal || "",
    description: `${meal.strCategory || ""} dish from ${meal.strArea || "unknown"} cuisine`,
    ingredientSections: [{ items: ingredients }],
    stepSections: [{ steps: steps.length > 0 ? steps : ["See source for instructions"] }],
    cookTime: 0, // TheMealDB doesn't provide this
    prepTime: 0,
    servings: 4, // Not provided, default
    tags: [...new Set(tags)],
    categories: [meal.strCategory?.toLowerCase() || "dinner"],
    sourceUrl: meal.strSource || undefined,
    imageUrl: meal.strMealThumb || undefined,
  } as CreateRecipeInput;

  return {
    id: meal.idMeal,
    name: meal.strMeal,
    category: meal.strCategory || "",
    area: meal.strArea || "",
    thumbnail: meal.strMealThumb || "",
    tags,
    recipe,
  };
}
