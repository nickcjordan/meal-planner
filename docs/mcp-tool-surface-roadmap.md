# MCP Tool Surface Roadmap: Conversational Data Management

## Context

The meal planner currently has 7 MCP tools (5 read, 1 write, 1 display), leaving Claude unable to modify most data mid-conversation. The goal: any data element in the system should be modifiable conversationally, so the user never has to leave a planning session to fix something in the UI. The UI remains the primary interaction path (token-free), but Claude is the universal fallback.

**This is a design roadmap**, not an immediate implementation plan. Domains should be implemented incrementally as needed, prioritized by how often a user would hit a wall without them.

---

## Current State: 7 Tools, Mostly Read-Only

| Tool | Domain | R/W |
|---|---|---|
| `search_recipes` | Recipes | R |
| `get_recipe_details` | Recipes | R |
| `get_recent_meal_plans` | Sessions | R |
| `get_recipe_history` | Feedback | R |
| `get_pantry_items` | Pantry | R |
| `save_meal_plan` | Sessions | W |
| `present_meal_plan` | Sessions | Display |

**Gaps**: No write access to recipes, pantry, feedback, or shopping. No access at all to HEB data. Three entirely new data domains needed (staples, preferences, inventory).

---

## Target State: 36 Tools Across 9 Domains

### Domain 1: Recipes (existing DB, add write tools)

| Tool | R/W | Priority | Wraps |
|---|---|---|---|
| `search_recipes` | R | P0 | existing |
| `get_recipe_details` | R | P0 | existing |
| **`create_recipe`** | W | P1 | `createRecipe` in db |
| **`update_recipe`** | W | P1 | `updateRecipe` in db |
| **`delete_recipe`** | W | P2 | `deleteRecipe` in db |
| **`list_tags`** | R | P1 | `listTags` in db |
| **`import_recipe_from_url`** | W | P1 | import package pipeline |
| **`get_untried_recipes`** | R | P1 | new compound query |

Scenarios: "Add 'kid-friendly' tag to the burgers", "Import this recipe from seriouseats.com", "What recipes haven't we tried?"

### Domain 2: Sessions (existing DB, add read tools)

| Tool | R/W | Priority | Wraps |
|---|---|---|---|
| `get_recent_meal_plans` | R | P0 | existing |
| `save_meal_plan` | W | P0 | existing |
| `present_meal_plan` | Display | P0 | existing |
| **`get_session`** | R | P1 | `getSession`/`getSessionByWeek` in db |
| **`update_session_status`** | W | P2 | `updateSession` in db |

### Domain 3: Feedback (existing DB, add write tool)

| Tool | R/W | Priority | Wraps |
|---|---|---|---|
| `get_recipe_history` | R | P0 | existing |
| **`save_feedback`** | W | P0 | `saveFeedback` in db |
| **`get_session_feedback`** | R | P1 | `getFeedbackForSession` in db |

Scenario: "Mark the chicken tikka masala as made last night, it was great" -> `save_feedback(wasMade: true, rating: 5)`

### Domain 4: Pantry (existing DB, add write tools)

| Tool | R/W | Priority | Wraps |
|---|---|---|---|
| `get_pantry_items` | R | P0 | existing |
| **`add_pantry_item`** | W | P1 | `addPantryItem` in db |
| **`remove_pantry_item`** | W | P1 | `removePantryItem` in db |

Scenario: "Add cumin to our pantry staples", "We don't keep turmeric around anymore"

### Domain 5: Shopping Lists (existing DB, no current access)

| Tool | R/W | Priority | Wraps |
|---|---|---|---|
| **`get_shopping_list`** | R | P1 | `getShoppingList` in db |
| **`generate_shopping_list`** | W | P1 | extract from API route |
| **`add_shopping_list_item`** | W | P1 | read-modify-write |
| **`remove_shopping_list_item`** | W | P2 | read-modify-write |
| **`check_shopping_list_item`** | W | P2 | read-modify-write |

Scenario: "Add paper towels to the shopping list", "Remove cilantro, we already have some"

Note: `generate_shopping_list` requires extracting consolidation logic from `apps/web/src/app/api/sessions/[id]/shopping/route.ts` into a shared module.

### Domain 6: HEB Integration (existing, add read tools)

| Tool | R/W | Priority | Wraps |
|---|---|---|---|
| **`get_weekly_ad`** | R | P1 | `getWeeklyAd` in heb package |
| **`search_heb_products`** | R | P2 | `searchProducts` in heb package |

Scenario: Claude proactively checking sales to inform suggestions: "Chicken thighs are on sale this week"

### Domain 7: Grocery Staples (NEW data domain)

> **NOTE**: This domain may already be under implementation by another Claude instance. Before starting work here, check the current codebase for existing staple types, DB operations, or MCP tools. The design below should be reconciled with whatever already exists.

Recurring items bought on a schedule. Distinct from pantry items (always have, never on shopping list) and shopping items (one-time, session-specific).

**DynamoDB keys**: `PK: STAPLES#default`, `SK: ITEM#{name}`, `GSI1PK: STAPLES#FREQ#{frequency}`, `GSI1SK: ITEM#{name}`

**Type** (`packages/types/src/staple.ts`):
```typescript
type StapleFrequency = "weekly" | "biweekly" | "monthly";
interface GroceryStaple {
  name: string; category: string; frequency: StapleFrequency;
  brand?: string; notes?: string; lastAddedToList?: string;
  createdAt: string; updatedAt: string;
}
```

| Tool | R/W | Priority |
|---|---|---|
| **`get_grocery_staples`** | R | P0 |
| **`add_grocery_staple`** | W | P0 |
| **`update_grocery_staple`** | W | P1 |
| **`remove_grocery_staple`** | W | P1 |

Scenarios: "Add oat milk as a weekly staple", "Change Cherry Coke Zero to biweekly", "We stopped buying almond milk"

**If already implemented**: Just ensure the corresponding MCP tools exist and are registered in the agent. The MCP tool layer is what matters for conversational access -- the DB/type layer is a prerequisite.

### Domain 8: Family Preferences (NEW data domain)

Dietary restrictions, likes/dislikes, cuisine affinities, scheduling constraints, temporary diets. Long-lived settings that influence every planning session.

**DynamoDB keys**: `PK: PREFS#default`, `SK: {TYPE}#{key}`, `GSI1PK: PREFS#TYPE#{type}`, `GSI1SK: {key}`

Types: `restriction` (allergies), `dislike` (avoid), `like` (favor), `cuisine` (affinities), `schedule` (day constraints), `diet` (temporary programs)

**Type** (`packages/types/src/preference.ts`):
```typescript
type PreferenceType = "restriction" | "dislike" | "like" | "cuisine" | "schedule" | "diet";
interface FamilyPreference {
  type: PreferenceType; key: string; value: string;
  member?: string;  // family member if person-specific
  startDate?: string; endDate?: string;  // for time-bound (diets)
  createdAt: string; updatedAt: string;
}
```

| Tool | R/W | Priority |
|---|---|---|
| **`get_preferences`** | R | P0 |
| **`set_preference`** | W | P0 |
| **`remove_preference`** | W | P1 |

Scenarios:
- "My daughter is allergic to tree nuts" -> `set_preference(type: "restriction", key: "tree-nuts", member: "Emma")`
- "No complex meals on Tuesdays, soccer night" -> `set_preference(type: "schedule", key: "tuesday")`
- "We're doing Whole30 for January" -> `set_preference(type: "diet", key: "whole30", startDate/endDate)`

### Domain 9: Pantry Inventory (NEW data domain)

Current-state layer on top of pantry items. Pantry says "we always have salt." Inventory says "we're out of sugar this week."

**DynamoDB keys**: `PK: INVENTORY#default`, `SK: ITEM#{name}`, `GSI1PK: INVENTORY#STATUS#{status}`, `GSI1SK: ITEM#{name}`

**Type** (`packages/types/src/inventory.ts`):
```typescript
type InventoryStatus = "in-stock" | "low" | "out";
interface InventoryItem {
  name: string; status: InventoryStatus;
  quantity?: string; notes?: string; lastUpdated: string;
}
```

| Tool | R/W | Priority |
|---|---|---|
| **`get_inventory`** | R | P1 |
| **`set_inventory_status`** | W | P1 |
| **`clear_inventory_status`** | W | P2 |

Scenario: "We're out of sugar" -> `set_inventory_status(name: "sugar", status: "out")` + auto-add to shopping list

---

## Shopping List Integration Enhancement

`generate_shopping_list` should incorporate all sources:
1. Recipe ingredients (existing)
2. Extras ingredients (existing)
3. Filter pantry items (existing)
4. **Add weekly/biweekly/monthly staples that are due** (new)
5. **Add pantry items where inventory status is "out" or "low"** (new)

---

## Token Efficiency: Tool Loading Strategy

36 tool definitions at ~150 tokens each = ~5400 tokens. Recommendation:
- **Always load**: All P0 + P1 tools (30 tools, ~4500 tokens) -- this is reasonable
- **Lazy load**: P2 tools (6 tools) only when conversation context suggests need
- **Compact descriptions**: Keep each tool description under ~30 words

---

## Suggested Implementation Order

Prioritized by "where would you hit a wall first during a planning session":

### Increment 1: Feedback + Pantry Write Tools (highest friction today)
**Why first**: During planning, "we made that last night, it was a 5" and "add cumin to pantry" are the most common mid-session data changes with no current escape hatch.

- Add `save_feedback`, `get_session_feedback` tools
- Add `add_pantry_item`, `remove_pantry_item` tools
- Update system prompt for feedback recording guidance

**Files**: `packages/agent/src/tools.ts`, `packages/agent/src/prompt.ts`

### Increment 2: Family Preferences (NEW domain)
**Why next**: Preferences influence every single planning session. Without them, Claude has no persistent memory of "daughter is allergic to tree nuts" or "no complex meals on Tuesdays."

- Create types: `packages/types/src/preference.ts`
- Create DB: `packages/db/src/preferences.ts`
- Add `get_preferences`, `set_preference`, `remove_preference` tools
- Update system prompt to call `get_preferences` at session start
- Add API routes for settings page

**New files**: type + db + API route. **Modify**: dynamo.ts, types index, db index, tools.ts, prompt.ts

### Increment 3: Recipe Write Tools
**Why next**: "Import this recipe", "update the tags on that recipe" are common enough, and the DB operations already exist -- just need MCP wrappers.

- Add `create_recipe`, `update_recipe`, `delete_recipe`, `list_tags`, `import_recipe_from_url`, `get_untried_recipes` tools

**Files**: `packages/agent/src/tools.ts`

### Increment 4: Shopping List Access
**Why next**: "What's on the shopping list?", "Add paper towels" are natural mid-session requests. Requires extracting shared consolidation logic.

- Extract `consolidateIngredients` from API route into shared module
- Add `get_shopping_list`, `generate_shopping_list`, `add_shopping_list_item` tools
- (P2) Add `remove_shopping_list_item`, `check_shopping_list_item`

**Files**: new shared module, `packages/agent/src/tools.ts`, API route refactor

### Increment 5: Grocery Staples (NEW domain -- may already be in progress)
**Prerequisite**: Check what the other Claude instance has built. May only need MCP tool wrappers on top of existing DB/type work.

- Reconcile with existing implementation
- Add `get_grocery_staples`, `add_grocery_staple`, `update_grocery_staple`, `remove_grocery_staple` tools
- Integrate staples into `generate_shopping_list`

### Increment 6: Pantry Inventory (NEW domain)
**Why later**: The "out of sugar" scenario is real but less frequent than preferences or feedback. Can be approximated by `add_shopping_list_item` in the meantime.

- Create types: `packages/types/src/inventory.ts`
- Create DB: `packages/db/src/inventory.ts`
- Add `get_inventory`, `set_inventory_status`, `clear_inventory_status` tools
- Integrate inventory into `generate_shopping_list` (don't filter out pantry items that are "out")

### Increment 7: HEB + Session Tools (polish)
- Add `get_weekly_ad`, `search_heb_products` tools
- Add `get_session`, `update_session_status` tools
- These are useful but not blocking any core workflow

---

## Verification

After each phase:
1. `npm run check` passes (build + typecheck + lint + test)
2. Start dev server, open planning chat, verify new tools appear in Claude's responses
3. Test conversational scenarios:
   - "Add oat milk as a weekly staple" -> verify DynamoDB write
   - "We're out of sugar" -> verify inventory status saved
   - "My daughter is allergic to tree nuts" -> verify preference saved
   - "Mark tikka masala as made, it was a 5" -> verify feedback saved
   - "What's on our shopping list?" -> verify list returned
4. Verify existing planning flow still works (no regressions in `present_meal_plan`)
