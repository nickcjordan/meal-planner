import { NextResponse } from "next/server";
import {
  getSession,
  getRecipe,
  listPantryItems,
  ensureGroceryList,
  saveGroceryList,
  listDietaryAdaptations,
  listFamilyMembers,
} from "@meal-planner/db";
import type { GroceryListItem, GroceryItemSource, Ingredient, DietaryAdaptation, FamilyMember } from "@meal-planner/types";
import { filterPantryItems } from "@/lib/pantry-match";
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
    const ingName = ingredient.name.toLowerCase();

    for (const adaptation of active) {
      if (adaptation.leniency === "gentle-reminder") continue;

      for (const rule of adaptation.rules) {
        const ruleName = rule.from.toLowerCase();
        if (!ingName.includes(ruleName) && !ruleName.includes(ingName)) continue;

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
    const { sessionId } = body as { sessionId: string };

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const list = await ensureGroceryList();

    // Idempotent: skip if already merged
    if (list.mergedSessionIds.includes(sessionId)) {
      return NextResponse.json({ merged: 0, added: 0, list });
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
      for (const ing of recipe.ingredients) {
        allIngredients.push({
          ingredient: ing,
          source: {
            type: "recipe",
            sessionId,
            weekOf: session.weekOf,
            recipeId: recipe.id,
            recipeName: recipe.name,
          },
        });
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
            },
          });
        }
      }
    }

    // Apply dietary adaptations (swap ingredients based on active profiles)
    const [adaptations, familyMembers] = await Promise.all([
      listDietaryAdaptations(),
      listFamilyMembers(),
    ]);
    const memberMap = new Map(familyMembers.map((m) => [m.id, m]));
    const adapted = applyAdaptations(allIngredients, adaptations, memberMap);

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
          sources: [{ type: "staple", stapleName: staple.name }],
          isFlexible: staple.style === "flexible",
          flexibleDescription: staple.description,
        });
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

    list.mergedSessionIds.push(sessionId);
    const saved = await saveGroceryList(list);

    return NextResponse.json({ added: addedCount, merged: mergedCount, list: saved });
  } catch (err) {
    console.error("POST /api/grocery/merge failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
