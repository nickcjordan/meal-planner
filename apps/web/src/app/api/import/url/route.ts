import { NextResponse } from "next/server";
import {
  extractRecipeFromUrl,
  checkDuplicates,
  normalize,
  applySwaps,
} from "@meal-planner/import";
import type { ImportResult } from "@meal-planner/import";
import { listActiveIngredientSwaps } from "@meal-planner/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = body.url;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing required field: url" },
        { status: 400 },
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // Extract recipe from URL
    const extraction = await extractRecipeFromUrl(url);

    if (extraction.extraction.extractionMethod === "html_fallback") {
      // No JSON-LD found — return the page text for client-side display
      // In future, this could be sent to the Agent SDK for parsing
      return NextResponse.json(
        {
          error: "no_jsonld",
          message:
            "This page doesn't have structured recipe data. Try a different recipe site, or use the text import to paste the recipe manually.",
          pageText: extraction.pageText?.slice(0, 5000),
        },
        { status: 422 },
      );
    }

    let { recipe } = extraction.extraction;

    // Normalize the recipe
    const normalized = normalize(recipe as unknown as Record<string, unknown>);
    if (normalized.success) {
      recipe = normalized.data;

      // Apply active ingredient swaps
      const activeSwaps = await listActiveIngredientSwaps();
      if (activeSwaps.length > 0) {
        const { recipe: swapped } = applySwaps(
          recipe,
          activeSwaps.map((s) => ({ from: s.from, to: s.to })),
        );
        recipe = swapped;
      }
    }

    // Use the source image URL directly — no S3 upload needed
    let imageUrl: string | undefined;
    if (extraction.sourceImageUrl) {
      imageUrl = extraction.sourceImageUrl;
      recipe.imageUrl = imageUrl;
    }

    // Check for duplicates
    const duplicates = await checkDuplicates(recipe.name, recipe.sourceUrl);

    const result: ImportResult = {
      recipe,
      imageUrl,
      sourceUrl: recipe.sourceUrl,
      duplicates,
      extractionMethod: extraction.extraction.extractionMethod,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to import recipe";

    // Distinguish between fetch errors and other errors. HTTP-status failures
    // (403/404/…) are thrown as HttpStatusError with an `HTTP <status>` message
    // prefix; treat those as fetch failures too rather than a generic 500.
    if (
      /^HTTP \d{3}/.test(message) ||
      message.includes("fetch") ||
      message.includes("ENOTFOUND") ||
      message.includes("abort")
    ) {
      return NextResponse.json(
        {
          error: "fetch_failed",
          message: `Could not fetch the URL. The site may be blocking requests or the URL may be incorrect.`,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
