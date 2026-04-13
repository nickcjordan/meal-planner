import { findRecipeBySourceUrl, listRecipes } from "@meal-planner/db";
import type { DedupMatch } from "./types.js";

/**
 * Normalize a recipe name for fuzzy comparison.
 * Strips punctuation, lowercases, collapses whitespace.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple string similarity using Dice coefficient on bigrams.
 * Returns a value between 0 and 1.
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) {
    bigramsA.add(a.substring(i, i + 2));
  }

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) {
    bigramsB.add(b.substring(i, i + 2));
  }

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

const SIMILARITY_THRESHOLD = 0.85;

/**
 * Check for duplicate recipes by source URL and fuzzy name matching.
 */
export async function checkDuplicates(
  name: string,
  sourceUrl?: string,
): Promise<DedupMatch[]> {
  const matches: DedupMatch[] = [];

  // 1. Exact sourceUrl match
  if (sourceUrl) {
    const existing = await findRecipeBySourceUrl(sourceUrl);
    if (existing) {
      matches.push({ type: "exact_url", existingRecipe: existing });
      return matches; // Exact URL match is definitive
    }
  }

  // 2. Fuzzy name match
  if (name) {
    const normalizedName = normalizeName(name);
    if (!normalizedName) return matches;

    const allRecipes = await listRecipes();
    for (const recipe of allRecipes) {
      const normalizedExisting = normalizeName(recipe.name);
      const sim = similarity(normalizedName, normalizedExisting);
      if (sim >= SIMILARITY_THRESHOLD) {
        matches.push({
          type: "fuzzy_name",
          existingRecipe: recipe,
          similarity: sim,
        });
      }
    }
  }

  return matches;
}
