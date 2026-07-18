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

/**
 * Emoji per category. The canonical set (see
 * packages/import/src/categorize-categories.ts) each gets a distinct icon, and
 * we also map the common near-synonyms the Claude fallback categorizer or older
 * data occasionally emit (e.g. "cheese", "condiment", "broth", "grain") so they
 * don't fall through to the generic 📦. Keys are lowercased category strings.
 */
export const CATEGORY_ICONS: Record<string, string> = {
  // ── Canonical categories ──
  produce: "🥬",
  meat: "🥩",
  seafood: "🐟",
  dairy: "🧀",
  bread: "🍞",
  pasta: "🍝",
  canned: "🥫",
  condiments: "🫙",
  spices: "🧂",
  pantry: "🫘",
  frozen: "🧊",
  other: "🛒",

  // ── Common aliases / fallback-categorizer outputs ──
  cheese: "🧀",
  eggs: "🥚",
  condiment: "🫙",
  sauce: "🥫",
  sauces: "🥫",
  oil: "🫗",
  oils: "🫗",
  spice: "🧂",
  seasoning: "🧂",
  seasonings: "🧂",
  herb: "🌿",
  herbs: "🌿",
  broth: "🍲",
  stock: "🍲",
  soup: "🍲",
  grain: "🌾",
  grains: "🌾",
  rice: "🍚",
  beans: "🫘",
  legumes: "🫘",
  baking: "🧁",
  bakery: "🥐",
  breakfast: "🥞",
  cereal: "🥣",
  snack: "🍿",
  snacks: "🍿",
  nuts: "🥜",
  dessert: "🍰",
  desserts: "🍰",
  sweets: "🍬",
  candy: "🍬",
  fruit: "🍎",
  fruits: "🍎",
  vegetable: "🥕",
  vegetables: "🥕",
  veggies: "🥕",
  beverage: "🥤",
  beverages: "🥤",
  drinks: "🥤",
  coffee: "☕",
  tea: "🍵",
  alcohol: "🍷",
  wine: "🍷",
  beer: "🍺",
  deli: "🥓",
  poultry: "🍗",
  household: "🧻",
  paper: "🧻",
  cleaning: "🧼",
  baby: "🍼",
  pet: "🐾",
  international: "🌮",
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
