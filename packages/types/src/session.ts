export type MealType = "dinner" | "lunch" | "breakfast";

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type PlannedSide =
  | { kind: "ref"; sideId: string }
  | {
      kind: "inline";
      name: string;
      ingredients: import("./side.js").SideIngredient[];
      complexity: import("./side.js").SideComplexity;
      baseIngredient?: string;
      sideCategory?: import("./side.js").SideCategory;
    };

/** A per-meal decision about whether a named dietary adaptation is applied to
 *  that meal's ingredients. Absent `adaptations` on a meal means "apply all
 *  active adaptations" (the historical global behavior). */
export interface MealAdaptationDecision {
  adaptationName: string;
  applied: boolean;
}

export interface PlannedMeal {
  day: DayOfWeek;
  mealType: MealType;
  recipeId: string;
  sides?: PlannedSide[];
  adaptations?: MealAdaptationDecision[];
  cookedAt?: string;
}

export interface PlanExtra {
  name: string;
  description?: string;
  ingredients: { name: string; quantity: number; unit: string; category?: string }[];
}

export type SessionStatus = "draft" | "confirmed" | "completed";

export interface PlanningSession {
  id: string;
  weekOf: string;
  status: SessionStatus;
  meals: PlannedMeal[];
  extras?: PlanExtra[];
  groceryStaples?: import("./staples.js").SessionStapleItem[];
  carryoverItems?: import("./staples.js").CarryoverItem[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateSessionInput = Omit<PlanningSession, "id" | "createdAt" | "updatedAt">;
