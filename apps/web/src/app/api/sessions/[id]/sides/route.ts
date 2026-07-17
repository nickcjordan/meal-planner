import { NextResponse } from "next/server";
import { getSession, updateSession } from "@meal-planner/db";
import type { DayOfWeek, MealType, PlannedSide } from "@meal-planner/types";

interface SidePatchBody {
  day: DayOfWeek;
  mealType: MealType;
  action: "swap" | "add" | "remove";
  sideIndex?: number;
  newSide?: PlannedSide;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as SidePatchBody;

    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const mealIndex = session.meals.findIndex(
      (m) => m.day === body.day && m.mealType === body.mealType,
    );
    if (mealIndex === -1) {
      return NextResponse.json({ error: "Meal slot not found" }, { status: 404 });
    }

    const meal = session.meals[mealIndex];
    if (!meal.sides) meal.sides = [];

    switch (body.action) {
      case "swap": {
        if (body.sideIndex == null || !body.newSide) {
          return NextResponse.json({ error: "sideIndex and newSide required for swap" }, { status: 400 });
        }
        if (body.sideIndex < 0 || body.sideIndex >= meal.sides.length) {
          return NextResponse.json({ error: "sideIndex out of range" }, { status: 400 });
        }
        meal.sides[body.sideIndex] = body.newSide;
        break;
      }
      case "add": {
        if (!body.newSide) {
          return NextResponse.json({ error: "newSide required for add" }, { status: 400 });
        }
        meal.sides.push(body.newSide);
        break;
      }
      case "remove": {
        if (body.sideIndex == null) {
          return NextResponse.json({ error: "sideIndex required for remove" }, { status: 400 });
        }
        if (body.sideIndex < 0 || body.sideIndex >= meal.sides.length) {
          return NextResponse.json({ error: "sideIndex out of range" }, { status: 400 });
        }
        meal.sides.splice(body.sideIndex, 1);
        break;
      }
    }

    session.meals[mealIndex] = meal;
    const updated = await updateSession(id, { meals: session.meals });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH /api/sessions/[id]/sides failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
