import { NextResponse } from "next/server";
import { listRecipes, createRecipe, updateRecipe } from "@meal-planner/db";
import { enhanceRecipe } from "@meal-planner/agent";
import type { CreateRecipeInput } from "@meal-planner/types";

export async function GET() {
  try {
    const recipes = await listRecipes();
    return NextResponse.json(recipes);
  } catch (err) {
    console.error("GET /api/recipes failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateRecipeInput;
    let recipe = await createRecipe(body);

    // Auto-enhance every new recipe on ingestion
    try {
      const { changes } = await enhanceRecipe(recipe);
      if (Object.keys(changes).length > 0) {
        recipe = (await updateRecipe(recipe.id, changes)) ?? recipe;
      }
    } catch {
      // Enhance failure is non-fatal — recipe was saved successfully
    }

    return NextResponse.json(recipe, { status: 201 });
  } catch (err) {
    console.error("POST /api/recipes failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
