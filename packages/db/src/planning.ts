/**
 * Planning candidates — server-side recipe filtering, scoring, and context
 * assembly for the get_planning_candidates tool.
 *
 * Also serves the collaborative planning wizard via getPlanningOptions, which
 * shares the same read + eligibility pipeline but demotes (rather than excludes)
 * recently-cooked recipes and uses a deterministic seeded jitter so the same
 * week + recipe always scores identically.
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

/**
 * A single meal choice surfaced by the planning wizard (Step 1 grid + search).
 * Unlike PlanningCandidate this is NOT hydrated with ingredients — it is a
 * lightweight card. Recently-cooked / overcooked recipes are demoted via
 * `recentlyMade` rather than excluded.
 */
export interface MealOption {
  id: string;
  name: string;
  description: string;
  complexity: Recipe["complexity"];
  tags: string[];
  primaryProtein?: string;
  cuisineType?: string;
  /** prepTime + cookTime */
  totalTime: number;
  servings: number;
  avgRating: number | null;
  lastCookedAt: string | null;
  /** Cooked within the last 3 weeks OR ≥3× in 8 weeks — demoted, not excluded. */
  recentlyMade: boolean;
  timesCooked8Weeks: number;
  /** Seeded-jitter score, rounded to 1 decimal. */
  score: number;
  /** 1-based rank across the final ordering (fresh block, then recentlyMade block). */
  rank: number;
}

export interface PlanningOptionsResult {
  options: MealOption[];
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

/**
 * True when an ingredient name contains a restricted keyword (case-insensitive),
 * accounting for known false-positive terms. Exported so other domains (grocery
 * preview restriction scan) can reuse the exact same semantics.
 */
export function ingredientMatchesRestriction(
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

/** True when any ingredient name matches any restriction. */
export function recipeHasRestricted(
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

/**
 * Deterministic scoring body shared by both planning entry points — everything
 * EXCEPT the staleness jitter. getPlanningCandidates adds random jitter;
 * getPlanningOptions adds a seeded (reproducible) jitter. Keeping the base here
 * guarantees the two never drift.
 */
function scoreRecipeBase(summary: RecipeSummary, inputs: ScoringInputs): number {
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

  return score;
}

/** Base score + random jitter for staleness prevention (candidates path). */
function scoreRecipe(summary: RecipeSummary, inputs: ScoringInputs): number {
  return scoreRecipeBase(summary, inputs) + (Math.random() - 0.5); // ±0.5
}

/**
 * Deterministic jitter in [-0.5, 0.5) from an FNV-1a hash of `${weekOf}:${recipeId}`.
 * Same week + same recipe ⇒ identical value, so the wizard grid is stable across
 * reloads within a week yet reshuffles week-to-week.
 */
export function seededJitter(weekOf: string, recipeId: string): number {
  const str = `${weekOf}:${recipeId}`;
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  const unsigned = hash >>> 0; // to uint32
  return unsigned / 0x100000000 - 0.5; // [0,1) → [-0.5, 0.5)
}

/** Base score + seeded jitter (wizard options path). */
function scoreRecipeSeeded(
  summary: RecipeSummary,
  inputs: ScoringInputs,
  weekOf: string,
): number {
  return scoreRecipeBase(summary, inputs) + seededJitter(weekOf, summary.id);
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

// ─── Shared read + context pipeline ──────────────────────────────────────────

interface PlanningData {
  summaries: RecipeSummary[];
  restrictions: string[];
  scoringInputs: ScoringInputs;
  /** recipeIds cooked within the last 3 weeks */
  recentRecipeIds: Set<string>;
  /** recipeId → times cooked in the last 8 weeks */
  cookCountMap: Map<string, number>;
  context: PlanningContext;
}

/**
 * Read all planning inputs in parallel and assemble the derived context, recency
 * set, and cook-count map. Shared verbatim by getPlanningCandidates and
 * getPlanningOptions so both see identical inputs.
 */
async function loadPlanningData(weekOf: string): Promise<PlanningData> {
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

  const scoringInputs: ScoringInputs = {
    likedIngredients,
    dislikedIngredients,
    preferredCuisines,
    activeFamilySize,
  };

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

  return { summaries, restrictions, scoringInputs, recentRecipeIds, cookCountMap, context };
}

// ─── Main functions ──────────────────────────────────────────────────────────

export async function getPlanningCandidates(
  weekOf: string,
): Promise<PlanningCandidatesResult> {
  const { summaries, restrictions, scoringInputs, recentRecipeIds, cookCountMap, context } =
    await loadPlanningData(weekOf);

  // Step 4: Filter candidates
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

  return { candidates, context };
}

/**
 * Options for the planning wizard. Same reads + eligibility as
 * getPlanningCandidates EXCEPT recently-cooked (≤3 weeks) and overcooked
 * (≥3× in 8 weeks) recipes are demoted (recentlyMade=true) into a block after
 * all fresh candidates rather than excluded. Restrictions stay a hard exclusion.
 * No hydration (never calls getRecipesBatch). Scores use a deterministic seeded
 * jitter so the grid is stable within a week.
 *
 * Without a query: capped at 20 options (straight score order within each block).
 * With a query: filtered by case-insensitive substring against name, tags, and
 * ingredient names, NO cap, same ordering, restrictions still hard-filtered.
 */
export async function getPlanningOptions(
  weekOf: string,
  opts?: { query?: string },
): Promise<PlanningOptionsResult> {
  const { summaries, restrictions, scoringInputs, recentRecipeIds, cookCountMap, context } =
    await loadPlanningData(weekOf);

  const query = opts?.query?.trim().toLowerCase();

  // Restrictions are the only hard exclusion; recently-cooked/overcooked are
  // demoted, not dropped.
  const eligible = summaries
    .filter((s) => {
      const names = s.ingredientNames ?? [];
      return !recipeHasRestricted(names, restrictions);
    })
    .map((s) => {
      const timesCooked8Weeks = cookCountMap.get(s.id) ?? 0;
      const recentlyMade = recentRecipeIds.has(s.id) || timesCooked8Weeks >= 3;
      return {
        summary: s,
        score: scoreRecipeSeeded(s, scoringInputs, weekOf),
        recentlyMade,
        timesCooked8Weeks,
      };
    });

  // Optional substring filter (name / tags / ingredient names)
  const pool = query
    ? eligible.filter(({ summary }) => {
        if (summary.name.toLowerCase().includes(query)) return true;
        if (summary.tags.some((t) => t.toLowerCase().includes(query))) return true;
        if ((summary.ingredientNames ?? []).some((n) => n.toLowerCase().includes(query)))
          return true;
        return false;
      })
    : eligible;

  // Fresh block first (score desc), then recentlyMade block (score desc).
  const fresh = pool
    .filter((e) => !e.recentlyMade)
    .sort((a, b) => b.score - a.score);
  const demoted = pool
    .filter((e) => e.recentlyMade)
    .sort((a, b) => b.score - a.score);

  let ordered = [...fresh, ...demoted];
  // Only cap the unfiltered grid; search returns everything that matches.
  if (!query) ordered = ordered.slice(0, 20);

  const options: MealOption[] = ordered.map((e, i) => ({
    id: e.summary.id,
    name: e.summary.name,
    description: e.summary.description,
    complexity: e.summary.complexity,
    tags: e.summary.tags,
    primaryProtein: e.summary.primaryProtein,
    cuisineType: e.summary.cuisineType,
    totalTime: e.summary.prepTime + e.summary.cookTime,
    servings: e.summary.servings,
    avgRating: e.summary.avgRating ?? null,
    lastCookedAt: e.summary.lastCookedAt ?? null,
    recentlyMade: e.recentlyMade,
    timesCooked8Weeks: e.timesCooked8Weeks,
    score: Math.round(e.score * 10) / 10,
    rank: i + 1,
  }));

  return { options, context };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeeksAgoDate(weekOf: string, weeks: number): string {
  const date = new Date(weekOf);
  date.setDate(date.getDate() - weeks * 7);
  return date.toISOString().split("T")[0];
}
