/**
 * Backfill planning-derived fields on all recipe items.
 *
 * Computes and writes:
 * - ingredientNames (flattened from ingredientSections)
 * - primaryProtein (keyword heuristic — Claude handles future recipes)
 * - cuisineType (derived from tags)
 * - avgRating (from HISTORY records)
 * - lastCookedAt (from HISTORY records)
 * - GSI2PK ("RECIPES") for the planning GSI
 *
 * Idempotent — safe to re-run anytime.
 */

import { listRecipes, getRecipeHistory, updateRecipe } from "@meal-planner/db";

const PROTEIN_KEYWORDS: Record<string, string[]> = {
  chicken: ["chicken", "chicken breast", "chicken thigh", "chicken thighs", "chicken drumstick", "chicken wing"],
  beef: ["beef", "ground beef", "steak", "flank steak", "sirloin", "chuck roast", "brisket", "short rib"],
  pork: ["pork", "pork chop", "pork loin", "pork tenderloin", "pork shoulder", "bacon", "ham", "sausage"],
  salmon: ["salmon", "salmon fillet"],
  shrimp: ["shrimp", "prawns"],
  turkey: ["turkey", "ground turkey", "turkey breast"],
  lamb: ["lamb", "lamb chop", "ground lamb", "lamb shoulder"],
  tofu: ["tofu", "tempeh"],
  fish: ["tilapia", "cod", "halibut", "mahi mahi", "tuna", "swordfish", "sea bass", "snapper"],
};

function deriveProtein(ingredientNames: string[]): string {
  const lower = ingredientNames.map((n) => n.toLowerCase());

  // Count matches per protein category
  const counts: Record<string, number> = {};
  for (const [protein, keywords] of Object.entries(PROTEIN_KEYWORDS)) {
    counts[protein] = lower.filter((name) =>
      keywords.some((kw) => name.includes(kw)),
    ).length;
  }

  // Pick the protein with the most ingredient matches
  const best = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])[0];

  return best?.[0] ?? "none";
}

const CUISINE_TAG_MAP: Record<string, string> = {
  italian: "italian",
  mexican: "mexican",
  asian: "asian",
  chinese: "asian",
  japanese: "japanese",
  korean: "korean",
  thai: "thai",
  indian: "indian",
  mediterranean: "mediterranean",
  greek: "greek",
  french: "french",
  cajun: "cajun",
  southern: "american",
  american: "american",
  tex_mex: "mexican",
  "tex-mex": "mexican",
  vietnamese: "asian",
  middle_eastern: "mediterranean",
  "middle-eastern": "mediterranean",
};

function deriveCuisine(tags: string[]): string {
  const lower = tags.map((t) => t.toLowerCase());
  for (const tag of lower) {
    if (CUISINE_TAG_MAP[tag]) return CUISINE_TAG_MAP[tag];
  }
  return "american";
}

async function main() {
  console.log("Backfilling planning fields on all recipes...\n");

  const recipes = await listRecipes();
  console.log(`Found ${recipes.length} recipes.\n`);

  let updated = 0;

  for (const recipe of recipes) {
    const ingredientNames = recipe.ingredientSections.flatMap((s) =>
      s.items.map((i) => i.name),
    );
    const primaryProtein = recipe.primaryProtein ?? deriveProtein(ingredientNames);
    const cuisineType = recipe.cuisineType ?? deriveCuisine(recipe.tags);

    // Compute avgRating and lastCookedAt from history
    const history = await getRecipeHistory(recipe.id, 20);
    const rated = history.filter((h) => h.rating != null && h.wasMade);
    const avgRating = rated.length > 0
      ? rated.reduce((sum, h) => sum + h.rating, 0) / rated.length
      : null;
    const lastCookedAt = history.find((h) => h.wasMade)?.createdAt ?? null;

    await updateRecipe(recipe.id, {
      ingredientNames,
      primaryProtein,
      cuisineType,
      avgRating,
      lastCookedAt,
    });

    console.log(
      `  ${recipe.name}: protein=${primaryProtein}, cuisine=${cuisineType}, ` +
      `rating=${avgRating != null ? avgRating.toFixed(1) : "none"}, ` +
      `lastCooked=${lastCookedAt ?? "never"}`,
    );
    updated++;
  }

  console.log(`\nDone. Updated ${updated} recipes.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
