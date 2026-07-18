import clsx from "clsx";

/**
 * Deterministic image placeholder for recipes with no photo: a token-colored
 * gradient derived from the recipe name plus a large food emoji chosen from the
 * recipe's protein / cuisine / first tag. Token colors only, so it reads
 * correctly in light and dark.
 */

// Token-based gradient pairs (static class strings so Tailwind can see them).
const GRADIENTS = [
  "from-accent/25 to-info/15",
  "from-info/25 to-accent/15",
  "from-success/25 to-accent/15",
  "from-warning/25 to-danger/15",
  "from-danger/20 to-warning/15",
  "from-accent/20 to-success/15",
  "from-info/25 to-success/15",
  "from-warning/20 to-accent/15",
] as const;

// Dish-name keywords, checked first and in this order so the most specific
// match wins (e.g. "Chicken Noodle Soup" → soup before noodle). Matched as a
// substring against the lowercased recipe name.
const NAME_EMOJI: [string, string][] = [
  ["hamburger", "🍔"],
  ["burger", "🍔"],
  ["taco", "🌮"],
  ["tostada", "🌮"],
  ["quesadilla", "🌮"],
  ["fajita", "🌮"],
  ["pizza", "🍕"],
  ["soup", "🍲"],
  ["stew", "🍲"],
  ["chili", "🍲"],
  ["salad", "🥗"],
  ["sandwich", "🥪"],
  ["wrap", "🥪"],
  ["pasta", "🍝"],
  ["ziti", "🍝"],
  ["spaghetti", "🍝"],
  ["orecchiette", "🍝"],
  ["mac", "🍝"],
  ["stir-fry", "🍜"],
  ["stir fry", "🍜"],
  ["lo mein", "🍜"],
  ["noodle", "🍜"],
  ["curry", "🍛"],
  ["tikka", "🍛"],
  ["masala", "🍛"],
  ["fried rice", "🍚"],
  ["rice bowl", "🍚"],
  ["meatloaf", "🍖"],
  ["meatball", "🍖"],
  ["omelet", "🍳"],
  ["frittata", "🍳"],
  ["egg", "🍳"],
  ["pancake", "🥞"],
  ["waffle", "🥞"],
];

const PROTEIN_EMOJI: Record<string, string> = {
  chicken: "🍗",
  turkey: "🦃",
  beef: "🥩",
  steak: "🥩",
  pork: "🥓",
  bacon: "🥓",
  sausage: "🥓",
  ham: "🍖",
  lamb: "🍖",
  fish: "🐟",
  salmon: "🐟",
  tilapia: "🐟",
  cod: "🐟",
  tuna: "🐟",
  shrimp: "🦐",
  prawn: "🦐",
  seafood: "🦐",
  shellfish: "🦐",
  crab: "🦀",
  bean: "🫘",
  beans: "🫘",
  lentil: "🫘",
  tofu: "🫘",
};

const CUISINE_EMOJI: Record<string, string> = {
  italian: "🍝",
  mexican: "🌮",
  chinese: "🥡",
  japanese: "🍱",
  indian: "🍛",
  thai: "🍜",
  vietnamese: "🍜",
  korean: "🍚",
  french: "🥖",
  american: "🍔",
  mediterranean: "🫒",
  greek: "🥙",
  spanish: "🥘",
  "middle eastern": "🧆",
};

const TAG_EMOJI: Record<string, string> = {
  dessert: "🍰",
  cake: "🍰",
  cookie: "🍪",
  breakfast: "🍳",
  brunch: "🍳",
  salad: "🥗",
  soup: "🍲",
  stew: "🍲",
  pasta: "🍝",
  noodle: "🍜",
  pizza: "🍕",
  bread: "🍞",
  taco: "🌮",
  burger: "🍔",
  sandwich: "🥪",
  curry: "🍛",
  rice: "🍚",
  grill: "🍖",
  bbq: "🍖",
  smoothie: "🥤",
  drink: "🍹",
  cocktail: "🍹",
  vegetarian: "🥗",
  vegan: "🥗",
};

const DEFAULT_EMOJI = "🍽️";

/** djb2 string hash → non-negative int, for deterministic gradient selection. */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/** Match a dish keyword at a word boundary so short keys don't hit substrings of
 *  unrelated words ("egg" must not match "veggies"), while plurals/suffixes still
 *  match ("taco" → "tacos", "egg" → "eggs"). `name` is expected lowercased. */
function nameMatchesKeyword(name: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}`).test(name);
}

function lookup(map: Record<string, string>, value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (map[v]) return map[v];
  // Substring match: "boneless chicken thigh" → chicken, "north italian" → italian.
  for (const key of Object.keys(map)) {
    if (v.includes(key)) return map[key];
  }
  return undefined;
}

export interface RecipePlaceholderInput {
  name: string;
  primaryProtein?: string;
  cuisineType?: string;
  tags?: string[];
}

/** Pick the most specific food emoji available for a recipe. Deterministic:
 *  dish-name keywords → protein (field, then name) → cuisine (field, then name)
 *  → first matching tag → default. */
export function recipeEmoji({ name, primaryProtein, cuisineType, tags }: RecipePlaceholderInput): string {
  // 1. Dish-name keywords are the strongest signal ("Beef Tacos" → 🌮, not 🥩).
  const n = name.toLowerCase();
  for (const [keyword, emoji] of NAME_EMOJI) {
    if (nameMatchesKeyword(n, keyword)) return emoji;
  }
  // 2. Protein — the explicit field first, then the name as a fallback.
  const byProtein = lookup(PROTEIN_EMOJI, primaryProtein) ?? lookup(PROTEIN_EMOJI, name);
  if (byProtein) return byProtein;
  // 3. Cuisine — the explicit field first, then the name as a fallback.
  const byCuisine = lookup(CUISINE_EMOJI, cuisineType) ?? lookup(CUISINE_EMOJI, name);
  if (byCuisine) return byCuisine;
  // 4. Fall back to the first matching tag.
  for (const tag of tags ?? []) {
    const byTag = lookup(TAG_EMOJI, tag);
    if (byTag) return byTag;
  }
  return DEFAULT_EMOJI;
}

export function RecipePlaceholder({
  recipe,
  className,
}: {
  recipe: RecipePlaceholderInput;
  className?: string;
}) {
  const gradient = GRADIENTS[hashString(recipe.name) % GRADIENTS.length];
  const emoji = recipeEmoji(recipe);
  return (
    <div
      aria-hidden="true"
      className={clsx(
        "flex items-center justify-center bg-gradient-to-br",
        gradient,
        className,
      )}
    >
      <span className="text-5xl opacity-80 drop-shadow-sm">{emoji}</span>
    </div>
  );
}
