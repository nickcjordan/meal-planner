import { NextResponse } from "next/server";
import { listRecipes, createRecipe } from "@meal-planner/db";
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
    const recipe = await createRecipe(body);
    return NextResponse.json(recipe, { status: 201 });
  } catch (err) {
    console.error("POST /api/recipes failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
