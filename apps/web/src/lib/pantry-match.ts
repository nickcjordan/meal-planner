import type { PantryItem } from "@meal-planner/types";

/**
 * Check if an ingredient name matches any pantry item.
 * Uses normalizedName, aliases, and substring containment.
 */
export function isPantryItem(
  ingredientName: string,
  pantryItems: PantryItem[],
): boolean {
  const normalized = ingredientName.toLowerCase().trim();
  if (!normalized) return false;

  return pantryItems.some(
    (p) =>
      p.normalizedName === normalized ||
      (p.aliases ?? []).some((a) => a.toLowerCase() === normalized) ||
      // "boneless skinless chicken breast" contains "chicken breast"
      normalized.includes(p.normalizedName),
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
