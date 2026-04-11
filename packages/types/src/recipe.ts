export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category?: string;
}

export type RecipeComplexity = "staple" | "standard" | "involved";

export interface NutritionalInfo {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sodium?: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  ingredients: Ingredient[];
  steps: string[];
  cookTime: number;
  prepTime: number;
  servings: number;
  tags: string[];
  categories: string[];
  complexity: RecipeComplexity;
  nutritionalInfo?: NutritionalInfo;
  imageUrl?: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateRecipeInput = Omit<Recipe, "id" | "createdAt" | "updatedAt">;

export type UpdateRecipeInput = Partial<CreateRecipeInput>;
