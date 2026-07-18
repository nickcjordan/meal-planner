/**
 * Shared grocery-list construction pipeline.
 *
 * `buildGroceryItems` is the single source of truth for turning a draft/session
 * plan into consolidated, pantry-filtered grocery line items. Both the merge
 * route (session-sourced) and the preview route (request-body-sourced) call it
 * so they produce identical items for identical input. The pure `buildGroceryItems`
 * takes fully-resolved context and does no I/O (so it is unit-testable without
 * AWS); `assembleGroceryContext` fetches that context via injected db fetchers.
 *
 * The resync / persistent-list write / per-session snapshot machinery lives in
 * the merge route — only list *construction* lives here.
 */
import type {
  CarryoverItem,
  DayOfWeek,
  DietaryAdaptation,
  FamilyMember,
  FamilyPreference,
  GroceryItemSource,
  Ingredient,
  MealAdaptationDecision,
  MealType,
  PantryItem,
  PlanExtra,
  PlannedSide,
  Recipe,
  SessionStapleItem,
  Side,
} from "@meal-planner/types";
import { namesMatchExact } from "@meal-planner/import";
import { filterPantryItems } from "./pantry-match";

// ─── Restriction matching (defense-in-depth warnings) ────────────────────────
//
// Copied verbatim from packages/db/src/planning.ts. A later unification with a
// shared db export (e.g. exporting `ingredientMatchesRestriction` from
// @meal-planner/db) is planned — keep the two tables in sync until then.
//
// Restriction matching intentionally uses case-insensitive *containment* (not
// the exact token-set `namesMatchExact` matcher) because a restriction like
// "nuts" must flag "peanuts", while a curated exclusion list suppresses
// known false positives like "coconut" / "nutmeg".

/** False-positive exclusions: terms that contain a restricted keyword but aren't related. */
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

  if (!lower.includes(restrictLower)) return false;

  const exclusions = RESTRICTION_EXCLUSIONS[restrictLower];
  if (exclusions && exclusions.some((ex) => lower.includes(ex))) return false;

  return true;
}

// ─── Source provenance helpers ───────────────────────────────────────────────

function sourceSessionId(s: GroceryItemSource): string | undefined {
  return "sessionId" in s ? s.sessionId : undefined;
}

function sourceWeekOf(s: GroceryItemSource): string | undefined {
  return "weekOf" in s ? s.weekOf : undefined;
}

/**
 * §3b origin provenance: when an adaptation replaces a recipe- or side-sourced
 * ingredient, carry the origin so the adapted line keeps its meal/side tag.
 * Derived from the source that was replaced.
 */
function adaptationOrigin(s: GroceryItemSource): {
  originRecipeId?: string;
  originRecipeName?: string;
  originSideName?: string;
  originDay?: string;
} {
  if (s.type === "recipe") {
    return { originRecipeId: s.recipeId, originRecipeName: s.recipeName };
  }
  if (s.type === "side") {
    return { originSideName: s.sideName, originDay: s.day };
  }
  return {};
}

// ─── Public shapes ───────────────────────────────────────────────────────────

/** A single draft meal — mirrors the frozen DraftMealInput contract (§3). A
 *  session's PlannedMeal (day/mealType required) is assignable to this. */
export interface BuildMealInput {
  day?: DayOfWeek;
  mealType?: MealType;
  recipeId: string;
  sides?: PlannedSide[];
  adaptations?: MealAdaptationDecision[];
}

/** Draft-shaped input for the builder — the common denominator of a saved
 *  session (merge route) and a GroceryPreviewRequest (preview route). */
export interface BuildGroceryInput {
  /** Real session id for merge; a synthetic placeholder (e.g. "preview") for
   *  the non-persisting preview route. Written into source provenance. */
  sessionId: string;
  weekOf: string;
  meals: BuildMealInput[];
  extras?: PlanExtra[];
  groceryStaples?: SessionStapleItem[];
  carryoverItems?: CarryoverItem[];
  /** Exclusion keys: recipe:{recipeId}:{name} | extra:{extraName}:{name} |
   *  side:{day}-{mealType}:{name}  (name lowercased+trimmed). */
  excludedIngredients?: string[];
}

/** Fully-resolved context the pure builder consumes (no I/O). */
export interface BuildGroceryContext {
  /** recipeId → Recipe for every resolvable meal recipe. */
  recipes: Map<string, Recipe>;
  /** sideId → Side for every `ref` side. */
  sides: Map<string, Side>;
  adaptations: DietaryAdaptation[];
  members: FamilyMember[];
  pantryItems: PantryItem[];
  /** Restriction preference keys (FamilyPreference.type === "restriction"). */
  restrictions: string[];
}

/** DB fetchers injected so routes can assemble context without the builder
 *  depending on @meal-planner/db directly (keeps it unit-testable). */
export interface BuildGroceryDeps {
  getRecipe: (id: string) => Promise<Recipe | null>;
  getSidesBatch: (ids: string[]) => Promise<Map<string, Side>>;
  listDietaryAdaptations: () => Promise<DietaryAdaptation[]>;
  listFamilyMembers: () => Promise<FamilyMember[]>;
  listPantryItems: () => Promise<PantryItem[]>;
  listPreferences: () => Promise<FamilyPreference[]>;
}

/** A consolidated, pantry-filtered grocery line item (pre-persistence). */
export interface BuiltGroceryItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  sources: GroceryItemSource[];
  isFlexible?: boolean;
  flexibleDescription?: string;
}

export interface BuildGroceryResult {
  items: BuiltGroceryItem[];
  /** Non-blocking advisories (unresolved recipes, restriction hits). The merge
   *  route ignores these; the preview route returns them. */
  warnings: string[];
}

const DEFAULT_MEAL_TYPE: MealType = "dinner";

interface Collected {
  ingredient: Ingredient;
  source: GroceryItemSource;
  /** Per-meal adaptation decisions for recipe/side ingredients. `undefined`
   *  means "apply all active adaptations" (historical global behavior). */
  mealDecisions?: MealAdaptationDecision[];
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

// ─── Context assembly (I/O) ──────────────────────────────────────────────────

export async function assembleGroceryContext(
  input: BuildGroceryInput,
  deps: BuildGroceryDeps,
): Promise<BuildGroceryContext> {
  const recipeIds = [...new Set(input.meals.map((m) => m.recipeId))];

  const sideRefIds = new Set<string>();
  for (const meal of input.meals) {
    for (const side of meal.sides ?? []) {
      if (side.kind === "ref") sideRefIds.add(side.sideId);
    }
  }

  const [recipeResults, sides, adaptations, members, pantryItems, preferences] =
    await Promise.all([
      Promise.all(recipeIds.map((id) => deps.getRecipe(id))),
      sideRefIds.size > 0
        ? deps.getSidesBatch([...sideRefIds])
        : Promise.resolve(new Map<string, Side>()),
      deps.listDietaryAdaptations(),
      deps.listFamilyMembers(),
      deps.listPantryItems(),
      deps.listPreferences(),
    ]);

  const recipes = new Map<string, Recipe>();
  for (const r of recipeResults) {
    if (r) recipes.set(r.id, r);
  }

  const restrictions = preferences
    .filter((p) => p.type === "restriction")
    .map((p) => p.key);

  return { recipes, sides, adaptations, members, pantryItems, restrictions };
}

// ─── Adaptation application ──────────────────────────────────────────────────

/**
 * Apply dietary adaptation substitutions to collected ingredients.
 *
 * - `gentle-reminder` adaptations never swap.
 * - `when-easy` applies only `exact`-quality rules; `always` applies all rules.
 * - Substitution requires exact token-set equality (`namesMatchExact`) — it is
 *   destructive (renames the ingredient).
 * - Per-meal gating: when a collected item carries `mealDecisions` (recipe/side
 *   ingredients of a meal that specified an `adaptations` array), only
 *   adaptations whose name has `applied: true` for that meal are applied. Items
 *   with no `mealDecisions` (extras, or a meal with no `adaptations` field) keep
 *   the historical global behavior (every active adaptation applies).
 */
function applyAdaptations(
  items: Collected[],
  adaptations: DietaryAdaptation[],
  memberMap: Map<string, FamilyMember>,
): Collected[] {
  const active = adaptations.filter((a) => a.isActive);
  if (active.length === 0) return items;

  return items.map((collected) => {
    const { ingredient, source, mealDecisions } = collected;
    for (const adaptation of active) {
      if (adaptation.leniency === "gentle-reminder") continue;

      // Per-meal gate: skip adaptations not explicitly applied for this meal.
      if (mealDecisions !== undefined) {
        const decision = mealDecisions.find(
          (d) => d.adaptationName === adaptation.name,
        );
        if (!decision || !decision.applied) continue;
      }

      for (const rule of adaptation.rules) {
        if (!namesMatchExact(rule.from, ingredient.name)) continue;
        if (adaptation.leniency === "when-easy" && rule.quality !== "exact") {
          continue;
        }

        const member = memberMap.get(adaptation.memberId);
        return {
          ingredient: { ...ingredient, name: rule.to },
          source: {
            type: "adaptation" as const,
            originalIngredient: ingredient.name,
            adaptationName: adaptation.name,
            memberName: member?.name ?? "Unknown",
            sessionId: sourceSessionId(source),
            weekOf: sourceWeekOf(source),
            quantity: ingredient.quantity,
            ...adaptationOrigin(source),
          },
          mealDecisions,
        };
      }
    }

    return collected;
  });
}

// ─── Consolidation ───────────────────────────────────────────────────────────

function consolidate(items: Collected[]): BuiltGroceryItem[] {
  const map = new Map<string, BuiltGroceryItem>();

  for (const { ingredient, source } of items) {
    const key = `${norm(ingredient.name)}||${norm(ingredient.unit)}`;

    const existing = map.get(key);
    if (existing) {
      existing.quantity += ingredient.quantity;
      existing.sources.push(source);
    } else {
      map.set(key, {
        name: norm(ingredient.name),
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        category: ingredient.category ?? "other",
        sources: [source],
      });
    }
  }

  return Array.from(map.values());
}

// ─── The builder (pure) ──────────────────────────────────────────────────────

export function buildGroceryItems(
  input: BuildGroceryInput,
  context: BuildGroceryContext,
): BuildGroceryResult {
  const { sessionId, weekOf } = input;
  const excludedSet = new Set(input.excludedIngredients ?? []);
  const warnings: string[] = [];
  const memberMap = new Map(context.members.map((m) => [m.id, m]));

  const allIngredients: Collected[] = [];

  // 1. Recipe ingredients (+ defense-in-depth restriction warnings).
  for (const meal of input.meals) {
    const recipe = context.recipes.get(meal.recipeId);
    if (!recipe) {
      warnings.push(`Recipe not found (${meal.recipeId}) — meal skipped.`);
      continue;
    }
    for (const section of recipe.ingredientSections) {
      for (const ing of section.items) {
        allIngredients.push({
          ingredient: ing,
          source: {
            type: "recipe",
            sessionId,
            weekOf,
            recipeId: recipe.id,
            recipeName: recipe.name,
            quantity: ing.quantity,
          },
          mealDecisions: meal.adaptations,
        });
        for (const restriction of context.restrictions) {
          if (ingredientMatchesRestriction(ing.name, restriction)) {
            warnings.push(
              `"${recipe.name}" contains ${ing.name} (restriction: ${restriction})`,
            );
          }
        }
      }
    }
  }

  // 2. Extras (no meal tag → global adaptation behavior).
  for (const extra of input.extras ?? []) {
    for (const ing of extra.ingredients) {
      allIngredients.push({
        ingredient: {
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category,
        },
        source: {
          type: "extra",
          sessionId,
          weekOf,
          extraName: extra.name,
          quantity: ing.quantity,
        },
      });
    }
  }

  // 3. Side ingredients. Sides only exist on scheduled (day-bearing) meals by
  //    contract, so a day-less meal contributes no sides.
  for (const meal of input.meals) {
    if (!meal.day) continue;
    const mealType = meal.mealType ?? DEFAULT_MEAL_TYPE;
    for (const side of meal.sides ?? []) {
      const resolved = side.kind === "ref" ? context.sides.get(side.sideId) : undefined;
      const ingredients =
        side.kind === "ref" ? (resolved?.ingredients ?? []) : side.ingredients;
      const sideName =
        side.kind === "ref" ? (resolved?.name ?? side.sideId) : side.name;

      for (const ing of ingredients) {
        allIngredients.push({
          ingredient: {
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            category: ing.category,
          },
          source: {
            type: "side",
            sessionId,
            weekOf,
            day: meal.day,
            mealType,
            sideId: side.kind === "ref" ? side.sideId : undefined,
            sideName,
            quantity: ing.quantity,
          },
          mealDecisions: meal.adaptations,
        });
      }
    }
  }

  // 4. Drop user-excluded ingredients (recipe / extra / side keys).
  const included =
    excludedSet.size > 0
      ? allIngredients.filter(({ ingredient, source }) => {
          if (source.type === "recipe" && "recipeId" in source) {
            return !excludedSet.has(
              `recipe:${source.recipeId}:${norm(ingredient.name)}`,
            );
          }
          if (source.type === "extra" && "extraName" in source) {
            return !excludedSet.has(
              `extra:${source.extraName}:${norm(ingredient.name)}`,
            );
          }
          if (source.type === "side") {
            return !excludedSet.has(
              `side:${source.day}-${source.mealType}:${norm(ingredient.name)}`,
            );
          }
          return true;
        })
      : allIngredients;

  // 5. Apply dietary adaptations (per-meal aware).
  const adapted = applyAdaptations(included, context.adaptations, memberMap);

  // 6. Consolidate by name||unit.
  const consolidated = consolidate(adapted);

  // 7. Pantry suppression.
  const filtered = filterPantryItems(consolidated, context.pantryItems);

  // 8. Grocery staples (added post-consolidation; never adapted).
  for (const staple of input.groceryStaples ?? []) {
    const name = norm(staple.name);
    if (filtered.find((item) => item.name === name)) continue; // covered already

    filtered.push({
      name,
      quantity: staple.quantity ?? 0,
      unit: staple.unit ?? "",
      category: staple.category,
      sources: [
        {
          type: "staple",
          stapleName: staple.name,
          sessionId,
          weekOf,
          quantity: staple.quantity ?? 0,
        },
      ],
      isFlexible: staple.style === "flexible",
      flexibleDescription: staple.description,
    });
  }

  // 9. Carryover items the user marked "I need this".
  if (input.carryoverItems) {
    const ingredientCategoryMap = new Map<string, string>();
    for (const { ingredient } of allIngredients) {
      if (ingredient.category) {
        ingredientCategoryMap.set(norm(ingredient.name), ingredient.category);
      }
    }

    for (const carryover of input.carryoverItems) {
      if (carryover.status !== "need") continue;
      const name = norm(carryover.name);
      const unit = norm(carryover.unit);
      const category = ingredientCategoryMap.get(name) ?? "other";
      const key = `${name}||${unit}`;
      const existing = filtered.find(
        (item) => `${item.name}||${norm(item.unit)}` === key,
      );
      if (existing) {
        existing.quantity += carryover.neededFor.requiredQuantity;
        existing.sources.push({
          type: "carryover",
          sessionId,
          weekOf,
          recipeName: carryover.neededFor.recipeName,
          quantity: carryover.neededFor.requiredQuantity,
        });
      } else {
        filtered.push({
          name,
          quantity: carryover.neededFor.requiredQuantity,
          unit: carryover.unit,
          category,
          sources: [
            {
              type: "carryover",
              sessionId,
              weekOf,
              recipeName: carryover.neededFor.recipeName,
              quantity: carryover.neededFor.requiredQuantity,
            },
          ],
        });
      }
    }
  }

  return { items: filtered, warnings: [...new Set(warnings)] };
}

// ─── Category ordering (shared with the merge route's list sort) ─────────────

const CATEGORY_ORDER = [
  "produce",
  "meat",
  "seafood",
  "dairy",
  "bread",
  "pasta",
  "canned",
  "condiments",
  "spices",
  "pantry",
  "frozen",
  "other",
];

/** Stable comparator: category order, then name. Used by both the persistent
 *  grocery-list sort and the preview response. */
export function compareGroceryItems(
  a: { category: string; name: string },
  b: { category: string; name: string },
): number {
  const catA = CATEGORY_ORDER.indexOf(a.category);
  const catB = CATEGORY_ORDER.indexOf(b.category);
  const orderA = catA === -1 ? CATEGORY_ORDER.length : catA;
  const orderB = catB === -1 ? CATEGORY_ORDER.length : catB;
  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name);
}
