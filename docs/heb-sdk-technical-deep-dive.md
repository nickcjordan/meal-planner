# HEB SDK & Product Data: Technical Deep Dive

> Research conducted 2026-04-10. Based on analysis of public GitHub repos and HEB's web/mobile architecture.

## Goal

Evaluate the unofficial HEB integrations for a specific use case: **enriching a generic grocery list with real HEB product data** (names, prices, availability, aisle locations) — not necessarily managing a cart.

---

## 1. heb-sdk-unofficial — Full Analysis

- **Repo:** https://github.com/ihildy/heb-sdk-unofficial
- **npm:** `heb-sdk-unofficial@1.0.1` (302KB unpacked, zero runtime deps, ESM + CJS)
- **Author:** Ian Hildebrand (former HEB intern), built in 3 days, last updated Feb 2026
- **License:** MIT

### Architecture

pnpm monorepo with 4 packages:

| Package | Purpose | Published? |
|---------|---------|------------|
| `packages/heb-sdk` | Core TypeScript SDK wrapping HEB's GraphQL APIs | Yes (npm) |
| `packages/heb-auth` | PKCE/OAuth utilities for mobile bearer tokens | No (workspace) |
| `packages/heb-mcp` | MCP server (STDIO or Streamable HTTP) | No (has Dockerfile) |
| `packages/cookie-bridge-extension` | Chrome/Firefox extension that syncs HEB cookies to MCP server | No |

### Authentication — Two Modes

#### Mode 1: Cookie-based (`authMode: 'cookie'`)

Requires three cookies extracted from a logged-in HEB browser session:

| Cookie | Purpose | Notes |
|--------|---------|-------|
| `sat` | Session Authentication Token (JWT with `exp`) | Primary auth, HttpOnly |
| `reese84` | Imperva/Incapsula bot fingerprint | Critical for anti-bot, shortest lifespan |
| `incap_ses` | Imperva session tracking | |

Cookies are sent as a `Cookie` header to `https://www.heb.com/graphql` (web endpoint). The SDK parses the `sat` JWT expiry with a 60-second buffer.

The **cookie-bridge Chrome extension** automates extraction: watches `chrome.cookies.onChanged` for `sat` and `reese84` on `*.heb.com`, POSTs them to the MCP server's `/api/cookies` endpoint. Stored locally at `~/.heb-sdk-unofficial/cookies.json`.

**Critical limitation:** Cookie auth does NOT support product search. It only works for typeahead, store search, and some cart operations via the web endpoint.

#### Mode 2: Bearer token (`authMode: 'bearer'`)

Reverse-engineers HEB's iOS app OAuth flow:

1. PKCE flow with client ID `myheb-ios-prd` against `https://accounts.heb.com/oidc/auth`
2. Token exchange at `https://accounts.heb.com/oidc/token`
3. Returns `access_token`, `refresh_token`, `id_token`
4. Bearer token sent to `https://api-edge.heb-ecom-api.hebdigital-prd.com/graphql` (mobile API endpoint)
5. User-Agent spoofs iOS app: `MyHEB/5.9.0.60733 (iOS 18.7.2; iPhone16,2)`
6. Supports `refreshTokens()` for renewal

**Bearer auth is required for product search.** This is the mode you'd need.

### Product Search — What You Get Back

```typescript
import { createTokenSession, HEBClient } from 'heb-sdk-unofficial';

const session = createTokenSession({
  accessToken: process.env.HEB_ACCESS_TOKEN!,
  refreshToken: process.env.HEB_REFRESH_TOKEN,
});

const heb = new HEBClient(session);
await heb.setStore('790'); // Store context required before searching

const results = await heb.search('crackers', { limit: 10 });

for (const product of results.products) {
  console.log({
    name: product.name,                        // "H-E-B Select Ingredients Water Crackers"
    brand: product.brand,                      // "H-E-B"
    isOwnBrand: product.isOwnBrand,            // true
    price: product.price?.formatted,           // "$3.29"
    unitPrice: product.price?.unitPrice?.formatted, // "$0.47/oz"
    size: product.size,                        // "7 oz"
    inStock: product.inStock,                  // true
    category: product.category,                // "Crackers"
    aisle: product.fulfillment?.aisleLocation,  // "Aisle 5"
    curbside: product.fulfillment?.curbside,    // true
    delivery: product.fulfillment?.delivery,    // true
    productId: product.productId,              // "1234567"
    skuId: product.skuId,                      // needed for cart ops
    imageUrl: product.imageUrl,                // HEB CDN URL
  });
}
```

Full product detail response shape:

```typescript
interface Product {
  productId: string;
  skuId: string;
  name: string;
  brand?: string;
  isOwnBrand?: boolean;
  description?: string;        // HTML cleaned to plain text
  price?: {
    amount: number;
    formatted: string;         // "$4.99"
    wasPrice?: number;         // if on sale
    unitPrice?: {
      amount: number;
      unit: string;            // "oz", "lb", "ct", etc.
      formatted: string;       // "$0.31/oz"
    };
  };
  nutrition?: {
    servingSize?: string;
    calories?: number;
    totalFat?: string;
    sodium?: string;
    // ... full nutrition label fields
  };
  ingredients?: string;
  fulfillment?: {
    curbside: boolean;
    delivery: boolean;
    inStore: boolean;
    aisleLocation?: string;    // "Aisle 5"
  };
  size?: string;               // "16 oz"
  category?: string;
  isAvailable?: boolean;
  inStock?: boolean;
  maxQuantity?: number;
  imageUrl?: string;
  images?: string[];           // if includeImages: true
}
```

Image URL pattern: `https://images.heb.com/is/image/HEBGrocery/{productId}?hei=360&wid=360`

### Other Relevant API Calls

| Method | Use Case for Meal Planner |
|--------|--------------------------|
| `heb.search(query, opts)` | Find specific products for a generic ingredient |
| `heb.getProductDetails(id)` | Full nutrition, ingredients, aisle for a specific product |
| `heb.typeahead(partial)` | Autocomplete — useful for fuzzy ingredient matching |
| `heb.getBuyItAgain()` | Previously purchased items — personalized suggestions |
| `heb.searchStores(zip)` | Find user's nearest HEB by zip code |
| `heb.setStore(storeId)` | Set store context (required before any search) |
| `heb.getWeeklyAdProducts()` | Current deals — flag items on sale in the grocery list |
| `heb.getShoppingLists()` | Access HEB's built-in shopping list feature |

### GraphQL Internals

All requests use **Apollo persisted queries** — the SDK never sends raw GraphQL. Instead:

```json
{
  "operationName": "ProductSearchPageV2",
  "variables": { "query": "crackers", "storeId": 790, "pageSize": 24 },
  "extensions": {
    "persistedQuery": {
      "version": 1,
      "sha256Hash": "a723225732e31edad1e7ab28f26177b57e7257c7f457b714d77951f56c85e63e"
    }
  }
}
```

Two endpoint/hash sets:
- **Web:** 10 operations targeting `www.heb.com/graphql`
- **Mobile:** 30+ operations targeting `api-edge.heb-ecom-api.hebdigital-prd.com/graphql`

Mobile API is broader and richer. The SDK routes automatically based on auth mode.

### MCP Server — 20 Tools

| Tool | Read-only? | Relevant to Meal Planner? |
|------|-----------|--------------------------|
| `heb_search_products` | Yes | **Core** — product search |
| `heb_get_product` | Yes | **Core** — product details |
| `heb_search_stores` | Yes | **Core** — store selection |
| `heb_set_store` | No | **Core** — required for search |
| `heb_get_session_info` | Yes | Utility |
| `heb_get_buy_it_again` | Yes | Nice-to-have for personalization |
| `heb_get_homepage` | Yes | Promotions and featured items |
| `heb_add_to_cart` | No | Stretch goal |
| `heb_get_cart` | Yes | Stretch goal |
| `heb_update_cart_item` | No | Stretch goal |
| `heb_remove_from_cart` | No | Stretch goal |
| `heb_get_order_history` | Yes | Personalization |
| `heb_get_order_details` | Yes | Personalization |
| `heb_get_account_details` | Yes | User info |
| `heb_get_delivery_slots` | Yes | Ordering flow |
| `heb_reserve_slot` | No | Ordering flow |
| `heb_get_curbside_slots` | Yes | Ordering flow |
| `heb_reserve_curbside_slot` | No | Ordering flow |
| `heb_get_shopping_lists` | Yes | List sync |
| `heb_get_shopping_list` | Yes | List sync |

---

## 2. HEBMCP — Comparison

- **Repo:** https://github.com/gigq/HEBMCP
- Single flat TypeScript project, ~500 lines, 0 stars
- **2 tools only:** `searchItems` + `addToCart`
- Auth: browser cookies exported as TSV file (`HEB_COOKIE_TSV` env var)
- Sends full GraphQL query text (not just persisted hashes)
- Web endpoint only — no mobile API
- STDIO transport only (Claude Desktop local use)

Search returns less data than the ihildy SDK:
- `id`, `displayName`, `brand.name`, `brand.isOwnBrand`
- `inventory.inventoryState`
- `SKUs[].id`, `SKUs[].customerFriendlySize`, `SKUs[].contextPrices[]` (with `formattedAmount`, `amount`, `isOnSale`, `isPriceCut`)

**Missing vs ihildy SDK:** No nutrition, no ingredients, no fulfillment info, no aisle location, no images, no product details endpoint.

**Verdict:** The ihildy SDK is strictly superior for our use case.

---

## 3. heb-grocery-agent (Chrome Extension)

- **Repo:** https://github.com/michellemayes/heb-grocery-agent
- Browser automation — navigates to `heb.com/search/?q={item}`, clicks "Add to Cart" on first result
- Not useful as a server-side integration
- **Potentially useful reference code:** Has a 1000+ item `GROCERY_DATABASE` of normalized grocery terms and a `listParser.ts` for parsing natural language quantities ("1/2 cup butter" -> structured items)

---

## 4. Bot Detection and Reliability Risks

HEB uses **Imperva/Incapsula** for bot protection:

- `reese84` cookie is a browser fingerprint — expires frequently
- `incap_ses` tracks the Imperva session
- The SDK has **no built-in rate limiting, retry, or backoff**
- HTTP 429 (rate limited) and 401/403 (expired session) are the common failure modes
- Mobile bearer token path may be less aggressively rate-limited than web cookies (designed for app traffic)
- HEB deploys new app versions regularly — **persisted query hashes may change**, breaking all queries instantly

### Practical Brittleness Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Persisted query hashes change | All queries break | Medium (app updates) | Monitor SDK repo for updates; fall back to Claude knowledge |
| Session expires mid-operation | Individual request fails | High | Auto-refresh via SDK hooks; retry logic |
| Bot detection blocks requests | All requests blocked | Medium | Use mobile bearer path; rate limit requests |
| HEB changes API structure | SDK data models break | Low-Medium | Pin SDK version; validate responses |

---

## 5. HEB's Internal Systems (Context)

HEB has solved the ingredient-to-product mapping problem internally:

- **Shoppable Recipes:** `heb.com/discover/shoppable-recipes` — recipes display ingredients mapped to specific HEB products with "add all to cart"
- **SSA (Store Specific Assortment):** Legacy system providing daily product availability snapshots per store with 0-100 confidence scores
- **PALS (Product Assortment & Location Service):** Newer REST API for real-time store assortment and shelf locations (accurate to within 4 feet)
- **Store guide PDFs:** Per-store item-to-aisle mappings at `heb.com/static/pdfs/guide-{city}-{store-number}.pdf`
- **Pyxis:** Internal aisle navigation API used by personal shoppers

### HEB Store Brand Hierarchy

Useful for budget optimization when suggesting product alternatives:

| Brand | Positioning | Typical Savings vs National |
|-------|------------|---------------------------|
| Hill Country Fare | Value/budget | ~40% |
| H-E-B | National brand equivalent (NBE) | ~15-25% |
| H-E-B Organics | Organic NBE | Varies |
| H-E-B Select Ingredients | Premium clean-label | Comparable to premium national |
| Central Market | Specialty/gourmet | Premium pricing |
| Field & Future | Sustainability-focused | Varies |
| Mi Tienda | Hispanic specialty | Varies |
| H-E-B Meal Simple | Prepared meals | N/A |

---

## 6. Prior Art — Apps That Have Done This

### Jow (jow.com)

French meal planning app with **direct HEB integration**. Users select recipes, Jow maps ingredients to HEB products, populates the cart, supports curbside/delivery. Works via Instacart partnership. This is the closest existing analog to what we're building.

### Samsung Food / Whisk (whisk.com)

Makes recipes shoppable across 29 retailers. Maps ingredients to products, pushes to shopping carts. Includes browser extension for clipping recipes from any website.

### Kroger Developer API (developer.kroger.com)

The gold standard for what HEB *could* offer: official public API with product search, pricing, availability per store. Bearer token auth, free developer accounts. Mealime integrates with Kroger. HEB has no equivalent.

---

## 7. Product Search Use Case: Enriching a Grocery List

### The Flow

```
Generic ingredient from meal plan
    "crackers"
        |
        v
HEB product search (via SDK)
    search("crackers", { limit: 5 })
        |
        v
Ranked results with full product data
    1. H-E-B Select Ingredients Water Crackers - $3.29 (7 oz, $0.47/oz) - Aisle 5
    2. Ritz Original Crackers - $4.79 (13.7 oz, $0.35/oz) - Aisle 5
    3. Hill Country Fare Saltine Crackers - $1.89 (16 oz, $0.12/oz) - Aisle 5
    4. Triscuit Original Crackers - $4.49 (8.5 oz, $0.53/oz) - Aisle 5
    5. H-E-B Organics Whole Wheat Crackers - $3.99 (8 oz, $0.50/oz) - Aisle 5
        |
        v
Claude selects best match based on context
    - Recipe context (what pairs well?)
    - Budget preference (Hill Country Fare for savings)
    - Dietary needs (organic, gluten-free, etc.)
    - Family preferences (learned over time)
        |
        v
Enriched grocery list item
    "Hill Country Fare Saltine Crackers (16 oz) - $1.89 - Aisle 5"
```

### What This Enables

1. **Generic -> Specific:** "chicken thighs" becomes "H-E-B Natural Boneless Skinless Chicken Thighs (~$4.99/lb)"
2. **Budget optimization:** Claude can suggest Hill Country Fare alternatives and show the savings
3. **Aisle-sorted shopping list:** Group items by aisle for efficient in-store trips
4. **Sale awareness:** Cross-reference with weekly ad to flag deals ("Ritz crackers on sale this week: $3.49, normally $4.79")
5. **Availability verification:** Confirm items are in stock at your specific store before you go
6. **Nutrition-aware substitutions:** If a recipe calls for "butter", suggest specific options with nutrition info for dietary-conscious choices
7. **Quantity optimization:** "2 lbs ground beef" -> "H-E-B Ground Chuck 80/20 (2 lb package) - $9.98" instead of buying two 1 lb packages at higher unit price

### Supplementary Data Sources

| Source | What It Adds | HEB-Specific? |
|--------|-------------|---------------|
| **Instacart API** | Official product matching + checkout link | Yes (HEB is a partner) |
| **Spoonacular API** | Ingredient-to-product mapping with UPCs | No (national data) |
| **Open Food Facts** | 2.5M+ products, nutrition, ingredients by barcode | No (global, free) |
| **HEB Weekly Ad** (via SDK) | Current sale prices and promotions | Yes |
| **HEB Store Guide PDFs** | Complete aisle maps per store | Yes |

---

## 8. Recommended Architecture for Product Enrichment

### Option A: MCP Server Integration (Recommended for Our Stack)

Since our meal planner already uses Claude Agent SDK with custom MCP tools for DynamoDB, adding the HEB MCP server is architecturally consistent:

1. Run `heb-mcp` as an additional MCP server alongside our DynamoDB MCP server
2. Claude can call `heb_search_products` and `heb_get_product` during meal plan generation
3. Claude uses its judgment to match generic ingredients to specific HEB products
4. Results are stored in DynamoDB as part of the meal plan's grocery list

**Pros:** Fits our architecture perfectly. Claude handles the fuzzy matching logic. No custom product-matching code to maintain.

**Cons:** Requires maintaining an authenticated HEB session. Adds latency (each search is a network call). Fragile if HEB changes their API.

### Option B: Local Product Cache

1. Periodically scrape/search common grocery items via the SDK (e.g., nightly batch job)
2. Cache results in DynamoDB with TTL (prices change weekly)
3. Claude matches against the local cache first, falls back to live search for misses
4. Weekly ad data refreshed every Wednesday when new ads drop

**Pros:** Fast lookups. Resilient to HEB API downtime. Reduces API call volume.

**Cons:** Stale data between refreshes. Larger DynamoDB storage. Batch job maintenance.

### Option C: Graceful Degradation (Most Pragmatic)

1. **Primary:** Claude uses its built-in knowledge of HEB products and approximate prices
2. **Enhanced:** If HEB SDK is available and session is active, enrich with real-time data
3. **Fallback:** If HEB lookup fails, serve the Claude-generated estimates with a note ("prices approximate")

This means the app always works, and HEB data is a progressive enhancement rather than a dependency.
