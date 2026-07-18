import { NextResponse } from "next/server";
import { getSessionByWeek, createSession, updateSession } from "@meal-planner/db";
import type {
  DayOfWeek,
  MealType,
  MealAdaptationDecision,
  PlannedMeal,
  PlannedSide,
  PlanExtra,
  SessionStapleItem,
  CarryoverItem,
  CreateSessionInput,
} from "@meal-planner/types";

interface SaveRequestBody {
  weekOf: string;
  meals: Array<{
    day: string;
    mealType: string;
    recipeId: string;
    sides?: PlannedSide[];
    adaptations?: MealAdaptationDecision[];
    cookedAt?: string;
  }>;
  extras?: PlanExtra[];
  groceryStaples?: SessionStapleItem[];
  carryoverItems?: CarryoverItem[];
  summary: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveRequestBody;

    // Preserve sides + cookedAt through the save path (they starve four
    // downstream features — grocery side ingredients, side swap/remove, week
    // view rendering, and pairing analytics — if dropped here).
    const meals: PlannedMeal[] = body.meals.map((m) => ({
      day: m.day as DayOfWeek,
      mealType: m.mealType as MealType,
      recipeId: m.recipeId,
      ...(m.sides !== undefined ? { sides: m.sides } : {}),
      ...(m.adaptations !== undefined ? { adaptations: m.adaptations } : {}),
      ...(m.cookedAt !== undefined ? { cookedAt: m.cookedAt } : {}),
    }));

    const existing = await getSessionByWeek(body.weekOf);

    // Only touch extras/groceryStaples/carryoverItems when the caller actually
    // sent the key — passing `undefined` would clobber stored arrays on re-save.
    const optionalArrays: Pick<
      Partial<CreateSessionInput>,
      "extras" | "groceryStaples" | "carryoverItems"
    > = {};
    if ("extras" in body) optionalArrays.extras = body.extras;
    if ("groceryStaples" in body) optionalArrays.groceryStaples = body.groceryStaples;
    if ("carryoverItems" in body) optionalArrays.carryoverItems = body.carryoverItems;

    let session;
    if (existing) {
      // Re-saving a completed week preserves its completed status.
      session = await updateSession(existing.id, {
        meals,
        ...optionalArrays,
        summary: body.summary,
        status: existing.status === "completed" ? "completed" : "confirmed",
      });
    } else {
      session = await createSession({
        weekOf: body.weekOf,
        status: "confirmed",
        meals,
        ...optionalArrays,
        summary: body.summary,
      });
    }

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    console.error("POST /api/sessions/save failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
