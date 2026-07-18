import { NextResponse } from "next/server";
import {
  getSession,
  getRecipe,
  listPantryItems,
  ensureGroceryList,
  saveGroceryList,
  saveShoppingList,
  listDietaryAdaptations,
  listFamilyMembers,
  listPreferences,
  getSidesBatch,
} from "@meal-planner/db";
import type {
  GroceryList,
  GroceryListItem,
  GroceryItemSource,
  ShoppingListItem,
} from "@meal-planner/types";
import {
  assembleGroceryContext,
  buildGroceryItems,
  compareGroceryItems,
  type BuildGroceryInput,
} from "@/lib/grocery-builder";
import { randomUUID } from "crypto";

/** Read the (optional) sessionId off any source variant that carries one. */
function sourceSessionId(s: GroceryItemSource): string | undefined {
  return "sessionId" in s ? s.sessionId : undefined;
}

/** Read the (optional) per-source contributed quantity off any source variant. */
function sourceQuantity(s: GroceryItemSource): number | undefined {
  return "quantity" in s ? s.quantity : undefined;
}

/** Read the recipeId off a recipe source (only that variant carries one). */
function sourceRecipeId(s: GroceryItemSource): string | undefined {
  return s.type === "recipe" ? s.recipeId : undefined;
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, excludedIngredients: excludedKeys = [] } = body as {
      sessionId: string;
      excludedIngredients?: string[];
    };

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

    // Construct the session's grocery contribution via the shared builder. The
    // saved session's meals already carry day/mealType/sides and (optionally)
    // per-meal adaptation decisions; a meal with no `adaptations` field keeps the
    // historical global-apply behavior inside the builder.
    const input: BuildGroceryInput = {
      sessionId,
      weekOf: session.weekOf,
      meals: session.meals,
      extras: session.extras,
      groceryStaples: session.groceryStaples,
      carryoverItems: session.carryoverItems,
      excludedIngredients: excludedKeys,
    };
    const context = await assembleGroceryContext(input, {
      getRecipe,
      getSidesBatch,
      listDietaryAdaptations,
      listFamilyMembers,
      listPantryItems,
      listPreferences,
    });
    // `warnings` are defense-in-depth advisories consumed only by the preview
    // route; the merge route surfaces items, not warnings.
    const { items: filtered } = buildGroceryItems(input, context);

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
    list.items.sort(compareGroceryItems);

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

    // Persist a per-session snapshot of exactly what THIS plan contributed to the
    // grocery list — the consolidated, pantry-filtered, exclusion-filtered items
    // (`filtered`). Nothing else writes SHOPLIST records now that the legacy
    // route is gone, so the history detail page reads this. Re-runs (including
    // resync re-merges) overwrite it with the current contribution.
    // deleteSession removes this row along with the rest of the session partition.
    const snapshotItems: ShoppingListItem[] = filtered.map((item) => ({
      name: item.name,
      quantity: Math.round(item.quantity * 100) / 100,
      unit: item.unit,
      category: item.category,
      recipeIds: [
        ...new Set(
          item.sources
            .map(sourceRecipeId)
            .filter((id): id is string => !!id),
        ),
      ],
      checked: false,
      isFlexible: item.isFlexible,
      flexibleDescription: item.flexibleDescription,
    }));
    await saveShoppingList({
      sessionId,
      items: snapshotItems,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ resynced, added: addedCount, merged: mergedCount, list: saved });
  } catch (err) {
    console.error("POST /api/grocery/merge failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
