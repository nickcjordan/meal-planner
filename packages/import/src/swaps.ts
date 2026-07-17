import type { CreateRecipeInput } from "@meal-planner/types";
import { namesMatchExact } from "./matching.js";

export interface SwapRule {
  from: string;
  to: string;
}

export interface AppliedSwap {
  sectionIndex: number;
  ingredientIndex: number;
  originalName: string;
  newName: string;
}

/**
 * Decide whether a swap rule applies to an ingredient. Renaming an ingredient is
 * destructive, so this requires an exact token-set match (per the shared
 * matching policy) — "milk → lactose-free milk" must not fire on "coconut milk".
 */
function matchesSwap(ingredientName: string, swapFrom: string): boolean {
  return namesMatchExact(swapFrom, ingredientName);
}

/**
 * Apply ingredient swap rules to a recipe's ingredient sections.
 * Returns the modified recipe and a list of swaps that were applied.
 */
export function applySwaps(
  recipe: CreateRecipeInput,
  swapRules: SwapRule[],
): { recipe: CreateRecipeInput; applied: AppliedSwap[] } {
  if (swapRules.length === 0) {
    return { recipe, applied: [] };
  }

  const applied: AppliedSwap[] = [];

  const updatedSections = recipe.ingredientSections.map((section, si) => ({
    ...section,
    items: section.items.map((item, ii) => {
      for (const rule of swapRules) {
        if (matchesSwap(item.name, rule.from)) {
          applied.push({
            sectionIndex: si,
            ingredientIndex: ii,
            originalName: item.name,
            newName: rule.to,
          });
          return { ...item, name: rule.to };
        }
      }
      return item;
    }),
  }));

  return {
    recipe: { ...recipe, ingredientSections: updatedSections },
    applied,
  };
}
