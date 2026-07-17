import { NextResponse } from "next/server";
import {
  getSession,
  getRecipe,
  listPantryItems,
  ensureGroceryList,
  saveGroceryList,
  listDietaryAdaptations,
  listFamilyMembers,
  getSidesBatch,
} from "@meal-planner/db";
import type { GroceryList, GroceryListItem, GroceryItemSource, Ingredient, DietaryAdaptation, FamilyMember } from "@meal-planner/types";
import { filterPantryItems } from "@/lib/pantry-match";
import { namesMatchExact } from "@meal-planner/import";
import { randomUUID } from "crypto";

interface ConsolidatedItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  sources: GroceryItemSource[];
  isFlexible?: boolean;
  flexibleDescription?: string;
}

/** Read the (optional) sessionId off any source variant that carries one. */
function sourceSessionId(s: GroceryItemSource): string | undefined {
  return "sessionId" in s ? s.sessionId : undefined;
}

/** Read the (optional) weekOf off any source variant that carries one. */
function sourceWeekOf(s: GroceryItemSource): string | undefined {
  return "weekOf" in s ? s.weekOf : undefined;
}

/** Read the (optional) per-source contributed quantity off any source variant. */
function sourceQuantity(s: GroceryItemSource): number | undefined {
  return "quantity" in s ? s.quantity : undefined;
}

/**
 * Resync a previously-merged session out of the grocery list so the normal merge
 * pipeline can re-add it against current session state (no duplicate entries).
 *
 * For each list item: subtract the quantities of its sources belonging to this
 * session and drop those sources. Items that end with no sources AND
 * quantity <= 0 AND checked === false are deleted; checked items survive (they
 * were already shopped). Finally the sessionId is removed from mergedSessionIds
 * (the pipeline re-adds it exactly once).
 *
 * Legacy sources predate per-source `quantity`. When a session's sources on an
 * item lack quantity we cannot compute an exact residual, so we approximate: if
 * ALL of the item's sources belong to the session, remove the item (unless
 * checked); otherwise strip only this session's sources and leave the quantity
 * unchanged (an over-estimate that a later exact re-merge corrects).
 *
 * Returns a map of {itemId → pre-resync quantity} for the CHECKED items it
 * touched, so the caller can detect (after the re-merge) any still-checked row
 * that gained net-new required quantity and uncheck it — otherwise a re-merge
 * that adds more of an already-bought item would leave the larger amount checked
 * (clearable as "purchased" without shopping).
 */
function resyncSession(list: GroceryList, sessionId: string): Map<string, number> {
  const belongs = (s: GroceryItemSource) => sourceSessionId(s) === sessionId;

  const checkedPreResyncQty = new Map<string, number>();
  const kept: GroceryListItem[] = [];
  for (const item of list.items) {
    const sessionSources = item.sources.filter(belongs);
    if (sessionSources.length === 0) {
      kept.push(item);
      continue;
    }
    // Record the checked row's quantity before we mutate it (checked rows always
    // survive resync, and the pipeline merges into them by stable id).
    if (item.checked) {
      checkedPreResyncQty.set(item.id, item.quantity);
    }
    const otherSources = item.sources.filter((s) => !belongs(s));
    const allHaveQuantity = sessionSources.every(
      (s) => typeof sourceQuantity(s) === "number",
    );

    if (allHaveQuantity) {
      const subtract = sessionSources.reduce(
        (sum, s) => sum + (sourceQuantity(s) ?? 0),
        0,
      );
      item.quantity = Math.round((item.quantity - subtract) * 100) / 100;
      item.sources = otherSources;
    } else {
      // Legacy approximation — no reliable per-source quantity to subtract.
      if (otherSources.length === 0) {
        if (!item.checked) {
          continue; // all sources belonged to this session → drop the item
        }
        // Checked + fully session-derived: treat the whole quantity as this
        // session's contribution so the re-merge restores exactly the current
        // amount instead of doubling it. preResyncQty was recorded above, so
        // the uncheck-on-growth rule still compares against the bought amount.
        item.quantity = 0;
        item.sources = [];
      } else {
        // Mixed legacy sources: can't apportion this session's share — strip its
        // sources and leave the quantity (an over-estimate; the re-merge adds the
        // current amount on top, and the uncheck-on-growth rule flags the row for
        // re-shopping). Only affects lists merged before per-source quantities.
        item.sources = otherSources;
      }
    }

    // Drop unchecked items that have no sources left: with every source gone the
    // item was entirely session-derived (manual items always keep their "manual"
    // source), so any residual quantity is just 2-decimal rounding noise.
    // Checked items survive — they were already shopped.
    if (!item.checked && item.sources.length === 0) {
      continue;
    }
    kept.push(item);
  }

  list.items = kept;
  list.mergedSessionIds = list.mergedSessionIds.filter((id) => id !== sessionId);
  return checkedPreResyncQty;
}

/**
 * Apply dietary adaptation substitutions to ingredients.
 * For each ingredient, check if any active adaptation has a matching rule.
 * Only apply "exact" swaps when leniency is "when-easy".
 * Apply all swaps when leniency is "always".
 * Skip all swaps when leniency is "gentle-reminder".
 */
function applyAdaptations(
  items: { ingredient: Ingredient; source: GroceryItemSource }[],
  adaptations: DietaryAdaptation[],
  memberMap: Map<string, FamilyMember>,
): { ingredient: Ingredient; source: GroceryItemSource }[] {
  const active = adaptations.filter((a) => a.isActive);
  if (active.length === 0) return items;

  return items.map(({ ingredient, source }) => {
    for (const adaptation of active) {
      if (adaptation.leniency === "gentle-reminder") continue;

      for (const rule of adaptation.rules) {
        // Adaptation substitution is destructive (it renames the ingredient), so
        // require exact token-set equality rather than a bidirectional substring.
        if (!namesMatchExact(rule.from, ingredient.name)) continue;

        // For "when-easy", only apply exact swaps
        if (adaptation.leniency === "when-easy" && rule.quality !== "exact") continue;

        const member = memberMap.get(adaptation.memberId);
        return {
          ingredient: { ...ingredient, name: rule.to },
          source: {
            type: "adaptation" as const,
            originalIngredient: ingredient.name,
            adaptationName: adaptation.name,
            memberName: member?.name ?? "Unknown",
            // Carry session provenance + contributed quantity from the source we
            // replaced, so a re-merge can resync this line exactly.
            sessionId: sourceSessionId(source),
            weekOf: sourceWeekOf(source),
            quantity: ingredient.quantity,
          },
        };
      }
    }

    return { ingredient, source };
  });
}

function consolidateSessionIngredients(
  allIngredients: { ingredient: Ingredient; source: GroceryItemSource }[],
): ConsolidatedItem[] {
  const map = new Map<string, ConsolidatedItem>();

  for (const { ingredient, source } of allIngredients) {
    const name = ingredient.name.toLowerCase().trim();
    const unit = ingredient.unit.toLowerCase().trim();
    const key = `${name}||${unit}`;

    const existing = map.get(key);
    if (existing) {
      existing.quantity += ingredient.quantity;
      existing.sources.push(source);
    } else {
      map.set(key, {
        name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        category: ingredient.category ?? "other",
        sources: [source],
      });
    }
  }

  return Array.from(map.values());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, excludedIngredients: excludedKeys = [] } = body as {
      sessionId: string;
      excludedIngredients?: string[];
    };
    const excludedSet = new Set(excludedKeys);

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const list = await ensureGroceryList();

    // Already merged → resync: pull this session's contributions back out, then
    // fall through to the normal pipeline which re-adds it against current state.
    let resynced = false;
    let checkedPreResyncQty = new Map<string, number>();
    if (list.mergedSessionIds.includes(sessionId)) {
      checkedPreResyncQty = resyncSession(list, sessionId);
      resynced = true;
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Fetch all recipes
    const recipeIds = [...new Set(session.meals.map((m) => m.recipeId))];
    const recipes = await Promise.all(recipeIds.map((rid) => getRecipe(rid)));
    const recipeMap = new Map(recipes.filter(Boolean).map((r) => [r!.id, r!]));

    // Collect all ingredients with source provenance
    const allIngredients: { ingredient: Ingredient; source: GroceryItemSource }[] = [];

    for (const meal of session.meals) {
      const recipe = recipeMap.get(meal.recipeId);
      if (!recipe) continue;
      for (const section of recipe.ingredientSections) {
        for (const ing of section.items) {
          allIngredients.push({
            ingredient: ing,
            source: {
              type: "recipe",
              sessionId,
              weekOf: session.weekOf,
              recipeId: recipe.id,
              recipeName: recipe.name,
              quantity: ing.quantity,
            },
          });
        }
      }
    }

    // Include extras
    if (session.extras) {
      for (const extra of session.extras) {
        for (const ing of extra.ingredients) {
          allIngredients.push({
            ingredient: { name: ing.name, quantity: ing.quantity, unit: ing.unit, category: ing.category },
            source: {
              type: "extra",
              sessionId,
              weekOf: session.weekOf,
              extraName: extra.name,
              quantity: ing.quantity,
            },
          });
        }
      }
    }

    // Include side ingredients
    const sideRefIds = new Set<string>();
    for (const meal of session.meals) {
      for (const side of meal.sides ?? []) {
        if (side.kind === "ref") sideRefIds.add(side.sideId);
      }
    }
    const sideBatch = sideRefIds.size > 0 ? await getSidesBatch([...sideRefIds]) : new Map();

    for (const meal of session.meals) {
      for (const side of meal.sides ?? []) {
        const ingredients =
          side.kind === "ref"
            ? (sideBatch.get(side.sideId)?.ingredients ?? [])
            : side.ingredients;
        const sideName =
          side.kind === "ref"
            ? (sideBatch.get(side.sideId)?.name ?? side.sideId)
            : side.name;

        for (const ing of ingredients) {
          allIngredients.push({
            ingredient: { name: ing.name, quantity: ing.quantity, unit: ing.unit, category: ing.category },
            source: {
              type: "side",
              sessionId,
              weekOf: session.weekOf,
              day: meal.day,
              mealType: meal.mealType,
              sideId: side.kind === "ref" ? side.sideId : undefined,
              sideName,
              quantity: ing.quantity,
            },
          });
        }
      }
    }

    // Filter out user-excluded ingredients (from the ingredient review panel)
    const includedIngredients = excludedSet.size > 0
      ? allIngredients.filter(({ ingredient, source }) => {
          if (source.type === "recipe" && "recipeId" in source) {
            const key = `recipe:${source.recipeId}:${ingredient.name.toLowerCase().trim()}`;
            return !excludedSet.has(key);
          }
          if (source.type === "extra" && "extraName" in source) {
            const key = `extra:${source.extraName}:${ingredient.name.toLowerCase().trim()}`;
            return !excludedSet.has(key);
          }
          return true;
        })
      : allIngredients;

    // Apply dietary adaptations (swap ingredients based on active profiles)
    const [adaptations, familyMembers] = await Promise.all([
      listDietaryAdaptations(),
      listFamilyMembers(),
    ]);
    const memberMap = new Map(familyMembers.map((m) => [m.id, m]));
    const adapted = applyAdaptations(includedIngredients, adaptations, memberMap);

    // Consolidate session items
    const consolidated = consolidateSessionIngredients(adapted);

    // Filter pantry items (fuzzy match using normalizedName + aliases)
    const pantryItems = await listPantryItems();
    const filtered = filterPantryItems(consolidated, pantryItems);

    // Add grocery staples from the session
    if (session.groceryStaples) {
      for (const staple of session.groceryStaples) {
        const name = staple.name.toLowerCase().trim();
        const existing = filtered.find((item) => item.name === name);
        if (existing) continue; // Already covered by a recipe ingredient

        filtered.push({
          name,
          quantity: staple.quantity ?? 0,
          unit: staple.unit ?? "",
          category: staple.category,
          sources: [{
            type: "staple",
            stapleName: staple.name,
            sessionId,
            weekOf: session.weekOf,
            quantity: staple.quantity ?? 0,
          }],
          isFlexible: staple.style === "flexible",
          flexibleDescription: staple.description,
        });
      }
    }

    // Add carryover items the user marked as "I need this"
    if (session.carryoverItems) {
      // Build a lookup from ingredient name → category using the already-collected recipe ingredients
      const ingredientCategoryMap = new Map<string, string>();
      for (const { ingredient } of allIngredients) {
        if (ingredient.category) {
          ingredientCategoryMap.set(ingredient.name.toLowerCase().trim(), ingredient.category);
        }
      }

      for (const carryover of session.carryoverItems) {
        if (carryover.status !== "need") continue;
        const name = carryover.name.toLowerCase().trim();
        const unit = carryover.unit.toLowerCase().trim();
        const category = ingredientCategoryMap.get(name) ?? "other";
        const key = `${name}||${unit}`;
        const existing = filtered.find(
          (item) => `${item.name}||${item.unit.toLowerCase().trim()}` === key,
        );
        if (existing) {
          existing.quantity += carryover.neededFor.requiredQuantity;
          existing.sources.push({
            type: "carryover",
            sessionId,
            weekOf: session.weekOf,
            recipeName: carryover.neededFor.recipeName,
            quantity: carryover.neededFor.requiredQuantity,
          });
        } else {
          filtered.push({
            name,
            quantity: carryover.neededFor.requiredQuantity,
            unit: carryover.unit,
            category,
            sources: [{
              type: "carryover",
              sessionId,
              weekOf: session.weekOf,
              recipeName: carryover.neededFor.recipeName,
              quantity: carryover.neededFor.requiredQuantity,
            }],
          });
        }
      }
    }

    // Merge into grocery list
    const now = new Date().toISOString();
    let addedCount = 0;
    let mergedCount = 0;

    for (const item of filtered) {
      const key = `${item.name}||${item.unit.toLowerCase().trim()}`;
      const existingIndex = list.items.findIndex(
        (i) => `${i.name.toLowerCase().trim()}||${i.unit.toLowerCase().trim()}` === key,
      );

      if (existingIndex >= 0) {
        // Merge: sum quantities and append sources
        list.items[existingIndex].quantity =
          Math.round((list.items[existingIndex].quantity + item.quantity) * 100) / 100;
        list.items[existingIndex].sources.push(...item.sources);
        mergedCount++;
      } else {
        // Add new item
        const newItem: GroceryListItem = {
          id: randomUUID(),
          name: item.name,
          quantity: Math.round(item.quantity * 100) / 100,
          unit: item.unit,
          category: item.category,
          checked: false,
          sources: item.sources,
          isFlexible: item.isFlexible,
          flexibleDescription: item.flexibleDescription,
          addedAt: now,
        };
        list.items.push(newItem);
        addedCount++;
      }
    }

    // Sort by category then name
    const CATEGORY_ORDER = [
      "produce", "meat", "seafood", "dairy", "bread", "pasta",
      "canned", "condiments", "spices", "pantry", "frozen", "other",
    ];
    list.items.sort((a, b) => {
      const catA = CATEGORY_ORDER.indexOf(a.category);
      const catB = CATEGORY_ORDER.indexOf(b.category);
      const orderA = catA === -1 ? CATEGORY_ORDER.length : catA;
      const orderB = catB === -1 ? CATEGORY_ORDER.length : catB;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    // Re-check protection: if a still-checked row gained net-new required
    // quantity from this re-merge (final qty > pre-resync qty), uncheck it so it
    // isn't cleared as already-purchased. Rows whose quantity is equal or lower
    // stay checked (an unchanged-plan resync must not un-buy an already-bought row).
    for (const [itemId, preQty] of checkedPreResyncQty) {
      const item = list.items.find((i) => i.id === itemId);
      if (item && item.checked && item.quantity > preQty) {
        item.checked = false;
      }
    }

    list.mergedSessionIds.push(sessionId);
    const saved = await saveGroceryList(list);

    return NextResponse.json({ resynced, added: addedCount, merged: mergedCount, list: saved });
  } catch (err) {
    console.error("POST /api/grocery/merge failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
