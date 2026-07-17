export const CATEGORY_ORDER = [
  "produce",
  "meat",
  "seafood",
  "dairy",
  "bread",
  "pasta",
  "canned",
  "condiments",
  "spices",
  "pantry",
  "frozen",
  "other",
];

// Store-walk order: perimeter sections first, then interior aisles
export const AISLE_CATEGORY_ORDER = [
  "produce",
  "bread",
  "meat",
  "seafood",
  "dairy",
  "frozen",
  "canned",
  "pasta",
  "condiments",
  "spices",
  "pantry",
  "other",
];

export const CATEGORY_ICONS: Record<string, string> = {
  produce: "🥬",
  meat: "🥩",
  seafood: "🐟",
  dairy: "🧈",
  bread: "🍞",
  pasta: "🍝",
  canned: "🥫",
  condiments: "🫙",
  spices: "🧂",
  pantry: "🏠",
  frozen: "🧊",
  other: "📦",
};

/** Group items by category in display order. Works with any item type that has a `category` field. */
export function groupByCategory<T extends { category: string }>(items: T[], order = CATEGORY_ORDER): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const cat of order) {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) groups.set(cat, catItems);
  }
  const known = new Set(order);
  for (const item of items) {
    if (!known.has(item.category)) {
      const existing = groups.get(item.category) ?? [];
      existing.push(item);
      groups.set(item.category, existing);
    }
  }
  return groups;
}
