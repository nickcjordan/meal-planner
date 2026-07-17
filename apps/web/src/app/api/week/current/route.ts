import { NextResponse } from "next/server";
import { getSessionByWeek, getRecipesBatch } from "@meal-planner/db";
import { getPlanningMonday, getCurrentMonday } from "@/lib/week";
import type { PlanningSession } from "@meal-planner/types";

function isUsable(session: PlanningSession | null): boolean {
  return session !== null && session.status !== "draft";
}

export async function GET() {
  try {
    const weekOf = getPlanningMonday();
    let session = await getSessionByWeek(weekOf);

    // On weekends `getPlanningMonday()` points at *next* week; if nothing usable
    // has been planned there yet, fall back to the current (ending) week's
    // session so its plan still surfaces on the grocery page.
    if (!isUsable(session)) {
      const day = new Date().getDay(); // 0=Sun, 6=Sat
      if (day === 0 || day === 6) {
        const currentWeek = getCurrentMonday();
        if (currentWeek !== weekOf) {
          const fallback = await getSessionByWeek(currentWeek);
          if (isUsable(fallback)) session = fallback;
        }
      }
    }

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
