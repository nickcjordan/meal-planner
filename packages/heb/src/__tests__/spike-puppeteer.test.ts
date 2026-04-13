/**
 * Spike: Validate Puppeteer-based cookie refresh + GraphQL search.
 *
 * This test:
 * 1. Launches Chrome via puppeteer-core (uses your installed Chrome, no download)
 * 2. Navigates to heb.com to solve the Imperva challenge
 * 3. Extracts session cookies
 * 4. Uses those cookies for raw GraphQL product search via fetch()
 *
 * Run with:
 *   HEB_SPIKE_PUPPETEER=1 npx vitest run src/__tests__/spike-puppeteer.test.ts --test-timeout=120000
 *
 * Optional env vars:
 *   HEB_STORE_ID=790        (default: 790)
 *   HEB_HEADLESS=false      (set to false to see the browser)
 */
import { describe, it, expect } from "vitest";
import puppeteer, { type Browser, type Page, type Cookie } from "puppeteer-core";
import { createHash } from "node:crypto";

// --- Chrome path ---

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// --- GraphQL query (same as spike-cookies.test.ts) ---

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

// --- Types ---

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

// --- Helpers ---

function cookiesToHeader(cookies: Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function searchWithCookies(
  cookieHeader: string,
  query: string,
  storeId: number,
): Promise<{ products: HebSearchProduct[] } | { error: string }> {
  const response = await fetch("https://www.heb.com/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader,
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
          pageSize: 5,
        },
        searchPageLayout: "WEB_SEARCH_PAGE_LAYOUT",
      },
      extensions: {
        persistedQuery: { version: 1, sha256Hash: QUERY_HASH },
      },
    }),
  });

  const text = await response.text();

  if (!text.startsWith("{")) {
    return { error: `Non-JSON response (HTTP ${response.status}): ${text.substring(0, 200)}` };
  }

  const json = JSON.parse(text);

  if (json.errors) {
    return { error: `GraphQL errors: ${JSON.stringify(json.errors)}` };
  }

  const data = json.data?.productSearchItems;
  if (!data) {
    return { error: `No data: ${JSON.stringify(json).substring(0, 200)}` };
  }

  if ("code" in data) {
    return { error: `Search error: ${data.code} - ${data.message}` };
  }

  return { products: data.searchGrid.items };
}

// --- Tests ---

describe.skipIf(!process.env.HEB_SPIKE_PUPPETEER)("Puppeteer cookie refresh + GraphQL search", () => {
  const storeId = parseInt(process.env.HEB_STORE_ID ?? "790", 10);
  const headless = process.env.HEB_HEADLESS !== "false";

  it(
    "launches Chrome, solves Imperva, extracts cookies, and searches products",
    async () => {
      let browser: Browser | undefined;

      try {
        // Step 1: Launch Chrome
        console.log(`\n1. Launching Chrome (headless: ${headless})...`);
        browser = await puppeteer.launch({
          executablePath: CHROME_PATH,
          headless,
          args: [
            "--disable-blink-features=AutomationControlled",
            "--no-first-run",
            "--no-default-browser-check",
          ],
        });

        const page: Page = await browser.newPage();

        // Set a realistic user agent
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        );

        // Step 2: Navigate to HEB and let Imperva challenge resolve
        console.log("2. Navigating to heb.com...");
        const startNav = Date.now();

        await page.goto("https://www.heb.com/", {
          waitUntil: "networkidle2",
          timeout: 30_000,
        });

        console.log(`   Page loaded in ${Date.now() - startNav}ms`);
        console.log(`   URL: ${page.url()}`);
        console.log(`   Title: ${await page.title()}`);

        // Step 3: Wait for reese84 token to generate
        console.log("3. Waiting for Imperva token generation (5s)...");
        await new Promise((r) => setTimeout(r, 5000));

        // Step 4: Set store context via cookie
        console.log(`4. Setting store context to ${storeId}...`);
        await page.setCookie({
          name: "CURR_SESSION_STORE",
          value: String(storeId),
          domain: ".heb.com",
        });

        // Brief navigation to apply store cookie
        await page.goto(`https://www.heb.com/search?q=milk`, {
          waitUntil: "networkidle2",
          timeout: 30_000,
        });
        await new Promise((r) => setTimeout(r, 2000));

        // Step 5: Extract cookies
        console.log("5. Extracting cookies...");
        const cookies = await page.cookies("https://www.heb.com");

        const cookieNames = cookies.map((c) => c.name);
        console.log(`   ${cookies.length} cookies captured`);
        console.log(`   Key cookies present:`);
        console.log(`     sat: ${cookieNames.includes("sat")}`);
        console.log(`     reese84: ${cookieNames.includes("reese84")}`);
        console.log(`     CURR_SESSION_STORE: ${cookieNames.includes("CURR_SESSION_STORE")}`);

        const cookieHeader = cookiesToHeader(cookies);
        console.log(`   Cookie header length: ${cookieHeader.length} chars`);

        // Step 6: Close browser — we don't need it anymore
        console.log("6. Closing browser...");
        await browser.close();
        browser = undefined;

        // Step 7: Use cookies for GraphQL search
        console.log("\n7. Testing GraphQL product search with extracted cookies...\n");

        const testQueries = ["whole milk", "ground beef", "saltine crackers"];

        for (const query of testQueries) {
          console.log(`--- "${query}" ---`);
          const result = await searchWithCookies(cookieHeader, query, storeId);

          if ("error" in result) {
            console.log(`  ERROR: ${result.error}\n`);
            continue;
          }

          for (const product of result.products.slice(0, 3)) {
            const price = product.SKUs[0]?.contextPrices[0]?.salePrice;
            const size = product.SKUs[0]?.customerFriendlySize;
            const sale = product.SKUs[0]?.contextPrices[0]?.isOnSale ? " (ON SALE)" : "";
            console.log(
              `  ${product.displayName} — ${price?.formattedAmount ?? "N/A"} — ${size ?? ""} — ${product.inventory.inventoryState}${sale}`,
            );
          }
          console.log();

          expect(result.products.length).toBeGreaterThan(0);

          // Brief pause
          await new Promise((r) => setTimeout(r, 300));
        }

        // Step 8: Save cookies for future use
        console.log("8. Saving cookies to tmp/heb-cookies.json...");
        const { writeFileSync, mkdirSync } = await import("node:fs");
        mkdirSync("tmp", { recursive: true });
        writeFileSync(
          "tmp/heb-cookies.json",
          JSON.stringify(
            {
              cookies: cookies.map((c) => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                expires: c.expires,
              })),
              storeId,
              capturedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
        console.log("   Done!\n");

        console.log("=== SPIKE RESULT: SUCCESS ===");
        console.log("Puppeteer cookie refresh + GraphQL search works end-to-end.");
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    },
    { timeout: 90_000 },
  );
});
