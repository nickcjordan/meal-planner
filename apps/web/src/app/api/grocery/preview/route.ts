import { NextResponse } from "next/server";
import {
  getRecipe,
  getSidesBatch,
  listDietaryAdaptations,
  listFamilyMembers,
  listPantryItems,
  listPreferences,
} from "@meal-planner/db";
import type {
  CarryoverItem,
  GroceryListItem,
  PlanExtra,
  SessionStapleItem,
} from "@meal-planner/types";
import {
  assembleGroceryContext,
  buildGroceryItems,
  compareGroceryItems,
  type BuildGroceryInput,
  type BuildMealInput,
} from "@/lib/grocery-builder";
import { randomUUID } from "crypto";

/** POST /api/grocery/preview body (frozen contract §3). */
interface GroceryPreviewRequest {
  weekOf: string;
  meals: BuildMealInput[];
  extras?: PlanExtra[];
  groceryStaples?: SessionStapleItem[];
  carryoverItems?: CarryoverItem[];
  excludedIngredients?: string[];
}

/**
 * Compute a fresh grocery list for an in-flight draft plan WITHOUT persisting
 * anything. Runs the same builder as the merge route so the preview matches
 * exactly what a save+merge would produce. Returns `{ items, count, warnings }`.
 *
 * A synthetic sessionId ("preview") is written into item source provenance since
 * no session exists yet; nothing is persisted so it never reaches storage.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GroceryPreviewRequest;

    if (!body.weekOf) {
      return NextResponse.json({ error: "weekOf is required" }, { status: 400 });
    }

    const input: BuildGroceryInput = {
      sessionId: "preview",
      weekOf: body.weekOf,
      meals: body.meals ?? [],
      extras: body.extras,
      groceryStaples: body.groceryStaples,
      carryoverItems: body.carryoverItems,
      excludedIngredients: body.excludedIngredients,
    };

    const context = await assembleGroceryContext(input, {
      getRecipe,
      getSidesBatch,
      listDietaryAdaptations,
      listFamilyMembers,
      listPantryItems,
      listPreferences,
    });

    const { items, warnings } = buildGroceryItems(input, context);

    const now = new Date().toISOString();
    const listItems: GroceryListItem[] = items
      .map((item) => ({
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
      }))
      .sort(compareGroceryItems);

    return NextResponse.json({
      items: listItems,
      count: listItems.length,
      warnings,
    });
  } catch (err) {
    console.error("POST /api/grocery/preview failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
