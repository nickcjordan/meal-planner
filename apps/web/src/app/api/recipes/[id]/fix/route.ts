import { NextResponse } from "next/server";
import { getRecipe } from "@meal-planner/db";
import { fixRecipe } from "@meal-planner/agent";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const recipe = await getRecipe(id);
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  try {
    const result = await fixRecipe(recipe);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fix analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
