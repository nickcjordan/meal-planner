import type {
  ShoppingListItem,
  HebProductMatch,
  HebEnrichmentResult,
} from "@meal-planner/types";
import { searchProducts, type HebRawProduct } from "./search.js";
import { getHebStore } from "./cookies.js";
import { getFreshCookies, hasFreshCookies } from "./session.js";

/**
 * Progress events yielded during enrichment.
 */
export type EnrichmentEvent =
  | { type: "session_check" }
  | { type: "session_refresh"; message: string }
  | { type: "session_ready" }
  | { type: "item_start"; index: number; total: number; itemName: string }
  | { type: "item_done"; index: number; total: number; itemName: string; matched: boolean; productName?: string; price?: string }
  | { type: "item_error"; index: number; total: number; itemName: string; reason: string }
  | { type: "complete"; items: ShoppingListItem[]; result: HebEnrichmentResult };

/**
 * Minimum Dice coefficient (over stemmed token sets) for a search result to be
 * accepted as a confident match. Below this the item is left unenriched and
 * counted as a failure rather than getting the wrong product's price/aisle.
 */
const MATCH_THRESHOLD = 0.4;

/** Number of top search results considered when picking the best match. */
const CANDIDATE_LIMIT = 5;

/** Crude s/es plural stemming so "eggs" and "egg" share a token. */
function stem(token: string): string {
  if (token.length > 2 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 1 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

/** Normalize a product/item name into a set of stemmed tokens. */
function tokenize(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map(stem),
  );
}

/** Dice coefficient over two token sets: 2·|A∩B| / (|A|+|B|). */
export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return (2 * intersection) / (a.size + b.size);
}

/** Name-similarity score (0–1) between a query and a candidate product name. */
export function nameSimilarity(itemName: string, productName: string): number {
  return diceCoefficient(tokenize(itemName), tokenize(productName));
}

/** A search candidate reduced to what the match gate needs. */
export interface MatchCandidate {
  name: string;
  inStock: boolean;
}

/**
 * Pick the best confident match among search candidates for a query item.
 * Applies the Dice similarity threshold, then prefers in-stock, then the
 * highest score. Returns the index of the chosen candidate, or `null` when no
 * candidate clears the threshold.
 */
export function selectBestCandidate(
  itemName: string,
  candidates: MatchCandidate[],
): number | null {
  const queryTokens = tokenize(itemName);

  const qualifying = candidates
    .map((c, index) => ({
      index,
      score: diceCoefficient(queryTokens, tokenize(c.name)),
      inStock: c.inStock,
    }))
    .filter((c) => c.score >= MATCH_THRESHOLD)
    .sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
      return b.score - a.score;
    });

  return qualifying.length > 0 ? qualifying[0].index : null;
}

function toProductMatch(product: HebRawProduct): HebProductMatch {
  const sku = product.SKUs[0];
  const priceInfo = sku?.contextPrices[0]?.salePrice;
  const aisleLocation = sku?.storeLocation?.location || undefined;

  return {
    productId: product.id,
    name: product.displayName,
    brand: product.brand?.name,
    isOwnBrand: product.brand?.isOwnBrand,
    size: sku?.customerFriendlySize,
    price: priceInfo
      ? { amount: priceInfo.amount, formatted: priceInfo.formattedAmount }
      : undefined,
    isOnSale: sku?.contextPrices[0]?.isOnSale ?? false,
    inStock: product.inventory.inventoryState === "IN_STOCK",
    aisleLocation,
    matchedAt: new Date().toISOString(),
  };
}

/** Result of attempting to match one shopping-list item to an HEB product. */
type MatchOutcome =
  | { matched: true; product: HebProductMatch }
  | { matched: false; reason: string };

async function matchProduct(
  cookieHeader: string,
  storeId: number,
  itemName: string,
): Promise<MatchOutcome> {
  const products = await searchProducts(
    cookieHeader,
    itemName,
    storeId,
    CANDIDATE_LIMIT,
  );

  if (products.length === 0) return { matched: false, reason: "No results" };

  const chosen = selectBestCandidate(
    itemName,
    products.map((p) => ({
      name: p.displayName,
      inStock: p.inventory.inventoryState === "IN_STOCK",
    })),
  );

  if (chosen === null) {
    return { matched: false, reason: "No confident match" };
  }

  return { matched: true, product: toProductMatch(products[chosen]) };
}

/**
 * Enrich a shopping list with HEB product data.
 * Yields progress events for real-time UI feedback.
 */
export async function* enrichShoppingListStream(
  items: ShoppingListItem[],
): AsyncGenerator<EnrichmentEvent> {
  const store = await getHebStore();
  const storeId = parseInt(store.storeId, 10);

  // Phase 1: Session
  yield { type: "session_check" };

  const fresh = await hasFreshCookies(store.storeId);
  if (!fresh) {
    yield { type: "session_refresh", message: "Launching browser to establish HEB session..." };
  }

  const cookieHeader = await getFreshCookies(store.storeId);

  if (!cookieHeader) {
    yield {
      type: "complete",
      items,
      result: {
        enrichedCount: 0,
        failedCount: items.length,
        totalCount: items.length,
        failures: [{ itemName: "*", reason: "Could not refresh HEB session" }],
        sessionExpired: true,
      },
    };
    return;
  }

  yield { type: "session_ready" };

  // Phase 2: Search each item
  const enrichedItems: ShoppingListItem[] = [];
  const failures: Array<{ itemName: string; reason: string }> = [];
  let enrichedCount = 0;
  let sessionExpired = false;
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    yield { type: "item_start", index: i, total, itemName: item.name };

    try {
      const outcome = await matchProduct(cookieHeader, storeId, item.name);

      if (outcome.matched) {
        enrichedItems.push({ ...item, heb: outcome.product });
        enrichedCount++;
        yield {
          type: "item_done",
          index: i,
          total,
          itemName: item.name,
          matched: true,
          productName: outcome.product.name,
          price: outcome.product.price?.formatted,
        };
      } else {
        enrichedItems.push(item);
        failures.push({ itemName: item.name, reason: outcome.reason });
        yield { type: "item_done", index: i, total, itemName: item.name, matched: false };
      }

      // Rate limit: 200ms between searches
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("non-JSON") || message.includes("session expired")) {
        sessionExpired = true;
        // Count the item that errored plus every remaining unprocessed item as
        // a failure, so the matched-of-total summary stays honest instead of
        // silently dropping the tail of the list.
        enrichedItems.push(item);
        failures.push({ itemName: item.name, reason: "Session expired" });
        yield { type: "item_error", index: i, total, itemName: item.name, reason: "Session expired" };
        for (const remaining of items.slice(i + 1)) {
          enrichedItems.push(remaining);
          failures.push({ itemName: remaining.name, reason: "Session expired" });
        }
        break;
      }

      enrichedItems.push(item);
      failures.push({ itemName: item.name, reason: message });
      yield { type: "item_error", index: i, total, itemName: item.name, reason: message };
    }
  }

  yield {
    type: "complete",
    items: enrichedItems,
    result: {
      enrichedCount,
      failedCount: failures.length,
      totalCount: items.length,
      failures,
      sessionExpired,
    },
  };
}
