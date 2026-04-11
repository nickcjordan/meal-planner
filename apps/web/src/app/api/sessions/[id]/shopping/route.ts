import { NextResponse } from "next/server";
import {
  getSession,
  getRecipe,
  getShoppingList,
  saveShoppingList,
  listPantryItems,
} from "@meal-planner/db";
import type { ShoppingListItem, Ingredient } from "@meal-planner/types";

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
      for (const ing of recipe.ingredients) {
        allIngredients.push({ ingredient: ing, recipeId: recipe.id });
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

    // Consolidate
    let items = consolidateIngredients(allIngredients);

    // Filter pantry items
    const pantryItems = await listPantryItems();
    const pantrySet = new Set(pantryItems.map((p) => p.name.toLowerCase()));
    items = items.filter((item) => !pantrySet.has(item.name));

    const now = new Date().toISOString();
    const list = await saveShoppingList({
      sessionId: id,
      items,
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
