export interface IngredientSwap {
  id: string;
  /** Ingredient to match (e.g. "shallots") */
  from: string;
  /** Replacement ingredient (e.g. "yellow onion") */
  to: string;
  /** Category for grouping in the UI */
  category: string;
  /** Why this swap exists — shown in UI and given to Claude as context */
  reason?: string;
  /** Active/inactive toggle */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateIngredientSwapInput = Omit<
  IngredientSwap,
  "id" | "createdAt" | "updatedAt"
> & {
  isActive?: boolean;
};
