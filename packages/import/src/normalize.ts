import type { CreateRecipeInput, RecipeComplexity } from "@meal-planner/types";
import { createRecipeInputSchema } from "./schema.js";
import { standardizeUnit } from "./ingredients.js";
import type { NormalizeResult } from "./types.js";

/**
 * Infer recipe complexity from ingredient count and step count.
 */
function inferComplexity(
  ingredientCount: number,
  stepCount: number,
): RecipeComplexity {
  if (ingredientCount <= 5 && stepCount <= 3) return "staple";
  if (ingredientCount >= 13 || stepCount >= 8) return "involved";
  return "standard";
}

/**
 * Normalize and validate a raw recipe input object.
 *
 * - Validates against the Zod schema
 * - Standardizes units
 * - Infers complexity if set to "standard" (the default)
 * - Deduplicates and lowercases tags/categories
 */
export function normalize(
  raw: Record<string, unknown>,
): NormalizeResult {
  const parsed = createRecipeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  }

  const data = parsed.data as CreateRecipeInput;

  // Standardize ingredient units
  data.ingredients = data.ingredients.map((ing) => ({
    ...ing,
    unit: standardizeUnit(ing.unit),
  }));

  // Infer complexity if it wasn't explicitly set (default is "standard")
  // Only override if the data suggests it should be different
  if (!raw.complexity) {
    data.complexity = inferComplexity(
      data.ingredients.length,
      data.steps.length,
    );
  }

  return { success: true, data };
}
