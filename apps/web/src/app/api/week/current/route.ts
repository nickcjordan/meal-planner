import { NextResponse } from "next/server";
import { getSessionByWeek, getRecipesBatch } from "@meal-planner/db";
import { getCurrentMonday } from "@/lib/week";

export async function GET() {
  try {
    const weekOf = getCurrentMonday();
    const session = await getSessionByWeek(weekOf);

    if (!session || session.status === "draft") {
      return NextResponse.json({ session: null, recipes: {} });
    }

    const recipeIds = [...new Set(session.meals.map((m) => m.recipeId))];
    const recipesMap = await getRecipesBatch(recipeIds);
    const recipes = Object.fromEntries(recipesMap);

    return NextResponse.json({ session, recipes });
  } catch (err) {
    console.error("Failed to fetch current week:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
