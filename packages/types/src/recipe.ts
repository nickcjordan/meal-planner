export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category?: string;
  prep?: string;
}

export interface IngredientSection {
  header?: string;
  items: Ingredient[];
}

export interface StepSection {
  header?: string;
  steps: string[];
}

export interface StepIngredientRef {
  name: string;
  quantityOverride?: number;
  unit?: string;
  prep?: string;
}

export interface EnrichedStep {
  text: string;
  ingredients?: StepIngredientRef[];
}

export interface EnrichedStepSection {
  header?: string;
  steps: EnrichedStep[];
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

export interface StorageInfo {
  makeAhead?: string;
  refrigerate?: string;
  freeze?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  ingredientSections: IngredientSection[];
  stepSections: StepSection[];
  enrichedStepSections?: EnrichedStepSection[];
  cookTime: number;
  prepTime: number;
  inactiveTime?: number;
  servings: number;
  yieldDescription?: string;
  tags: string[];
  categories: string[];
  complexity: RecipeComplexity;
  notes?: string[];
  equipment?: string[];
  storage?: StorageInfo;
  nutritionalInfo?: NutritionalInfo;
  imageUrl?: string;
  sourceUrl?: string;
  // Derived planning fields — used by get_planning_candidates for efficient filtering/scoring
  primaryProtein?: string;
  cuisineType?: string;
  ingredientNames?: string[];
  avgRating?: number | null;
  lastCookedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateRecipeInput = Omit<Recipe, "id" | "createdAt" | "updatedAt">;

/** Partial recipe update. `enrichedStepSections` accepts an explicit `null`
 *  sentinel meaning "clear the enriched steps" — `updateRecipe` deletes the key
 *  rather than storing a DynamoDB NULL. Omitting the field leaves it unchanged. */
export type UpdateRecipeInput = Partial<Omit<CreateRecipeInput, "enrichedStepSections">> & {
  enrichedStepSections?: EnrichedStepSection[] | null;
};
