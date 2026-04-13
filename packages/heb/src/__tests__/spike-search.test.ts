/**
 * Spike 0c: Test product search with real HEB tokens.
 *
 * Prerequisites:
 * - Run spike-oauth.test.ts first to obtain tokens (saved to tmp/heb-tokens.json)
 * - OR set HEB_ACCESS_TOKEN and HEB_REFRESH_TOKEN env vars
 *
 * Run with:
 *   HEB_SPIKE_SEARCH=1 npx vitest run src/__tests__/spike-search.test.ts --test-timeout=60000
 *
 * What we're validating:
 * 1. Can we create a session and search for products?
 * 2. What does the response shape look like?
 * 3. What data fields are actually populated?
 * 4. How does rate limiting behave?
 * 5. Does token refresh work?
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTokenSession, HEBClient, type HEBSession } from "heb-sdk-unofficial";
import { readFileSync, existsSync } from "node:fs";

// --- Token loading ---

interface SavedTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
}

function loadTokens(): SavedTokens | null {
  // Try env vars first
  if (process.env.HEB_ACCESS_TOKEN) {
    return {
      accessToken: process.env.HEB_ACCESS_TOKEN,
      refreshToken: process.env.HEB_REFRESH_TOKEN,
    };
  }

  // Try saved file from OAuth spike
  const tokenPath = "tmp/heb-tokens.json";
  if (existsSync(tokenPath)) {
    const data = JSON.parse(readFileSync(tokenPath, "utf-8"));
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      idToken: data.idToken,
    };
  }

  return null;
}

// --- Test data ---

// A commonly available HEB store (use a real store ID for your area)
const TEST_STORE_ID = process.env.HEB_STORE_ID ?? "790";

const SEARCH_QUERIES = [
  "ground beef",
  "saltine crackers",
  "whole milk",
  "chicken thighs",
  "broccoli",
];

// --- Tests ---

describe.skipIf(!process.env.HEB_SPIKE_SEARCH)("HEB product search spike", () => {
  let session: HEBSession;
  let client: HEBClient;

  beforeAll(async () => {
    const tokens = loadTokens();
    if (!tokens) {
      throw new Error(
        "No tokens available. Run spike-oauth.test.ts first, or set HEB_ACCESS_TOKEN env var.",
      );
    }

    session = createTokenSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    client = new HEBClient(session);
  });

  it("sets store context", async () => {
    console.log(`\nSetting store to ID: ${TEST_STORE_ID}`);

    // searchStores to verify the store exists first
    const stores = await client.session; // just verify session is set
    expect(stores).toBeDefined();

    // setStore is imported separately — the client uses session directly
    const { setStore } = await import("heb-sdk-unofficial");
    await setStore(session, TEST_STORE_ID);

    const info = client.getSessionInfo();
    console.log("Session info after setStore:", info);
    expect(info.storeId).toBe(TEST_STORE_ID);
  });

  it("searches for common grocery items", async () => {
    for (const query of SEARCH_QUERIES) {
      console.log(`\n--- Searching: "${query}" ---`);

      const result = await client.search(query, { limit: 3 });

      console.log(`Total results: ${result.totalCount}`);
      console.log(`Products returned: ${result.products.length}`);
      console.log(`Has next page: ${result.hasNextPage}`);

      for (const product of result.products) {
        console.log(`\n  Product: ${product.name}`);
        console.log(`    ID: ${product.productId}`);
        console.log(`    SKU: ${product.skuId}`);
        console.log(`    Brand: ${product.brand ?? "N/A"}`);
        console.log(`    Own brand: ${product.isOwnBrand ?? "N/A"}`);
        console.log(`    Size: ${product.size ?? "N/A"}`);
        console.log(`    Price: ${product.price?.formatted ?? "N/A"}`);
        console.log(`    Unit price: ${product.price?.unitPrice?.formatted ?? "N/A"}`);
        console.log(`    Was price: ${product.price?.wasPrice?.formatted ?? "N/A"}`);
        console.log(`    In stock: ${product.inStock ?? "N/A"}`);
        console.log(`    Available: ${product.isAvailable ?? "N/A"}`);
        console.log(`    Category: ${product.category ?? "N/A"}`);
        console.log(`    Aisle: ${product.fulfillment?.aisleLocation ?? "N/A"}`);
        console.log(`    Curbside: ${product.fulfillment?.curbside ?? "N/A"}`);
        console.log(`    Delivery: ${product.fulfillment?.delivery ?? "N/A"}`);
        console.log(`    In-store: ${product.fulfillment?.inStore ?? "N/A"}`);
        console.log(`    UPC: ${product.upc ?? "N/A"}`);
        console.log(`    Image: ${product.imageUrl ?? "N/A"}`);
        console.log(
          `    Has nutrition: ${product.nutrition ? "yes" : "no"}`,
        );
        console.log(
          `    Has ingredients: ${product.ingredients ? "yes (" + product.ingredients.length + " chars)" : "no"}`,
        );
      }

      expect(result.products.length).toBeGreaterThan(0);

      // Brief pause between searches
      await new Promise((r) => setTimeout(r, 300));
    }
  }, 30_000);

  it("handles no-result searches gracefully", async () => {
    const result = await client.search("xyznonexistentproduct12345", { limit: 5 });
    console.log("\nNo-result search:");
    console.log("  Total count:", result.totalCount);
    console.log("  Products:", result.products.length);
    expect(result.products.length).toBe(0);
  });

  it("tests rate limiting with rapid searches", async () => {
    console.log("\n--- Rate limiting test: 10 rapid searches ---");
    const results: Array<{ query: string; status: string; time: number }> = [];
    const queries = [
      "milk",
      "eggs",
      "bread",
      "cheese",
      "apples",
      "rice",
      "pasta",
      "butter",
      "yogurt",
      "onions",
    ];

    for (const query of queries) {
      const start = Date.now();
      try {
        await client.search(query, { limit: 1 });
        results.push({ query, status: "ok", time: Date.now() - start });
      } catch (err: unknown) {
        const error = err as Error;
        results.push({
          query,
          status: `error: ${error.message}`,
          time: Date.now() - start,
        });
      }
      // No delay — testing raw rate limit behavior
    }

    console.table(results);
    const failures = results.filter((r) => r.status !== "ok");
    console.log(`\n${results.length - failures.length} succeeded, ${failures.length} failed`);
    if (failures.length > 0) {
      console.log("Failures:", failures.map((f) => `${f.query}: ${f.status}`));
    }
  }, 60_000);

  it("gets full product details for a search result", async () => {
    // Search first to get a product ID
    const searchResult = await client.search("whole milk", { limit: 1 });
    expect(searchResult.products.length).toBeGreaterThan(0);

    const productId = searchResult.products[0].productId;
    console.log(`\n--- Getting full details for product ${productId} ---`);

    const product = await client.getProduct(productId);

    console.log(`Name: ${product.name}`);
    console.log(`Brand: ${product.brand}`);
    console.log(`Size: ${product.size}`);
    console.log(`Price: ${product.price?.formatted}`);
    console.log(`Unit price: ${product.price?.unitPrice?.formatted}`);
    console.log(`Aisle: ${product.fulfillment?.aisleLocation ?? "N/A"}`);
    console.log(`UPC: ${product.upc ?? "N/A"}`);

    if (product.nutrition) {
      console.log("\nNutrition info:");
      console.log("  Keys:", Object.keys(product.nutrition));
      console.log("  Full data:", JSON.stringify(product.nutrition, null, 2));
    }

    if (product.ingredients) {
      console.log(`\nIngredients (${product.ingredients.length} chars):`);
      console.log("  ", product.ingredients.substring(0, 200));
    }

    expect(product.name).toBeDefined();
    expect(product.productId).toBe(productId);
  });
});

/**
 * Spike 0d: Test token refresh.
 */
describe.skipIf(!process.env.HEB_SPIKE_SEARCH)("HEB token refresh spike", () => {
  it("refreshes an access token using the refresh token", async () => {
    const tokens = loadTokens();
    if (!tokens?.refreshToken) {
      console.log("Skipping refresh test — no refresh token available");
      return;
    }

    console.log("\n--- Testing token refresh ---");

    // Try refreshing at HEB's token endpoint
    const response = await fetch("https://accounts.heb.com/oidc/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "myheb-ios-prd",
        refresh_token: tokens.refreshToken,
      }).toString(),
    });

    console.log("Refresh response status:", response.status);

    const body = await response.text();

    if (response.ok) {
      const refreshed = JSON.parse(body);
      console.log("\n✓ TOKEN REFRESH SUCCEEDED!");
      console.log("New token response keys:", Object.keys(refreshed));
      console.log("expires_in:", refreshed.expires_in);
      console.log("New access_token length:", refreshed.access_token?.length);
      console.log("New refresh_token length:", refreshed.refresh_token?.length);
      console.log(
        "Same refresh token?",
        refreshed.refresh_token === tokens.refreshToken,
      );

      // Update saved tokens
      if (existsSync("tmp/heb-tokens.json")) {
        const { writeFileSync } = await import("node:fs");
        const updated = {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
          idToken: refreshed.id_token,
          expiresIn: refreshed.expires_in,
          tokenType: refreshed.token_type,
          obtainedAt: new Date().toISOString(),
          refreshedFrom: "spike-search test",
        };
        writeFileSync("tmp/heb-tokens.json", JSON.stringify(updated, null, 2));
        console.log("\nUpdated tokens saved to tmp/heb-tokens.json");
      }

      expect(refreshed.access_token).toBeDefined();
    } else {
      console.log("\n✗ TOKEN REFRESH FAILED");
      console.log("Response:", body);

      // Record but don't necessarily fail — refresh might have restrictions
      console.log(
        "NOTE: Token refresh failure might mean HEB doesn't support refresh for this client ID",
      );
    }
  });
});
