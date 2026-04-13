import { NextResponse } from "next/server";
import {
  searchMealDb,
  getMealDbRecipe,
  listCategories,
  listAreas,
  filterByCategory,
  filterByArea,
  getRandomMeal,
} from "@meal-planner/import";

/**
 * GET /api/import/search
 *
 * Modes (via query params):
 *   ?q=chicken              — search by name
 *   ?mode=categories        — list all categories
 *   ?mode=areas             — list all cuisines
 *   ?mode=browse&category=X — browse recipes in a category
 *   ?mode=browse&area=X     — browse recipes in a cuisine
 *   ?mode=random            — get a random recipe
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const q = searchParams.get("q");

  try {
    // Search by name
    if (q && q.trim().length >= 2) {
      const results = await searchMealDb(q.trim());
      return NextResponse.json({ results, mode: "search" });
    }

    // List categories
    if (mode === "categories") {
      const categories = await listCategories();
      return NextResponse.json({ categories });
    }

    // List cuisines/areas
    if (mode === "areas") {
      const areas = await listAreas();
      return NextResponse.json({ areas });
    }

    // Browse by category or area
    if (mode === "browse") {
      const category = searchParams.get("category");
      const area = searchParams.get("area");

      if (category) {
        const results = await filterByCategory(category);
        return NextResponse.json({ results, filter: { category } });
      }
      if (area) {
        const results = await filterByArea(area);
        return NextResponse.json({ results, filter: { area } });
      }

      return NextResponse.json(
        { error: "Provide 'category' or 'area' param with mode=browse" },
        { status: 400 },
      );
    }

    // Random recipe
    if (mode === "random") {
      const recipe = await getRandomMeal();
      if (!recipe) {
        return NextResponse.json(
          { error: "Could not fetch random recipe" },
          { status: 500 },
        );
      }
      return NextResponse.json({ recipe });
    }

    return NextResponse.json(
      { error: "Provide 'q' for search or 'mode' (categories|areas|browse|random)" },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/import/search
 * Import a recipe from an external API by ID.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, externalId } = body as {
      provider?: string;
      externalId?: string;
    };

    if (!provider || !externalId) {
      return NextResponse.json(
        { error: "Provide 'provider' and 'externalId'" },
        { status: 400 },
      );
    }

    if (provider === "themealdb") {
      const result = await getMealDbRecipe(externalId);
      if (!result) {
        return NextResponse.json(
          { error: "Recipe not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({
        recipe: result.recipe,
        imageUrl: result.thumbnail,
        provider,
      });
    }

    return NextResponse.json(
      { error: `Unknown provider: ${provider}` },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
