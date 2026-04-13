export type MealType = "dinner" | "lunch" | "breakfast";

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface PlannedMeal {
  day: DayOfWeek;
  mealType: MealType;
  recipeId: string;
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
