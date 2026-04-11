export interface MealFeedback {
  sessionId: string;
  recipeId: string;
  wasMade: boolean;
  rating: number;
  comment: string;
  createdAt: string;
}

export type CreateFeedbackInput = Omit<MealFeedback, "createdAt">;
