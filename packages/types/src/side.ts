export type SideComplexity = "effortless" | "simple" | "prepared";

export type SideCategory =
  | "green"
  | "starch"
  | "grain"
  | "bread"
  | "legume"
  | "salad"
  | "other";

export interface SideIngredient {
  name: string;
  quantity: number;
  unit: string;
  category?: string;
  optional?: boolean;
}

export interface Side {
  id: string;
  name: string;
  baseIngredient: string;
  prepStyle?: string;
  complexity: SideComplexity;
  ingredients: SideIngredient[];
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  tags: string[];
  sideCategory: SideCategory;
  pairingHints?: string[];
  prepNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateSideInput = Omit<Side, "id" | "createdAt" | "updatedAt">;
export type UpdateSideInput = Partial<CreateSideInput>;
