import { NextResponse } from "next/server";
import {
  getSession,
  getRecipe,
  getShoppingList,
  saveShoppingList,
  listPantryItems,
  getSidesBatch,
} from "@meal-planner/db";
import type { ShoppingListItem, ShoppingListCarryover, Ingredient } from "@meal-planner/types";
import { filterPantryItems } from "@/lib/pantry-match";

function consolidateIngredients(
  allIngredients: { ingredient: Ingredient; recipeId: string }[],
): ShoppingListItem[] {
  const map = new Map<
    string,
    { quantity: number; unit: string; category: string; recipeIds: Set<string> }
  >();

  for (const { ingredient, recipeId } of allIngredients) {
    const name = ingredient.name.toLowerCase().trim();
    const unit = ingredient.unit.toLowerCase().trim();
    const key = `${name}||${unit}`;

    const existing = map.get(key);
    if (existing) {
      existing.quantity += ingredient.quantity;
      existing.recipeIds.add(recipeId);
    } else {
      map.set(key, {
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        category: ingredient.category ?? "other",
        recipeIds: new Set([recipeId]),
      });
    }
  }

  return Array.from(map.entries())
    .map(([key, val]) => ({
      name: key.split("||")[0],
      quantity: Math.round(val.quantity * 100) / 100,
      unit: val.unit,
      category: val.category,
      recipeIds: Array.from(val.recipeIds),
      checked: false,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const list = await getShoppingList(id);
    if (!list) {
      return NextResponse.json({ error: "Shopping list not found" }, { status: 404 });
    }
    return NextResponse.json(list);
  } catch (err) {
    console.error("GET /api/sessions/[id]/shopping failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Fetch all unique recipes
    const recipeIds = [...new Set(session.meals.map((m) => m.recipeId))];
    const recipes = await Promise.all(recipeIds.map((rid) => getRecipe(rid)));

    // Collect all ingredients with recipe source
    const allIngredients: { ingredient: Ingredient; recipeId: string }[] = [];
    for (const recipe of recipes) {
      if (!recipe) continue;
      for (const section of recipe.ingredientSections) {
        for (const ing of section.items) {
          allIngredients.push({ ingredient: ing, recipeId: recipe.id });
        }
      }
    }

    // Include extras ingredients
    if (session.extras) {
      for (const extra of session.extras) {
        for (const ing of extra.ingredients) {
          allIngredients.push({
            ingredient: {
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              category: ing.category,
            },
            recipeId: `extra:${extra.name}`,
          });
        }
      }
    }

    // Include side ingredients (parity with the grocery merge pipeline):
    // "ref" sides resolve their ingredients via getSidesBatch; "inline" sides use
    // their own ingredient list directly.
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
            recipeId: `side:${sideName}`,
          });
        }
      }
    }

    // Consolidate
    let items = consolidateIngredients(allIngredients);

    // Filter pantry items (fuzzy match using normalizedName + aliases)
    const pantryItems = await listPantryItems();
    items = filterPantryItems(items, pantryItems);

    // Add grocery staples from the session
    if (session.groceryStaples) {
      for (const staple of session.groceryStaples) {
        // Check if a recipe ingredient already covers this staple
        const existingIndex = items.findIndex(
          (item) => item.name.toLowerCase() === staple.name.toLowerCase(),
        );
        if (existingIndex >= 0) {
          // Already on the list from a recipe — just tag the source
          items[existingIndex].source = items[existingIndex].source ?? "recipe";
          continue;
        }

        items.push({
          name: staple.name,
          quantity: staple.quantity ?? 0,
          unit: staple.unit ?? "",
          category: staple.category,
          recipeIds: [],
          checked: false,
          source: "staple",
          isFlexible: staple.style === "flexible",
          flexibleDescription: staple.description,
        });
      }
    }

    // Add carryover items the user marked as "I need this" as purchasable lines
    // (parity with the grocery merge pipeline). "confirmed" carryovers remain a
    // reminder only (handled below).
    for (const carryover of session.carryoverItems ?? []) {
      if (carryover.status !== "need") continue;
      const name = carryover.name.toLowerCase().trim();
      const unit = carryover.unit.toLowerCase().trim();
      const existingIndex = items.findIndex(
        (item) =>
          item.name.toLowerCase().trim() === name &&
          item.unit.toLowerCase().trim() === unit,
      );
      if (existingIndex >= 0) {
        items[existingIndex].quantity =
          Math.round(
            (items[existingIndex].quantity + carryover.neededFor.requiredQuantity) * 100,
          ) / 100;
      } else {
        items.push({
          name: carryover.name,
          quantity: carryover.neededFor.requiredQuantity,
          unit: carryover.unit,
          category: "other",
          recipeIds: [],
          checked: false,
        });
      }
    }

    // Build carryover reminders from session carryover items
    const carryoverItems: ShoppingListCarryover[] = (session.carryoverItems ?? [])
      .filter((c) => c.status === "confirmed")
      .map((c) => ({
        name: c.name,
        estimatedQuantity: c.estimatedQuantity,
        unit: c.unit,
        neededForRecipe: c.neededFor.recipeName,
        neededForDay: c.neededFor.day,
        sourceWeekOf: c.source.weekOf,
      }));

    const now = new Date().toISOString();
    const list = await saveShoppingList({
      sessionId: id,
      items,
      carryoverItems: carryoverItems.length > 0 ? carryoverItems : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json(list, { status: 201 });
  } catch (err) {
    console.error("POST /api/sessions/[id]/shopping failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await getShoppingList(id);
    if (!existing) {
      return NextResponse.json({ error: "Shopping list not found" }, { status: 404 });
    }

    const list = await saveShoppingList({
      ...existing,
      items: body.items as ShoppingListItem[],
    });

    return NextResponse.json(list);
  } catch (err) {
    console.error("PATCH /api/sessions/[id]/shopping failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
