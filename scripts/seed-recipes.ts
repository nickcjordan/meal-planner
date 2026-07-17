import { createRecipe, getRecipe } from "@meal-planner/db";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { Recipe } from "@meal-planner/types";

type SeedRecipe = Omit<Recipe, "createdAt" | "updatedAt">;

async function main() {
  const seedPath = resolve(import.meta.dirname, "..", "seed_data", "recipes.json");
  const recipes: SeedRecipe[] = JSON.parse(readFileSync(seedPath, "utf-8"));

  console.log(`Seeding ${recipes.length} recipes...`);

  let created = 0;
  let skipped = 0;

  for (const recipe of recipes) {
    const existing = await getRecipe(recipe.id);
    if (existing) {
      console.log(`  Skipping "${recipe.name}" (already exists)`);
      skipped++;
      continue;
    }

    await createRecipe({
      name: recipe.name,
      description: recipe.description,
      ingredientSections: recipe.ingredientSections,
      stepSections: recipe.stepSections,
      cookTime: recipe.cookTime,
      prepTime: recipe.prepTime,
      inactiveTime: recipe.inactiveTime,
      servings: recipe.servings,
      yieldDescription: recipe.yieldDescription,
      tags: recipe.tags,
      categories: recipe.categories,
      complexity: recipe.complexity,
      notes: recipe.notes,
      equipment: recipe.equipment,
      storage: recipe.storage,
      nutritionalInfo: recipe.nutritionalInfo,
      imageUrl: recipe.imageUrl,
      sourceUrl: recipe.sourceUrl,
    });
    console.log(`  Created "${recipe.name}"`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("Failed to seed recipes:", err);
  process.exit(1);
});
