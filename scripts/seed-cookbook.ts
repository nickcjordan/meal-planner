import { createRecipe, listRecipes, updateRecipe } from "@meal-planner/db";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { CreateRecipeInput } from "@meal-planner/types";

async function main() {
  const seedPath = resolve(import.meta.dirname, "..", "seed_data", "cookbook-recipes.json");
  const recipes: CreateRecipeInput[] = JSON.parse(readFileSync(seedPath, "utf-8"));

  const existing = await listRecipes();
  const existingByName = new Map(existing.map((r) => [r.name, r]));

  console.log(`Found ${recipes.length} cookbook recipes to seed/update...`);

  let created = 0;
  let updated = 0;

  for (const recipe of recipes) {
    const match = existingByName.get(recipe.name);
    if (match) {
      await updateRecipe(match.id, recipe);
      console.log(`  Updated "${recipe.name}"`);
      updated++;
    } else {
      await createRecipe(recipe);
      console.log(`  Created "${recipe.name}"`);
      created++;
    }
  }

  console.log(`\nDone. Created: ${created}, Updated: ${updated}`);
}

main().catch((err) => {
  console.error("Failed to seed cookbook recipes:", err);
  process.exit(1);
});
