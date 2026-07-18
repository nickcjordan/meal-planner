import { describe, it, expect } from "vitest";
import type { PlanDraftPayload, WeekRoundoutPayload } from "@meal-planner/agent";
import {
  autoPick,
  toPreviewRequest,
  stableInputKey,
  draftInputKey,
  computeMeters,
  mapPlanDraft,
  mapWeekRoundout,
  applyMealOptionsPayload,
  parseWizardState,
  createInitialWizardState,
  buildDraftMessage,
  buildOptionsRefineMessage,
  computeReviewAnalytics,
  WIZARD_VERSION,
  type MealOptionCard,
  type WizardState,
  type DraftMealUI,
} from "../wizard";

// ─── Factories ───────────────────────────────────────────────────────────────

function card(id: string, opts: Partial<MealOptionCard> = {}): MealOptionCard {
  return {
    id,
    name: opts.name ?? id,
    description: "",
    complexity: opts.complexity ?? "standard",
    tags: [],
    primaryProtein: opts.primaryProtein,
    cuisineType: opts.cuisineType,
    totalTime: opts.totalTime ?? 30,
    servings: 4,
    avgRating: null,
    lastCookedAt: null,
    recentlyMade: opts.recentlyMade ?? false,
    timesCooked8Weeks: 0,
    score: opts.score ?? 1,
    rank: opts.rank ?? 1,
    adaptationHints: [],
    swapHints: [],
    aiSuggested: opts.aiSuggested,
  };
}

function stateAt(step: 1 | 2 | 3 | 4, patch: Partial<WizardState> = {}): WizardState {
  return { ...createInitialWizardState("2026-07-20"), step, ...patch };
}

// ─── autoPick ────────────────────────────────────────────────────────────────

describe("autoPick", () => {
  const variedGrid: MealOptionCard[] = [
    card("c1", { complexity: "staple", primaryProtein: "chicken" }),
    card("c2", { complexity: "staple", primaryProtein: "chicken" }),
    card("c3", { complexity: "standard", primaryProtein: "chicken" }),
    card("c4", { complexity: "standard", primaryProtein: "chicken" }),
    card("c5", { complexity: "involved", primaryProtein: "beef" }),
    card("c6", { complexity: "standard", primaryProtein: "beef" }),
    card("c7", { complexity: "standard", primaryProtein: "salmon" }),
  ];

  it("is deterministic for a stable input order", () => {
    const a = autoPick(variedGrid, 5);
    const b = autoPick(variedGrid, 5);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
  });

  it("never picks a 3rd meal of the same protein when avoidable", () => {
    const picked = autoPick(variedGrid, 5);
    const proteinCounts = new Map<string, number>();
    for (const id of picked) {
      const c = variedGrid.find((o) => o.id === id)!;
      const p = c.primaryProtein!;
      proteinCounts.set(p, (proteinCounts.get(p) ?? 0) + 1);
    }
    for (const count of proteinCounts.values()) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("skips recentlyMade until fresh options are exhausted (fallback)", () => {
    const grid: MealOptionCard[] = [
      card("f1", { complexity: "standard", primaryProtein: "chicken" }),
      card("f2", { complexity: "staple", primaryProtein: "beef" }),
      card("r1", { recentlyMade: true, primaryProtein: "pork" }),
      card("r2", { recentlyMade: true, primaryProtein: "tofu" }),
      card("r3", { recentlyMade: true, primaryProtein: "shrimp" }),
    ];
    const picked = autoPick(grid, 5);
    expect(picked).toHaveLength(5);
    // Fresh first, then recentlyMade fills the rest.
    expect(picked.slice(0, 2).sort()).toEqual(["f1", "f2"]);
    expect(picked).toContain("r1");
  });

  it("fills from the top when complexity targets are unreachable", () => {
    // All involved: only 1 involved target, so passes 2+ must fill the rest.
    const grid: MealOptionCard[] = [
      card("i1", { complexity: "involved", primaryProtein: "beef" }),
      card("i2", { complexity: "involved", primaryProtein: "chicken" }),
      card("i3", { complexity: "involved", primaryProtein: "salmon" }),
      card("i4", { complexity: "involved", primaryProtein: "pork" }),
      card("i5", { complexity: "involved", primaryProtein: "tofu" }),
    ];
    const picked = autoPick(grid, 5);
    expect(picked).toEqual(["i1", "i2", "i3", "i4", "i5"]);
  });

  it("returns min(n, available) and no duplicates", () => {
    const grid = [card("a"), card("b")];
    const picked = autoPick(grid, 5);
    expect(picked).toEqual(["a", "b"]);
    expect(new Set(picked).size).toBe(picked.length);
  });
});

// ─── toPreviewRequest ────────────────────────────────────────────────────────

describe("toPreviewRequest", () => {
  it("Step 1: day-less meals from selectedRecipeIds, exclusions forwarded", () => {
    const state = stateAt(1, {
      selectedRecipeIds: ["r1", "r2"],
      excludedIngredients: ["recipe:r1:salt"],
    });
    const req = toPreviewRequest(state);
    expect(req.meals).toEqual([{ recipeId: "r1" }, { recipeId: "r2" }]);
    expect(req.meals.every((m) => m.day === undefined)).toBe(true);
    expect(req.groceryStaples).toBeUndefined();
    expect(req.excludedIngredients).toEqual(["recipe:r1:salt"]);
  });

  const draft: DraftMealUI[] = [
    {
      day: "monday",
      mealType: "dinner",
      recipeId: "r1",
      recipeName: "Tacos",
      complexity: "standard",
      dayReasoning: "easy weeknight",
      sides: [
        {
          sideId: "s-rice",
          sideName: "Rice",
          sideCategory: "grain",
          complexity: "simple",
          preAccepted: true,
          accepted: true,
        },
        {
          sideName: "Salad",
          sideCategory: "salad",
          complexity: "effortless",
          ingredients: [{ name: "lettuce", quantity: 1, unit: "head" }],
          preAccepted: false,
          accepted: false,
        },
      ],
      adaptationDecisions: [
        { adaptationName: "Lactose Intolerance", memberName: "Nick", applied: true },
      ],
    },
  ];

  it("Step 2: scheduled meals, only accepted sides, mapped adaptations", () => {
    const state = stateAt(2, { draft, selectedRecipeIds: ["r1"] });
    const req = toPreviewRequest(state);
    expect(req.meals).toHaveLength(1);
    const m = req.meals[0];
    expect(m.day).toBe("monday");
    expect(m.mealType).toBe("dinner");
    expect(m.sides).toEqual([{ kind: "ref", sideId: "s-rice" }]);
    expect(m.adaptations).toEqual([{ adaptationName: "Lactose Intolerance", applied: true }]);
    expect(req.groceryStaples).toBeUndefined();
  });

  it("Step 3: adds accepted staples, need-carryovers, accepted item suggestions, extras", () => {
    const roundout: WizardState["roundout"] = {
      inputKey: "k",
      staples: [
        { name: "Milk", style: "specific", category: "dairy", frequency: "weekly", accepted: true },
        { name: "Bananas", style: "flexible", category: "produce", frequency: "weekly", accepted: false },
        // The engine pushes an accepted item-suggestion's item into staples at
        // accept time (visible/toggleable in Recurring) — mirrored here.
        { name: "Tortillas", style: "specific", category: "bread", frequency: "weekly", accepted: true },
      ],
      carryovers: [
        {
          name: "Cilantro",
          estimatedQuantity: 1,
          unit: "bunch",
          source: { weekOf: "2026-07-13", recipeName: "Salsa", purchasedQuantity: 1, usedQuantity: 0.5 },
          neededFor: { day: "monday", recipeName: "Tacos", requiredQuantity: 0.5 },
          status: "need",
        },
        {
          name: "Lime",
          estimatedQuantity: 2,
          unit: "each",
          source: { weekOf: "2026-07-13", recipeName: "Salsa", purchasedQuantity: 4, usedQuantity: 2 },
          neededFor: { day: "monday", recipeName: "Tacos", requiredQuantity: 2 },
          status: "confirmed",
        },
      ],
      suggestions: [
        {
          id: "sug1",
          type: "smart-promotion",
          title: "Add tortillas",
          description: "",
          rationale: "",
          item: { name: "Tortillas", style: "specific", category: "bread", frequency: "weekly" },
          state: "accepted",
        },
        {
          id: "sug2",
          type: "pantry-promotion",
          title: "Always have olive oil",
          description: "",
          rationale: "",
          item: { name: "Olive Oil", style: "specific", category: "pantry", frequency: "monthly" },
          state: "accepted",
        },
        {
          id: "sug3",
          type: "recurring-item",
          title: "Coffee",
          description: "",
          rationale: "",
          item: { name: "Coffee", style: "specific", category: "beverages", frequency: "weekly" },
          state: "open",
        },
      ],
      extras: [{ name: "Cake", ingredients: [{ name: "flour", quantity: 2, unit: "cup" }] }],
    };
    const state = stateAt(3, { draft, roundout });
    const req = toPreviewRequest(state);
    const stapleNames = (req.groceryStaples ?? []).map((s) => s.name);
    expect(stapleNames).toContain("Milk"); // accepted staple
    expect(stapleNames).not.toContain("Bananas"); // declined staple
    expect(stapleNames).toContain("Tortillas"); // accepted item suggestion (pushed into staples by the engine)
    expect(stapleNames).not.toContain("Olive Oil"); // pantry-promotion is chat-only, never pushed
    expect(stapleNames).not.toContain("Coffee"); // open, not accepted
    expect((req.carryoverItems ?? []).map((c) => c.name)).toEqual(["Cilantro"]); // only need
    expect(req.extras).toHaveLength(1);
  });
});

// ─── stableInputKey ──────────────────────────────────────────────────────────

describe("stableInputKey", () => {
  it("is order-insensitive over ids and side names", () => {
    const a = stableInputKey(["r1", "r2", "r3"], ["Rice", "Salad"]);
    const b = stableInputKey(["r3", "r1", "r2"], ["Salad", "Rice"]);
    expect(a).toBe(b);
  });

  it("changes when a selection changes", () => {
    const a = stableInputKey(["r1", "r2"], []);
    const b = stableInputKey(["r1", "r2", "r3"], []);
    expect(a).not.toBe(b);
  });

  it("draftInputKey uses only accepted sides", () => {
    const draft: DraftMealUI[] = [
      {
        day: "monday",
        mealType: "dinner",
        recipeId: "r1",
        recipeName: "Tacos",
        complexity: "standard",
        dayReasoning: "",
        sides: [
          { sideName: "Rice", sideCategory: "grain", complexity: "simple", preAccepted: true, accepted: true },
          { sideName: "Beans", sideCategory: "legume", complexity: "simple", preAccepted: false, accepted: false },
        ],
        adaptationDecisions: [],
      },
    ];
    // Key includes the assigned day (day changes invalidate the roundout
    // prefetch) and a trailing staples fingerprint (empty here).
    expect(draftInputKey(draft)).toBe(`${stableInputKey(["r1@monday"], ["Rice"])}|`);
  });

  it("draftInputKey changes with day moves and staples arrival", () => {
    const meal: DraftMealUI = {
      day: "monday",
      mealType: "dinner",
      recipeId: "r1",
      recipeName: "Tacos",
      complexity: "standard",
      dayReasoning: "",
      sides: [],
      adaptationDecisions: [],
    };
    const base = draftInputKey([meal]);
    expect(draftInputKey([{ ...meal, day: "friday" }])).not.toBe(base);
    expect(
      draftInputKey(
        [meal],
        [{ name: "Milk", style: "specific", category: "dairy", frequency: "weekly" }],
      ),
    ).not.toBe(base);
  });
});

// ─── mappers ─────────────────────────────────────────────────────────────────

describe("mapPlanDraft", () => {
  it("seeds accepted from preAccepted and adaptation decisions from applied", () => {
    const payload: PlanDraftPayload = {
      meals: [
        {
          day: "saturday",
          mealType: "dinner",
          recipeId: "r9",
          recipeName: "Roast",
          complexity: "involved",
          dayReasoning: "Involved recipe → Saturday",
          suggestedSides: [
            { sideName: "Potatoes", sideCategory: "starch", complexity: "simple", preAccepted: true },
            { sideName: "Gravy", sideCategory: "other", complexity: "prepared", preAccepted: false },
          ],
          adaptations: [
            {
              adaptationName: "Lactose Intolerance",
              memberName: "Nick",
              applied: false,
              skipReason: "hard to swap",
              skipNote: "Take Lactaid",
            },
          ],
        },
      ],
    };
    const [meal] = mapPlanDraft(payload);
    expect(meal.mealType).toBe("dinner");
    expect(meal.sides.map((s) => s.accepted)).toEqual([true, false]);
    expect(meal.adaptationDecisions[0]).toMatchObject({
      adaptationName: "Lactose Intolerance",
      applied: false,
      skipNote: "Take Lactaid",
    });
  });

  it("defaults mealType to dinner and tolerates missing sides/adaptations", () => {
    const payload = {
      meals: [
        {
          day: "monday",
          mealType: "",
          recipeId: "r1",
          recipeName: "Soup",
          complexity: "staple",
          dayReasoning: "",
          suggestedSides: [],
        },
      ],
    } as unknown as PlanDraftPayload;
    const [meal] = mapPlanDraft(payload);
    expect(meal.mealType).toBe("dinner");
    expect(meal.sides).toEqual([]);
    expect(meal.adaptationDecisions).toEqual([]);
  });
});

describe("mapWeekRoundout", () => {
  it("defaults staples accepted, suggestions open, and captures the inputKey", () => {
    const payload: WeekRoundoutPayload = {
      groceryStaples: [{ name: "Milk", style: "specific", category: "dairy", frequency: "weekly" }],
      carryoverItems: [],
      suggestions: [{ id: "s1", type: "deal-meal", title: "Deal", description: "", rationale: "" }],
      extras: [],
    };
    const ui = mapWeekRoundout(payload, "key-123");
    expect(ui.inputKey).toBe("key-123");
    expect(ui.staples[0].accepted).toBe(true);
    expect(ui.suggestions[0].state).toBe("open");
  });
});

describe("applyMealOptionsPayload", () => {
  const grid = [card("a"), card("b"), card("c")];

  it("reorders by reorderedRecipeIds and keeps the remainder", () => {
    const next = applyMealOptionsPayload(grid, { reorderedRecipeIds: ["c", "a"] });
    expect(next.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("appends addOptions as synthetic aiSuggested cards, skipping duplicates", () => {
    const next = applyMealOptionsPayload(grid, {
      addOptions: [
        { recipeId: "z", recipeName: "Ziti", complexity: "standard", reasoning: "pasta night" },
        { recipeId: "a", recipeName: "dup", complexity: "staple", reasoning: "already present" },
      ],
    });
    expect(next.map((c) => c.id)).toEqual(["a", "b", "c", "z"]);
    expect(next.find((c) => c.id === "z")?.aiSuggested).toBe(true);
  });
});

// ─── computeMeters ───────────────────────────────────────────────────────────

describe("computeMeters", () => {
  it("counts effort buckets and distinct proteins", () => {
    const meters = computeMeters({
      r1: { name: "A", complexity: "staple", protein: "chicken", totalTime: 20 },
      r2: { name: "B", complexity: "involved", protein: "Chicken", totalTime: 60 },
      r3: { name: "C", complexity: "standard", protein: "beef", totalTime: 40 },
      r4: { name: "D", complexity: "standard", totalTime: 30 },
    });
    expect(meters).toMatchObject({ staple: 1, standard: 2, involved: 1, total: 4 });
    expect(meters.proteins.sort()).toEqual(["beef", "chicken"]);
  });
});

// ─── persistence version guard ───────────────────────────────────────────────

describe("parseWizardState", () => {
  const weekOf = "2026-07-20";
  const valid = JSON.stringify({ ...createInitialWizardState(weekOf), selectedRecipeIds: ["r1"] });

  it("accepts a current-version payload for the matching week", () => {
    const state = parseWizardState(valid, weekOf);
    expect(state?.selectedRecipeIds).toEqual(["r1"]);
    expect(state?.version).toBe(WIZARD_VERSION);
  });

  it("rejects an older schema version", () => {
    const old = JSON.stringify({ ...createInitialWizardState(weekOf), version: 0 });
    expect(parseWizardState(old, weekOf)).toBeNull();
  });

  it("rejects a payload from a different week", () => {
    expect(parseWizardState(valid, "2026-07-27")).toBeNull();
  });

  it("returns null for null or malformed input", () => {
    expect(parseWizardState(null, weekOf)).toBeNull();
    expect(parseWizardState("{not json", weekOf)).toBeNull();
  });
});

// ─── message builders (sanity) ───────────────────────────────────────────────

describe("phase-message builders", () => {
  it("buildOptionsRefineMessage carries the phase header, grid, and request", () => {
    const msg = buildOptionsRefineMessage(
      "2026-07-20",
      [{ name: "Tacos", id: "r1", complexity: "standard", protein: "beef" }],
      "more chicken please",
    );
    expect(msg.startsWith("PHASE:OPTIONS")).toBe(true);
    expect(msg).toContain("Tacos (r1) | standard | beef");
    expect(msg).toContain("User request: more chicken please");
  });

  it("buildDraftMessage lists selected meals with the draft instruction", () => {
    const msg = buildDraftMessage(
      "2026-07-20",
      [{ name: "Tacos", id: "r1", complexity: "standard", protein: "beef", totalTime: 30 }],
      "Tuesday is soccer night",
    );
    expect(msg.startsWith("PHASE:DRAFT")).toBe(true);
    expect(msg).toContain("Tacos (r1)");
    expect(msg).toContain("Constraints recap: Tuesday is soccer night");
    expect(msg).toContain("present_plan_draft");
  });
});

// ─── review analytics ───────────────────────────────────────────────────────

describe("computeReviewAnalytics", () => {
  it("derives effort, cook times, proteins, and cuisines from draft + meta", () => {
    const draft: DraftMealUI[] = [
      {
        day: "tuesday",
        mealType: "dinner",
        recipeId: "r1",
        recipeName: "Tacos",
        complexity: "standard",
        dayReasoning: "",
        sides: [],
        adaptationDecisions: [],
      },
      {
        day: "monday",
        mealType: "dinner",
        recipeId: "r2",
        recipeName: "Roast",
        complexity: "involved",
        dayReasoning: "",
        sides: [],
        adaptationDecisions: [],
      },
    ];
    const analytics = computeReviewAnalytics(draft, {
      r1: { name: "Tacos", complexity: "standard", protein: "beef", cuisine: "mexican", totalTime: 30 },
      r2: { name: "Roast", complexity: "involved", protein: "beef", cuisine: "american", totalTime: 90 },
    });
    // Sorted by day: monday before tuesday.
    expect(analytics.cookTimes).toEqual([
      { day: "monday", minutes: 90 },
      { day: "tuesday", minutes: 30 },
    ]);
    expect(analytics.effort).toEqual({ staple: 0, standard: 1, involved: 1 });
    expect(analytics.cuisines).toEqual(["american", "mexican"]);
    expect(analytics.total).toBe(2);
  });
});
