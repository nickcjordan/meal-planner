import { NextResponse } from "next/server";
import {
  normalize,
  storeImage,
  checkDuplicates,
  createRecipeInputSchema,
} from "@meal-planner/import";
import { createRecipe } from "@meal-planner/db";
import type { Recipe } from "@meal-planner/types";

interface ImportedResult {
  index: number;
  recipe: Recipe;
}

interface ErrorResult {
  index: number;
  errors: string[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const recipes = body.recipes;
    if (!Array.isArray(recipes) || recipes.length === 0) {
      return NextResponse.json(
        { error: "Provide a 'recipes' array with at least one recipe" },
        { status: 400 },
      );
    }

    if (recipes.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 recipes per import" },
        { status: 400 },
      );
    }

    const imported: ImportedResult[] = [];
    const errors: ErrorResult[] = [];
    const duplicateWarnings: Array<{
      index: number;
      name: string;
      existingName: string;
    }> = [];

    for (let i = 0; i < recipes.length; i++) {
      const raw = recipes[i];

      // Validate against schema
      const parsed = createRecipeInputSchema.safeParse(raw);
      if (!parsed.success) {
        errors.push({
          index: i,
          errors: parsed.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          ),
        });
        continue;
      }

      // Normalize
      const normalized = normalize(raw);
      if (!normalized.success) {
        errors.push({ index: i, errors: normalized.errors });
        continue;
      }

      const recipeInput = normalized.data;

      // Dedup check
      const dupes = await checkDuplicates(
        recipeInput.name,
        recipeInput.sourceUrl,
      );
      if (dupes.some((d) => d.type === "exact_url")) {
        duplicateWarnings.push({
          index: i,
          name: recipeInput.name,
          existingName: dupes[0].existingRecipe.name,
        });
        // Still import — let the user decide. Just warn.
      }

      // Store image if provided as external URL
      if (
        recipeInput.imageUrl &&
        !recipeInput.imageUrl.includes("s3.amazonaws.com")
      ) {
        try {
          const s3Url = await storeImage(recipeInput.imageUrl);
          if (s3Url) {
            recipeInput.imageUrl = s3Url;
          }
        } catch {
          // Keep original URL if S3 upload fails
        }
      }

      // Create the recipe
      const created = await createRecipe(recipeInput);
      imported.push({ index: i, recipe: created });
    }

    return NextResponse.json({
      imported,
      errors,
      duplicateWarnings,
      summary: {
        total: recipes.length,
        imported: imported.length,
        failed: errors.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "JSON import failed",
      },
      { status: 500 },
    );
  }
}
