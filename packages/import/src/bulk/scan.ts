import * as cheerio from "cheerio";
import { extractRecipeFromUrl } from "../url/extract.js";
import { normalize } from "../normalize.js";
import { checkDuplicates } from "../dedup.js";
import type { BulkScanEvent, ImportResult } from "../types.js";

const DELAY_BETWEEN_URLS_MS = 500;
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch a page and extract all links that look like recipe URLs.
 */
export async function discoverRecipeUrls(
  blogUrl: string,
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(blogUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const baseUrl = new URL(blogUrl);
    const urls = new Set<string>();

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;

      try {
        const resolved = new URL(href, baseUrl).href;

        // Heuristic: links that look like recipe URLs
        if (
          /\/recipes?\/[^/]+/i.test(resolved) ||
          /\/cooking\/[^/]+/i.test(resolved)
        ) {
          // Skip pagination, category, and tag pages
          if (!/\/(page|category|tag|author|search)\//i.test(resolved)) {
            urls.add(resolved);
          }
        }
      } catch {
        // Invalid URL — skip
      }
    });

    return [...urls];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Process multiple URLs sequentially, yielding progress events.
 * Reuses the same streaming pattern as HEB enrichment.
 */
export async function* bulkScanUrls(
  urls: string[],
): AsyncGenerator<BulkScanEvent> {
  const total = urls.length;
  yield { type: "start", total };

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    yield { type: "item_start", index: i, total, url };

    try {
      // Check for existing recipe with this URL
      const dupes = await checkDuplicates("", url);
      if (dupes.some((d) => d.type === "exact_url")) {
        skipped++;
        yield {
          type: "item_skip",
          index: i,
          total,
          url,
          reason: "Already imported",
        };
        await delay();
        continue;
      }

      // Extract recipe
      const extraction = await extractRecipeFromUrl(url);

      if (extraction.extraction.extractionMethod === "html_fallback") {
        skipped++;
        yield {
          type: "item_skip",
          index: i,
          total,
          url,
          reason: "No structured recipe data found",
        };
        await delay();
        continue;
      }

      let { recipe } = extraction.extraction;

      // Normalize
      const normalized = normalize(
        recipe as unknown as Record<string, unknown>,
      );
      if (normalized.success) {
        recipe = normalized.data;
      }

      // Use the source image URL directly — no S3 upload needed
      let imageUrl: string | undefined;
      if (extraction.sourceImageUrl) {
        imageUrl = extraction.sourceImageUrl;
        recipe.imageUrl = imageUrl;
      }

      // Name-based dedup check
      const duplicates = await checkDuplicates(recipe.name, recipe.sourceUrl);

      const result: ImportResult = {
        recipe,
        imageUrl,
        sourceUrl: recipe.sourceUrl,
        duplicates,
        extractionMethod: extraction.extraction.extractionMethod,
      };

      imported++;
      yield { type: "item_done", index: i, total, url, result };
    } catch (err) {
      errors++;
      yield {
        type: "item_error",
        index: i,
        total,
        url,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    await delay();
  }

  yield { type: "complete", imported, skipped, errors };
}

function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, DELAY_BETWEEN_URLS_MS));
}
