/**
 * Spike 0b (revised): Test cookie-based product search via raw GraphQL.
 *
 * The PKCE OAuth flow is blocked by HEB's security service (Imperva).
 * This spike tests the alternative: using browser session cookies to
 * query HEB's web GraphQL endpoint directly, as proven by the HEBMCP project.
 *
 * To get cookies:
 * 1. Log into heb.com in your browser
 * 2. Open DevTools → Application → Cookies → www.heb.com
 * 3. Copy the values for: sat, reese84, CURR_SESSION_STORE
 * 4. Set them as env vars (see below)
 *
 * Run with:
 *   HEB_SAT="..." HEB_REESE84="..." HEB_STORE_ID="790" npx vitest run src/__tests__/spike-cookies.test.ts --test-timeout=60000
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";

// --- GraphQL query (from HEBMCP project, proven to work) ---

const PRODUCT_SEARCH_QUERY = `query productSearchItems(
  $params: SearchPageParamsV2!
  $searchMode: SearchMode
  $searchContextToken: String
  $searchPageLayout: SearchPageLayout!
) {
  productSearchItems(
    params: $params
    searchMode: $searchMode
    searchContextToken: $searchContextToken
    searchPageLayout: $searchPageLayout
  ) {
    ... on ProductSearchItemsResult {
      searchGrid {
        items {
          __typename
          ... on Product {
            id
            displayName
            decodedDisplayName
            inventory {
              inventoryState
            }
            brand {
              name
              isOwnBrand
            }
            SKUs {
              id
              customerFriendlySize
              contextPrices {
                context
                isOnSale
                isPriceCut
                salePrice {
                  formattedAmount
                  amount
                }
              }
            }
          }
        }
      }
    }
    ... on SearchPageError {
      code
      message
    }
  }
}`;

const QUERY_HASH = createHash("sha256").update(PRODUCT_SEARCH_QUERY).digest("hex");

// --- Types for the response ---

interface HebSearchProduct {
  __typename: string;
  id: string;
  displayName: string;
  decodedDisplayName: string;
  inventory: { inventoryState: string };
  brand: { name: string; isOwnBrand: boolean };
  SKUs: Array<{
    id: string;
    customerFriendlySize: string;
    contextPrices: Array<{
      context: string;
      isOnSale: boolean;
      isPriceCut: boolean;
      salePrice: { formattedAmount: string; amount: number };
    }>;
  }>;
}

interface HebSearchResponse {
  data?: {
    productSearchItems:
      | {
          searchGrid: { items: HebSearchProduct[] };
        }
      | {
          code: string;
          message: string;
        };
  };
  errors?: Array<{ message: string }>;
}

// --- Search function ---

async function searchHeb(
  cookies: string,
  query: string,
  storeId: number,
  pageSize = 5,
): Promise<HebSearchResponse> {
  const response = await fetch("https://www.heb.com/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookies,
    },
    body: JSON.stringify({
      operationName: "productSearchItems",
      query: PRODUCT_SEARCH_QUERY,
      variables: {
        params: {
          query,
          storeId,
          shoppingContext: "CURBSIDE_PICKUP",
          pageIndex: 0,
          pageSize,
        },
        searchPageLayout: "WEB_SEARCH_PAGE_LAYOUT",
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: QUERY_HASH,
        },
      },
    }),
  });

  const text = await response.text();

  // Log non-JSON responses (Imperva block pages, CAPTCHAs, etc.)
  if (!text.startsWith("{")) {
    console.log(`\n[DEBUG] Non-JSON response (HTTP ${response.status}):`);
    console.log(text.substring(0, 500));
    throw new Error(`Non-JSON response (HTTP ${response.status}): ${text.substring(0, 100)}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
  }

  return JSON.parse(text) as HebSearchResponse;
}

// --- Helpers ---

function buildCookieString(): string | null {
  const sat = process.env.HEB_SAT;
  const reese84 = process.env.HEB_REESE84;

  if (!sat) return null;

  let cookies = `sat=${sat}`;
  if (reese84) cookies += `; reese84=${reese84}`;

  const storeId = process.env.HEB_STORE_ID ?? "790";
  cookies += `; CURR_SESSION_STORE=${storeId}`;

  return cookies;
}

function getStoreId(): number {
  return parseInt(process.env.HEB_STORE_ID ?? "790", 10);
}

// --- Tests ---

const hasCookies = !!process.env.HEB_SAT;

describe("GraphQL query setup", () => {
  it("computes a valid sha256 hash of the query", () => {
    expect(QUERY_HASH).toMatch(/^[a-f0-9]{64}$/);
    console.log("Query hash:", QUERY_HASH);
  });
});

describe.skipIf(!hasCookies)("cookie-based product search", () => {
  let cookies: string;
  let storeId: number;

  beforeAll(() => {
    cookies = buildCookieString()!;
    storeId = getStoreId();
    console.log(`\nUsing store ID: ${storeId}`);
    console.log(`Cookie string length: ${cookies.length}`);
  });

  it("searches for a common grocery item", async () => {
    console.log('\n--- Searching: "whole milk" ---');
    const result = await searchHeb(cookies, "whole milk", storeId, 3);

    if (result.errors) {
      console.log("GraphQL errors:", result.errors);
      throw new Error(`GraphQL error: ${result.errors[0].message}`);
    }

    const data = result.data?.productSearchItems;
    if (!data) {
      console.log("No data returned. Full response:", JSON.stringify(result, null, 2));
      throw new Error("No data in response");
    }

    if ("code" in data) {
      console.log("Search error:", data.code, data.message);
      throw new Error(`Search error: ${data.code} - ${data.message}`);
    }

    const products = data.searchGrid.items;
    console.log(`Found ${products.length} products\n`);

    for (const product of products) {
      const price = product.SKUs[0]?.contextPrices[0]?.salePrice;
      const size = product.SKUs[0]?.customerFriendlySize;

      console.log(`  ${product.displayName}`);
      console.log(`    ID: ${product.id}`);
      console.log(`    Brand: ${product.brand.name} (own brand: ${product.brand.isOwnBrand})`);
      console.log(`    Size: ${size ?? "N/A"}`);
      console.log(`    Price: ${price?.formattedAmount ?? "N/A"} (${price?.amount ?? "N/A"})`);
      console.log(`    On sale: ${product.SKUs[0]?.contextPrices[0]?.isOnSale}`);
      console.log(`    Inventory: ${product.inventory.inventoryState}`);
      console.log(`    SKU: ${product.SKUs[0]?.id}`);
      console.log();
    }

    expect(products.length).toBeGreaterThan(0);
    expect(products[0].displayName).toBeDefined();
    expect(products[0].brand).toBeDefined();
  });

  it("searches for multiple grocery items", async () => {
    const queries = ["ground beef", "saltine crackers", "broccoli", "chicken thighs"];

    for (const query of queries) {
      console.log(`\n--- "${query}" ---`);
      const result = await searchHeb(cookies, query, storeId, 2);

      const data = result.data?.productSearchItems;
      if (!data || "code" in data) {
        console.log("  Error or no data");
        continue;
      }

      for (const product of data.searchGrid.items) {
        const price = product.SKUs[0]?.contextPrices[0]?.salePrice;
        console.log(
          `  ${product.displayName} — ${price?.formattedAmount ?? "N/A"} — ${product.inventory.inventoryState}`,
        );
      }

      // Brief pause between searches
      await new Promise((r) => setTimeout(r, 300));
    }
  }, 30_000);

  it("handles no-result searches", async () => {
    const result = await searchHeb(cookies, "xyznonexistent12345", storeId, 5);
    const data = result.data?.productSearchItems;

    if (data && "searchGrid" in data) {
      console.log("No-result search returned:", data.searchGrid.items.length, "items");
      expect(data.searchGrid.items.length).toBe(0);
    } else {
      console.log("No-result search response:", JSON.stringify(data, null, 2));
    }
  });

  it("tests rate limiting with rapid searches", async () => {
    console.log("\n--- Rate limiting test: 8 rapid searches ---");
    const queries = ["milk", "eggs", "bread", "cheese", "apples", "rice", "pasta", "butter"];
    const results: Array<{ query: string; status: string; ms: number }> = [];

    for (const query of queries) {
      const start = Date.now();
      try {
        const result = await searchHeb(cookies, query, storeId, 1);
        if (result.errors) {
          results.push({ query, status: `graphql error: ${result.errors[0].message}`, ms: Date.now() - start });
        } else {
          results.push({ query, status: "ok", ms: Date.now() - start });
        }
      } catch (err: unknown) {
        const error = err as Error;
        results.push({ query, status: `http error: ${error.message.substring(0, 60)}`, ms: Date.now() - start });
      }
      // No delay — testing raw rate limit behavior
    }

    console.table(results);
    const failures = results.filter((r) => r.status !== "ok");
    console.log(`\n${results.length - failures.length} succeeded, ${failures.length} failed`);
  }, 60_000);

  it("logs full response structure for documentation", async () => {
    const result = await searchHeb(cookies, "butter", storeId, 1);
    console.log("\n--- Full response structure ---");
    console.log(JSON.stringify(result, null, 2));
  });
});
