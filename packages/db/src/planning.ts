/**
 * Planning candidates — server-side recipe filtering, scoring, and context
 * assembly for the get_planning_candidates tool.
 */

import type {
  Recipe,
  FamilyPreference,
  FamilyMember,
} from "@meal-planner/types";
import { listRecipeSummaries, getRecipesBatch } from "./recipes.js";
import type { RecipeSummary } from "./recipes.js";
import { getRecentSessions } from "./sessions.js";
import { listPreferences } from "./preferences.js";
import { listFamilyMembers } from "./members.js";
import { listPantryItems } from "./pantry.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlanningCandidate {
  id: string;
  name: string;
  description: string;
  complexity: Recipe["complexity"];
  tags: string[];
  primaryProtein?: string;
  cuisineType?: string;
  prepTime: number;
  cookTime: number;
  totalTime: number;
  servings: number;
  avgRating: number | null;
  lastCookedAt: string | null;
  score: number;
  ingredientSections: Recipe["ingredientSections"];
}

export interface PlanningContext {
  familyMembers: { name: string; role?: string; isActive: boolean }[];
  activeFamilySize: number;
  recentHistory: { weekOf: string; recipeId: string; recipeName: string }[];
  restrictions: string[];
  scheduleConstraints: { day: string; note: string }[];
  preferredCuisines: string[];
  likedIngredients: string[];
  dislikedIngredients: string[];
  pantryItemNames: string[];
}

export interface PlanningCandidatesResult {
  candidates: PlanningCandidate[];
  context: PlanningContext;
}

// ─── Restriction matching ────────────────────────────────────────────────────

/** False-positive exclusions: terms that contain a restricted keyword but aren't related */
const RESTRICTION_EXCLUSIONS: Record<string, string[]> = {
  milk: ["coconut milk", "milk chocolate", "milkweed"],
  nuts: ["nutmeg", "butternut", "doughnuts", "coconut"],
  egg: ["eggplant", "eggnog"],
  soy: ["soybean oil"], // soybean oil is generally safe for soy allergies
  wheat: ["buckwheat"],
  fish: ["fishcake", "swedish fish"],
};

function ingredientMatchesRestriction(
  ingredientName: string,
  restriction: string,
): boolean {
  const lower = ingredientName.toLowerCase();
  const restrictLower = restriction.toLowerCase();

  // Check if ingredient name contains the restricted term
  if (!lower.includes(restrictLower)) return false;

  // Check false-positive exclusions
  const exclusions = RESTRICTION_EXCLUSIONS[restrictLower];
  if (exclusions && exclusions.some((ex) => lower.includes(ex))) return false;

  return true;
}

function recipeHasRestricted(
  ingredientNames: string[],
  restrictions: string[],
): boolean {
  return restrictions.some((restriction) =>
    ingredientNames.some((name) =>
      ingredientMatchesRestriction(name, restriction),
    ),
  );
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

interface ScoringInputs {
  likedIngredients: string[];
  dislikedIngredients: string[];
  preferredCuisines: string[];
  activeFamilySize: number;
}

function scoreRecipe(
  summary: RecipeSummary,
  inputs: ScoringInputs,
): number {
  let score = 0;
  const names = (summary.ingredientNames ?? []).map((n) => n.toLowerCase());

  // +2 for each liked ingredient present
  for (const liked of inputs.likedIngredients) {
    if (names.some((n) => n.includes(liked.toLowerCase()))) {
      score += 2;
    }
  }

  // -1 for each disliked ingredient present
  for (const disliked of inputs.dislikedIngredients) {
    if (names.some((n) => n.includes(disliked.toLowerCase()))) {
      score -= 1;
    }
  }

  // +1 for preferred cuisine match
  if (
    summary.cuisineType &&
    inputs.preferredCuisines.some(
      (c) => c.toLowerCase() === summary.cuisineType!.toLowerCase(),
    )
  ) {
    score += 1;
  }

  // +1 for high rating
  if (summary.avgRating != null && summary.avgRating >= 4) {
    score += 1;
  }

  // +0.5 for servings within ±1 of family size
  if (Math.abs(summary.servings - inputs.activeFamilySize) <= 1) {
    score += 0.5;
  }

  // Random jitter for staleness prevention
  score += Math.random() - 0.5; // ±0.5

  return score;
}

// ─── Bucket selection ────────────────────────────────────────────────────────

function selectFromBucket(
  recipes: Array<RecipeSummary & { score: number }>,
  maxCount: number,
): Array<RecipeSummary & { score: number }> {
  // Proportional: min(ceil(count × 0.4), maxCount), floor of min(count, 3)
  const count = Math.max(
    Math.min(recipes.length, 3),
    Math.min(Math.ceil(recipes.length * 0.4), maxCount),
  );

  return recipes
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

// ─── Main function ───────────────────────────────────────────────────────────

export async function getPlanningCandidates(
  weekOf: string,
): Promise<PlanningCandidatesResult> {
  // Step 1: Read all data in parallel
  const [summaries, sessions, preferences, members, pantryItems] = await Promise.all([
    listRecipeSummaries(),
    getRecentSessions(8),
    listPreferences(),
    listFamilyMembers(),
    listPantryItems(),
  ]);

  // Step 2: Extract context from preferences
  const restrictions = preferences
    .filter((p: FamilyPreference) => p.type === "restriction")
    .map((p: FamilyPreference) => p.key);
  const likedIngredients = preferences
    .filter((p: FamilyPreference) => p.type === "like")
    .map((p: FamilyPreference) => p.key);
  const dislikedIngredients = preferences
    .filter((p: FamilyPreference) => p.type === "dislike")
    .map((p: FamilyPreference) => p.key);
  const preferredCuisines = preferences
    .filter((p: FamilyPreference) => p.type === "cuisine")
    .map((p: FamilyPreference) => p.key);
  const scheduleConstraints = preferences
    .filter((p: FamilyPreference) => p.type === "schedule")
    .map((p: FamilyPreference) => ({ day: p.key, note: p.value }));

  const activeMembers = members.filter((m: FamilyMember) => m.isActive);
  const activeFamilySize = activeMembers.length;

  // Step 3: Compute recent recipe usage from sessions
  const recentRecipeIds = new Set<string>();
  const recentHistory: PlanningContext["recentHistory"] = [];

  // Compute timesCookedLast8Weeks on-the-fly
  const cookCountMap = new Map<string, number>();

  // Get recipe names for history context
  const allSessionRecipeIds = new Set<string>();
  for (const session of sessions) {
    for (const meal of session.meals) {
      allSessionRecipeIds.add(meal.recipeId);
    }
  }

  // Build a recipeId → name map from summaries
  const recipeNameMap = new Map<string, string>();
  for (const s of summaries) {
    recipeNameMap.set(s.id, s.name);
  }

  const threeWeeksAgo = getWeeksAgoDate(weekOf, 3);
  const eightWeeksAgo = getWeeksAgoDate(weekOf, 8);

  for (const session of sessions) {
    const sessionDate = session.weekOf;
    for (const meal of session.meals) {
      // Track for recency exclusion (last 3 weeks)
      if (sessionDate >= threeWeeksAgo) {
        recentRecipeIds.add(meal.recipeId);
      }

      // Track cook count in last 8 weeks
      if (sessionDate >= eightWeeksAgo) {
        cookCountMap.set(
          meal.recipeId,
          (cookCountMap.get(meal.recipeId) ?? 0) + 1,
        );
      }

      // Build condensed history for context
      recentHistory.push({
        weekOf: session.weekOf,
        recipeId: meal.recipeId,
        recipeName: recipeNameMap.get(meal.recipeId) ?? "Unknown",
      });
    }
  }

  // Step 4: Filter candidates
  const scoringInputs: ScoringInputs = {
    likedIngredients,
    dislikedIngredients,
    preferredCuisines,
    activeFamilySize,
  };

  const eligible = summaries
    .filter((s) => {
      // Exclude recently cooked
      if (recentRecipeIds.has(s.id)) return false;

      // Exclude overcooked (3+ times in 8 weeks)
      if ((cookCountMap.get(s.id) ?? 0) >= 3) return false;

      // Exclude recipes with restricted ingredients
      const names = s.ingredientNames ?? [];
      if (recipeHasRestricted(names, restrictions)) return false;

      return true;
    })
    .map((s) => ({
      ...s,
      score: scoreRecipe(s, scoringInputs),
    }));

  // Step 5: Select per complexity bucket
  const staples = eligible.filter((r) => r.complexity === "staple");
  const standard = eligible.filter((r) => r.complexity === "standard");
  const involved = eligible.filter((r) => r.complexity === "involved");

  const selected = [
    ...selectFromBucket(staples, 8),
    ...selectFromBucket(standard, 10),
    ...selectFromBucket(involved, 7),
  ];

  // Cap total at 25
  const capped = selected
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);

  // Step 6: Fetch full recipes for selected candidates (ingredients needed)
  const selectedIds = capped.map((s) => s.id);
  const fullRecipes = await getRecipesBatch(selectedIds);

  // Step 7: Assemble candidates with planning-relevant fields only
  const candidates: PlanningCandidate[] = capped.map((s) => {
    const full = fullRecipes.get(s.id);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      complexity: s.complexity,
      tags: s.tags,
      primaryProtein: s.primaryProtein,
      cuisineType: s.cuisineType,
      prepTime: s.prepTime,
      cookTime: s.cookTime,
      totalTime: s.prepTime + s.cookTime,
      servings: s.servings,
      avgRating: s.avgRating ?? null,
      lastCookedAt: s.lastCookedAt ?? null,
      score: Math.round(s.score * 10) / 10,
      ingredientSections: full?.ingredientSections ?? [],
    };
  });

  // Step 8: Assemble context
  const context: PlanningContext = {
    familyMembers: members.map((m: FamilyMember) => ({
      name: m.name,
      role: m.role,
      isActive: m.isActive,
    })),
    activeFamilySize,
    recentHistory,
    restrictions,
    scheduleConstraints,
    preferredCuisines,
    likedIngredients,
    dislikedIngredients,
    pantryItemNames: pantryItems.map((p: { name: string }) => p.name),
  };

  return { candidates, context };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeeksAgoDate(weekOf: string, weeks: number): string {
  const date = new Date(weekOf);
  date.setDate(date.getDate() - weeks * 7);
  return date.toISOString().split("T")[0];
}
