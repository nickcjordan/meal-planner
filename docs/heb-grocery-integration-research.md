# HEB Grocery Integration Research

> Research conducted 2026-04-10. Findings may become outdated as APIs and services evolve.

## Goal

Explore options for programmatically connecting a meal planner to HEB for grocery shopping — ideally populating an HEB cart, or at minimum getting a grocery list onto a shared family device.

---

## 1. HEB Official API

**Status: Does not exist.**

HEB has no public API, developer portal, or partner program. Internally they use:

- A **GraphQL API** powering heb.com and the My H-E-B mobile app
- An **ArcGIS portal** (`arcportal.heb.com`) for store mapping
- A **supplier portal** (`supplier.heb.com`) for B2B/EDI integration
- An internal API called **Pyxis** for store aisle navigation

None of these are accessible to third-party developers. No known URL schemes for deep linking into the HEB app (e.g., no `heb://add-to-cart` or `heb.com/cart/add?item=xxx`).

---

## 2. Unofficial / Community HEB Integrations

Several community projects have reverse-engineered HEB's internal APIs:

### heb-sdk-unofficial (TypeScript, npm)

- **Repo:** https://github.com/ihildy/heb-sdk-unofficial
- Most comprehensive option. Monorepo with packages for SDK core, auth (PKCE/OAuth), an MCP server, and a cookie-bridge browser extension.
- **Capabilities:** Product search, cart management, order history, shopping lists, store lookup, curbside/delivery slots, weekly ads.
- **Auth:** Captures authenticated cookies from a browser extension and proxies them through the SDK.
- **License:** MIT

### texas-grocery-mcp (Python)

- **Repo:** https://github.com/mgwalkerjr95/texas-grocery-mcp
- MCP server for Claude AI — HEB product search, cart management, coupon clipping, store selection.
- Uses Playwright for session refresh (sessions expire ~every 11 minutes due to bot detection).
- Has human-in-the-loop confirmation for cart modifications.

### HEBMCP

- **Repo:** https://github.com/gigq/HEBMCP
- Another HEB MCP server for searching items and adding to cart.

### heb-grocery-agent (Chrome Extension)

- **Repo:** https://github.com/michellemayes/heb-grocery-agent
- Parses a pasted grocery list and automates searching/adding items to cart on heb.com.
- Supports AI-powered list cleanup via Groq, OpenAI, or Anthropic.

### heb-automation (Python/Selenium)

- **Repo:** https://github.com/ayushdeshmukh/heb-automation
- Browser automation for searching, shopping, and ordering.

### heb-to-go (Go)

- **Package:** https://pkg.go.dev/github.com/billcobbler/heb-to-go/pkg/heb-api/v1
- Older package with store locator and timeslot endpoints.

### strands-agent-shopper

- **Repo:** https://github.com/cornflowerblu/strands-agent-shopper
- AI shopping agent using Strands SDK with a hybrid approach: GraphQL API for product discovery with HTML parsing fallback.
- Extracts product names, descriptions, SKUs, pricing, brand info, inventory, and availability.

### Key Caveats

- All unofficial tools require authenticated sessions.
- HEB's bot detection (Imperva/Incapsula) includes CAPTCHAs, IP blocking, and session expiration.
- Persisted query hashes are hard-coded — HEB app updates can break all queries instantly.
- These are fragile — any HEB frontend change can break them.
- Not suitable as a sole dependency for a production feature. Best used as a progressive enhancement.

> **Deep dive:** See [heb-sdk-technical-deep-dive.md](heb-sdk-technical-deep-dive.md) for authentication details, API surface, code examples, and product enrichment architecture.

---

## 3. Instacart Developer Platform (Most Promising Official Path)

HEB partners with Instacart for delivery in Austin, Houston, and other Texas markets.

**Instacart launched a public Developer Platform API in March 2024.**

- **Docs:** https://docs.instacart.com/developer_platform_api/
- **Portal:** https://www.instacart.com/company/business/developers
- **Key endpoint:** `POST https://connect.instacart.com/idp/v1/products/products_link`

### How It Works

1. Send a list of product names (and optionally UPCs or product IDs) to the API
2. Get back a shareable Instacart link
3. User clicks the link, selects HEB as their store, and items land in their Instacart cart
4. User checks out for delivery or pickup

### Recipe Endpoint (Better for Meal Planners)

Instacart also has `POST /idp/v1/products/recipe` — accepts a recipe with `LineItem` objects:
- Ingredient name (required)
- Optional measurements, brand preferences, health filters
- Optional UPCs for exact matching
- Health filters: `ORGANIC`, `GLUTEN_FREE`, `FAT_FREE`, `VEGAN`, `KOSHER`, `SUGAR_FREE`, `LOW_FAT`

Returns a hosted recipe page URL where users see matched products and can add to cart. Store selector shows retailers carrying at least 40% of ingredients.

**Best practice:** Pass generic product names without weight/quantity/brand for broadest matching.

### Limitations

- Cannot force HEB as the retailer — Instacart selects a default based on user location and preferences.
- Can append a `retailer_key` to the generated link (obtainable via `get_nearby_retailers` API) to nudge toward HEB.
- Requires an API key from Instacart's developer portal.

### Prior Art

- **Jow** (jow.com) — French meal planning app with direct HEB integration via Instacart. Maps ingredients to HEB products, populates cart, supports curbside/delivery. Closest existing analog to what we're building.
- **Samsung Food / Whisk** (whisk.com) — Makes recipes shoppable across 29 retailers.

---

## 4. Apple Ecosystem Integration

### Apple Notes

- **Very limited automation.** No public API.
- Only programmable via AppleScript (macOS only) or Shortcuts actions (Create Note, Append to Note, Find Notes).
- Apple has been asked for a Notes API on their developer forums — response is "file an enhancement request."
- **Not recommended** as a grocery list integration target.

### Apple Reminders (Better Option)

- **EventKit Framework** (native iOS/macOS API) supports creating reminders programmatically, assigning them to specific lists, and working with shared iCloud lists.
- iOS has a built-in **Groceries list type** that auto-categorizes items into sections (Produce, Dairy, Meat, etc.).
- **Apple Shortcuts** has an "Add New Reminder" action that can target a specific list.
- **URL scheme:** `shortcuts://run-shortcut?name=[name]&input=[input]&text=[text]` can trigger a Shortcut from a URL.

### Integration Path (Web App -> Reminders)

1. Web app generates the grocery list
2. User creates a custom Apple Shortcut ("Add Groceries") that accepts text input and adds items to a shared Reminders grocery list
3. Web app presents a link: `shortcuts://run-shortcut?name=Add%20Groceries&input=text&text=milk,eggs,bread`
4. User taps it on their iPhone, items appear in the shared list

### Limitation

EventKit is a native-only API (Swift/Objective-C). No way to push from a web server directly — requires user to tap a link on their iOS device.

---

## 5. Third-Party Grocery List Apps with APIs

| App | API Type | Family Sharing | Highlights |
|-----|----------|---------------|------------|
| **Todoist** | Official REST API | Yes (shared projects) | Best documented, free tier, JS/Python SDKs. `POST https://api.todoist.com/rest/v2/tasks` |
| **OurGroceries** | Unofficial Python lib (stable) | Yes | Purpose-built for grocery lists, Home Assistant integration, real-time sync |
| **AnyList** | Unofficial Node.js wrapper | Yes | Recipe + meal planning features, AES-256 encrypted credentials |
| **Bring!** | Home Assistant integration | Yes | Popular in Europe, good categorization |

### Todoist

- **Docs:** https://developer.todoist.com/rest/v2/
- Create a "Grocery List" project, share it with family
- Add items via `POST /rest/v2/tasks` with `project_id`
- Well-maintained, unlikely to break

### OurGroceries

- **PyPI:** https://pypi.org/project/ourgroceries/
- Unofficial but stable async Python library
- `add_item_to_list(list_id, value, category, auto_category)`
- Home Assistant integration proves API stability

### AnyList

- **Repo:** https://github.com/codetheweb/anylist
- Unofficial Node.js wrapper (reverse-engineered)
- Has recipe + meal planning features built into the app itself

---

## 6. Other Approaches

### Web Share API

- `navigator.share({ title: 'Grocery List', text: 'milk\neggs\nbread' })` opens the native share sheet.
- User can send to Reminders, Notes, Messages, or any installed app.
- Zero integration work, works on any iOS/Android device.

### Share-a-Cart

- https://share-a-cart.com/supported/heb
- Browser extension that supports HEB — can share/import cart contents between users.
- Not programmable, but confirms HEB's cart structure can be manipulated via browser automation.

### Mealie (Self-Hosted)

- **Docs:** https://docs.mealie.io/
- Self-hosted recipe manager and meal planner with a REST API.
- Has shopping lists organized by supermarket sections.
- Could serve as an alternative backend, but duplicates what we're building.

---

## 7. Recommended Integration Strategy

### Tier 1 — MVP (Immediate)

Generate a structured grocery list in the app. Offer:
- "Copy to clipboard" button
- Web Share API button (opens native share sheet — user sends to Reminders, Notes, Messages, etc.)

### Tier 2 — API-Driven List Sync

Integrate with **Todoist** or **OurGroceries** via their APIs. The meal planner pushes the grocery list directly to a shared family list that syncs in real-time across devices.

### Tier 3 — Shop at HEB Button

Add an **Instacart "Shop at HEB" button** that generates an Instacart link pre-populated with the grocery list. One tap takes the user to Instacart with items ready for their HEB cart.

### Tier 4 — Experimental (Fragile)

The `heb-sdk-unofficial` MCP server could let Claude directly manage an HEB cart during the meal planning conversation. Technically impressive but brittle and high-maintenance.
