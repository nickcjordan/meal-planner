import { NextResponse } from "next/server";
import { getRecipe, updateRecipe } from "@meal-planner/db";
import { enhanceRecipe } from "@meal-planner/agent";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const recipe = await getRecipe(id);
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  try {
    const { changes, summary } = await enhanceRecipe(recipe);
    if (Object.keys(changes).length > 0) {
      await updateRecipe(id, changes);
    }
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enhancement failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
