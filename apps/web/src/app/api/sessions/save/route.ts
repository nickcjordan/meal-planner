import { NextResponse } from "next/server";
import { getSessionByWeek, createSession, updateSession } from "@meal-planner/db";
import type { DayOfWeek, MealType, PlanExtra } from "@meal-planner/types";

interface SaveRequestBody {
  weekOf: string;
  meals: Array<{
    day: string;
    mealType: string;
    recipeId: string;
  }>;
  extras?: PlanExtra[];
  summary: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveRequestBody;

    const meals = body.meals.map((m) => ({
      day: m.day as DayOfWeek,
      mealType: m.mealType as MealType,
      recipeId: m.recipeId,
    }));

    const existing = await getSessionByWeek(body.weekOf);

    let session;
    if (existing) {
      session = await updateSession(existing.id, {
        meals,
        extras: body.extras,
        summary: body.summary,
        status: "confirmed",
      });
    } else {
      session = await createSession({
        weekOf: body.weekOf,
        status: "confirmed",
        meals,
        extras: body.extras,
        summary: body.summary,
      });
    }

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    console.error("POST /api/sessions/save failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
