import type { CreateRecipeInput } from "@meal-planner/types";
import { parseJsonLd, extractPageText } from "./jsonld.js";
import { normalize } from "../normalize.js";
import type { ExtractionResult } from "../types.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;

export interface UrlExtractionResult {
  extraction: ExtractionResult;
  sourceImageUrl?: string;
  /** Raw page text for fallback display if needed */
  pageText?: string;
}

/**
 * Fetch a URL with a browser-like user agent and timeout.
 */
async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract a recipe from a URL.
 *
 * Strategy:
 * 1. Fetch the page HTML
 * 2. Try JSON-LD extraction (covers ~85-90% of recipe sites)
 * 3. If no JSON-LD, return the page text for Agent SDK fallback parsing
 *    (the API route handles the fallback call)
 */
export async function extractRecipeFromUrl(
  url: string,
): Promise<UrlExtractionResult> {
  const html = await fetchPage(url);

  // Try JSON-LD first
  const jsonLdResult = parseJsonLd(html, url);
  if (jsonLdResult) {
    const normalized = normalize(
      jsonLdResult.recipe as unknown as Record<string, unknown>,
    );
    if (normalized.success) {
      return {
        extraction: {
          recipe: normalized.data,
          sourceImageUrl: jsonLdResult.imageUrl,
          extractionMethod: "jsonld",
        },
        sourceImageUrl: jsonLdResult.imageUrl,
      };
    }
    // JSON-LD found but didn't validate — still use what we got
    // and let the user fix it in the preview
    return {
      extraction: {
        recipe: jsonLdResult.recipe,
        sourceImageUrl: jsonLdResult.imageUrl,
        extractionMethod: "jsonld",
      },
      sourceImageUrl: jsonLdResult.imageUrl,
    };
  }

  // No JSON-LD — extract page text for fallback parsing
  const pageText = extractPageText(html);

  // Return a minimal recipe with the page text for the API route
  // to send to the Agent SDK for parsing
  const fallbackRecipe: CreateRecipeInput = {
    name: "",
    description: "",
    ingredients: [],
    steps: [],
    cookTime: 0,
    prepTime: 0,
    servings: 4,
    tags: [],
    categories: [],
    complexity: "standard",
    sourceUrl: url,
  };

  return {
    extraction: {
      recipe: fallbackRecipe,
      extractionMethod: "html_fallback",
    },
    pageText,
  };
}
