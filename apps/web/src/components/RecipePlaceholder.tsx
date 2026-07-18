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

const PROTEIN_EMOJI: Record<string, string> = {
  chicken: "🍗",
  turkey: "🦃",
  beef: "🥩",
  steak: "🥩",
  pork: "🥓",
  bacon: "🥓",
  ham: "🍖",
  lamb: "🍖",
  fish: "🐟",
  salmon: "🐟",
  tuna: "🐟",
  shrimp: "🍤",
  prawn: "🍤",
  seafood: "🦐",
  shellfish: "🦐",
  crab: "🦀",
  egg: "🥚",
  tofu: "🧊",
  bean: "🫘",
  beans: "🫘",
  lentil: "🫘",
  cheese: "🧀",
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

/** Pick the most specific food emoji available for a recipe. */
export function recipeEmoji({ primaryProtein, cuisineType, tags }: RecipePlaceholderInput): string {
  const byProtein = lookup(PROTEIN_EMOJI, primaryProtein);
  if (byProtein) return byProtein;
  const byCuisine = lookup(CUISINE_EMOJI, cuisineType);
  if (byCuisine) return byCuisine;
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
