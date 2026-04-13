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

function toProductMatch(product: HebRawProduct): HebProductMatch {
  const sku = product.SKUs[0];
  const priceInfo = sku?.contextPrices[0]?.salePrice;

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
    matchedAt: new Date().toISOString(),
  };
}

async function matchProduct(
  cookieHeader: string,
  storeId: number,
  itemName: string,
): Promise<HebProductMatch | null> {
  const products = await searchProducts(cookieHeader, itemName, storeId, 5);

  if (products.length === 0) return null;

  const inStock = products.filter(
    (p) => p.inventory.inventoryState === "IN_STOCK",
  );
  const best = inStock.length > 0 ? inStock[0] : products[0];

  return toProductMatch(best);
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

  const fresh = await hasFreshCookies();
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
      const match = await matchProduct(cookieHeader, storeId, item.name);

      if (match) {
        enrichedItems.push({ ...item, heb: match });
        enrichedCount++;
        yield {
          type: "item_done",
          index: i,
          total,
          itemName: item.name,
          matched: true,
          productName: match.name,
          price: match.price?.formatted,
        };
      } else {
        enrichedItems.push(item);
        failures.push({ itemName: item.name, reason: "No results" });
        yield { type: "item_done", index: i, total, itemName: item.name, matched: false };
      }

      // Rate limit: 200ms between searches
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("non-JSON") || message.includes("session expired")) {
        sessionExpired = true;
        enrichedItems.push(item);
        for (const remaining of items.slice(enrichedItems.length)) {
          enrichedItems.push(remaining);
        }
        failures.push({ itemName: item.name, reason: "Session expired" });
        yield { type: "item_error", index: i, total, itemName: item.name, reason: "Session expired" };
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
