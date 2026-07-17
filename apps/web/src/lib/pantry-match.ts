import type { PantryItem } from "@meal-planner/types";
import { namesMatchExact } from "@meal-planner/import";

/**
 * Check if an ingredient name matches any pantry item.
 *
 * Pantry suppression is a *destructive* operation (a matched ingredient is
 * dropped from the grocery list), so it uses the shared `namesMatchExact`
 * matcher: exact token-set equality after normalization + a conservative
 * modifier stoplist. That means pantry "olive oil" still suppresses "extra
 * virgin olive oil" and "chicken breast" still suppresses "boneless skinless
 * chicken breast", but "milk" never suppresses "coconut milk". The matcher
 * guarantees an empty name never matches, so no local empty-string guard is
 * needed.
 */
export function isPantryItem(
  ingredientName: string,
  pantryItems: PantryItem[],
): boolean {
  return pantryItems.some(
    (p) =>
      namesMatchExact(ingredientName, p.normalizedName) ||
      (p.aliases ?? []).some((a) => namesMatchExact(ingredientName, a)),
  );
}

/**
 * Filter out items that match pantry items from a list.
 */
export function filterPantryItems<T extends { name: string }>(
  items: T[],
  pantryItems: PantryItem[],
): T[] {
  return items.filter((item) => !isPantryItem(item.name, pantryItems));
}
