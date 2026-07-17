# Planning Index Optimization

Redesign of the recipe selection phase to eliminate full table scans and reduce token cost as the recipe database grows.

## Problem Statement

The current planning flow has three scaling issues:

1. **`listRecipes()` does a full DynamoDB Scan** — reads every item in the table, filters client-side for `entityType = RECIPE`. Cost grows linearly with recipe count.
2. **All recipe summaries are sent to Claude** — at 200 recipes this is ~25K tokens; at 500 it's 60K+. Claude then does deterministic filtering (recency, restrictions) that code could do in microseconds.
3. **`get_recipe_details` is called per-recipe** — 7+ sequential model round-trips just to get ingredient data for overlap analysis.

## Current Flow (Steps 1-3 of Planning)

```
search_recipes (full scan, all recipes)
  → Claude thinks (mentally filters recency, restrictions, selects ~7)
    → get_recipe_details × 7 (full recipe including steps/notes/equipment)
      → Claude thinks (overlap analysis, adaptations, assembly)
        → present_meal_plan
```

**Total model turns for selection:** 3-4 (search → think → details → think → present)
**DynamoDB cost:** 1 full Scan + 7 GetItems
**Token cost:** ~25K+ input (all summaries) + ~7K (full details) + reasoning

### What Claude does that code could do faster
- Exclude recipes cooked in last 2-3 weeks (set membership check)
- Exclude recipes with restricted ingredients (but currently can only check names/tags, not actual ingredients — summaries don't include them)
- Filter by rating

### What Claude does that only Claude should do
- Variety judgment (cuisine rotation, protein balance across the week)
- Day placement (busy weeknight → staple, weekend → involved)
- Ingredient overlap creativity (noticing shared produce, batch-prep opportunities)
- Adaptation decisions (per-meal swap/skip based on leniency rules)
- Side pairing, reasoning, shopping strategy

## Proposed Design

### Component 1: Planning Index

A pre-computed, compact index stored as a single DynamoDB item. Updated on recipe CRUD and feedback saves.

**Key:** `PK: SYSTEM#PLANNING_INDEX, SK: SYSTEM#PLANNING_INDEX`

**Schema per recipe entry (~250 bytes):**
```ts
interface PlanningIndexEntry {
  id: string;
  name: string;
  complexity: "staple" | "standard" | "involved";
  tags: string[];
  primaryProtein: string;      // derived: "chicken" | "beef" | "pork" | "salmon" | "shrimp" | "tofu" | "none"
  cuisineType: string;         // derived from tags: "italian" | "mexican" | "asian" | "american" | etc.
  ingredientNames: string[];   // flat list of ingredient names (no quantities)
  totalTime: number;           // prepTime + cookTime
  servings: number;
  avgRating: number | null;    // computed from HISTORY records
  lastCookedAt: string | null; // most recent HISTORY record timestamp
  timesCookedLast8Weeks: number;
}
```

**Size budget:** 500 recipes × 250 bytes = 125KB. DynamoDB item limit is 400KB. Supports ~1,500 recipes before needing to shard — well beyond a family recipe library.

**Maintained by:** Helper function called inside `createRecipe`, `updateRecipe`, `deleteRecipe`, and `saveFeedback`. Adds ~50ms to write operations (one GetItem + one PutItem). Writes are rare (few times per week); reads happen every planning session.

### Component 2: New fields on Recipe

Add two derived fields, computed on create/update:

- **`primaryProtein`** — derived from ingredient names. Logic: scan ingredient names for known protein keywords (chicken, beef, pork, salmon, shrimp, tofu, turkey, lamb, etc.). Pick the most prominent.
- **`cuisineType`** — derived from tags. Most recipes already have cuisine tags (italian, mexican, asian, etc.). Fall back to "american" if untagged.

Backfill existing recipes with a one-time migration script.

### Component 3: `get_planning_candidates` tool

Replaces `search_recipes` + N× `get_recipe_details` with a single tool call.

**Input parameters (Claude provides from context already gathered in the parallel batch):**
```ts
{
  recentRecipeIds: string[];       // IDs used in last 3 weeks (from get_recent_meal_plans)
  restrictedIngredients: string[]; // hard restrictions (from get_preferences)
  dislikedIngredients: string[];   // soft avoidances (from get_preferences)
  likedIngredients: string[];      // boost signals (from get_preferences)
  preferredCuisines: string[];     // high-affinity cuisines (from get_preferences)
  scheduleConstraints: { day: string; maxComplexity: string }[];  // e.g. "tuesday: staple only"
  familySize: number;              // active member count (from get_family_members)
}
```

**Server-side logic:**
```
1. Read PLANNING_INDEX (single GetItem, ~5ms)

2. EXCLUDE:
   - id ∈ recentRecipeIds
   - ingredientNames ∩ restrictedIngredients ≠ ∅  (fuzzy match with aliases)
   - timesCookedLast8Weeks ≥ 3

3. SCORE remaining:
   - +2 for each liked ingredient present
   - +1 for preferred cuisine match
   - +1 for avgRating ≥ 4
   - -1 for each disliked ingredient
   - +0.5 for servings within ±1 of familySize

4. SELECT top candidates per complexity bucket:
   - Top 6 staple (sorted by score, randomized within ties)
   - Top 8 standard
   - Top 5 involved
   = ~19 candidates

5. BatchGetItem for the 19 IDs (single batch call, ~20ms)

6. RETURN with only planning-relevant fields:
   - id, name, description, complexity, tags, primaryProtein, cuisineType
   - totalTime, servings, score, avgRating, lastCookedAt
   - ingredientSections (full — needed for overlap + adaptations)
   - NO steps, NO equipment, NO notes, NO storage, NO nutritionalInfo
```

**Output to Claude:** ~19 scored candidates with full ingredient data. ~4K-6K tokens regardless of total recipe count.

### Component 4: Prompt update

Replace "How to Plan" steps 2-3:
```
2. Call get_planning_candidates — pass the recent recipe IDs, restrictions, likes,
   preferred cuisines, schedule constraints, and family size from step 1. This returns
   a pre-scored shortlist with ingredient details already included.
3. Pick 7 meals from the candidates. Ingredients are already provided — use them for
   overlap analysis and adaptation decisions without additional tool calls.
```

## Comparison

| Metric | Before | After |
|--------|--------|-------|
| DynamoDB reads per plan | Full Scan + 7 GetItems | 1 GetItem + 1 BatchGet (19 items) |
| DynamoDB cost scaling | O(n) with recipe count | O(1) |
| Tokens to Claude (recipes) | ~25K-60K+ (all summaries) | ~5K (19 candidates with ingredients) |
| Model turns for selection | 3-4 | 1 (candidates → present_meal_plan) |
| Restriction accuracy | Name/tag only (no ingredients in summary) | Ingredient-level matching |
| Grows with recipe count | Yes (all dimensions) | No (fixed candidate count) |

## What stays the same

- `search_recipes` and `get_recipe_details` remain available for non-planning uses (user browsing, "show me the pad thai recipe", mid-chat queries)
- All creative/judgment work stays with Claude (variety, day placement, overlap analysis, adaptations, reasoning)
- present_meal_plan schema unchanged
- All analysis fields still generated by Claude

## Implementation Order

1. Add `primaryProtein` and `cuisineType` to Recipe type + derive on save
2. Write backfill script for existing recipes
3. Build planning index: read/write helpers + hook into recipe CRUD + feedback saves
4. Build `get_planning_candidates` tool with scoring logic
5. Update prompt (steps 2-3 of "How to Plan")
6. Test with current recipe set to validate quality parity

## Scoring tuning

The scoring weights (+2 liked, +1 cuisine, etc.) are initial guesses. After running a few plans with the new system, compare the candidates surfaced vs. what Claude actually picks. If Claude consistently ignores high-scored candidates or picks low-scored ones, adjust weights or add new signals.

## Randomization / staleness prevention

To prevent the same "top 6 staple" recipes from appearing every week:
- Add a small random jitter to scores (±0.5)
- Or rotate: exclude the top-1 pick from last week's plan even if it's outside the 3-week recency window
- The `timesCookedLast8Weeks` penalty already helps here, but jitter ensures variety when many recipes have similar scores

## Future extensions

- **Seasonal weighting:** Boost recipes tagged with current season
- **Weekly ad cross-reference:** Boost recipes whose ingredients are on sale (data from `get_weekly_ad`)
- **Collaborative filtering:** If recipe A and B are frequently planned together, and A is selected, boost B
- **Complexity budget per schedule:** If Tuesday is "soccer night" (schedule constraint), pre-filter to only staple candidates for that slot
