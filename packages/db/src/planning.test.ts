import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlanningSession } from "@meal-planner/types";
import type { RecipeSummary } from "./recipes.js";

// Mock the sibling data-access modules so getPlanningOptions runs without AWS.
vi.mock("./recipes.js", () => ({
  listRecipeSummaries: vi.fn(),
  getRecipesBatch: vi.fn(),
}));
vi.mock("./sessions.js", () => ({ getRecentSessions: vi.fn() }));
vi.mock("./preferences.js", () => ({ listPreferences: vi.fn() }));
vi.mock("./members.js", () => ({ listFamilyMembers: vi.fn() }));
vi.mock("./pantry.js", () => ({ listPantryItems: vi.fn() }));

import { getPlanningOptions, seededJitter } from "./planning.js";
import { listRecipeSummaries } from "./recipes.js";
import { getRecentSessions } from "./sessions.js";
import { listPreferences } from "./preferences.js";
import { listFamilyMembers } from "./members.js";
import { listPantryItems } from "./pantry.js";

const WEEK = "2026-07-20"; // Monday

function summary(
  over: Partial<RecipeSummary> & { id: string; name: string },
): RecipeSummary {
  return {
    description: "",
    complexity: "standard",
    tags: [],
    categories: [],
    ingredientNames: [],
    prepTime: 10,
    cookTime: 20,
    servings: 4,
    avgRating: null,
    lastCookedAt: null,
    ...over,
  };
}

function session(weekOf: string, recipeIds: string[]): PlanningSession {
  return {
    id: `s-${weekOf}-${recipeIds.join("-")}`,
    weekOf,
    status: "confirmed",
    meals: recipeIds.map((recipeId) => ({
      day: "monday",
      mealType: "dinner",
      recipeId,
    })),
    summary: "",
    createdAt: weekOf,
    updatedAt: weekOf,
  } as PlanningSession;
}

/** Point the mocks at a fixed dataset; individual tests override pieces. */
function setup(opts: {
  summaries: RecipeSummary[];
  sessions?: PlanningSession[];
  restrictions?: string[];
}) {
  vi.mocked(listRecipeSummaries).mockResolvedValue(opts.summaries);
  vi.mocked(getRecentSessions).mockResolvedValue(opts.sessions ?? []);
  vi.mocked(listPreferences).mockResolvedValue(
    (opts.restrictions ?? []).map((key) => ({
      type: "restriction" as const,
      key,
      value: "test",
      createdAt: WEEK,
      updatedAt: WEEK,
    })),
  );
  vi.mocked(listFamilyMembers).mockResolvedValue([]);
  vi.mocked(listPantryItems).mockResolvedValue([]);
}

describe("seededJitter", () => {
  it("is deterministic for the same week + recipe", () => {
    expect(seededJitter(WEEK, "r1")).toBe(seededJitter(WEEK, "r1"));
    expect(seededJitter(WEEK, "abc")).toBe(seededJitter(WEEK, "abc"));
  });

  it("varies by week and by recipe", () => {
    expect(seededJitter(WEEK, "r1")).not.toBe(seededJitter("2026-07-27", "r1"));
    expect(seededJitter(WEEK, "r1")).not.toBe(seededJitter(WEEK, "r2"));
  });

  it("stays within [-0.5, 0.5) across many inputs", () => {
    for (let i = 0; i < 2000; i++) {
      const v = seededJitter(WEEK, `recipe-${i}`);
      expect(v).toBeGreaterThanOrEqual(-0.5);
      expect(v).toBeLessThan(0.5);
    }
  });
});

describe("getPlanningOptions — recentlyMade demotion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scores are deterministic across calls (seeded jitter)", async () => {
    setup({
      summaries: [
        summary({ id: "r1", name: "Alpha" }),
        summary({ id: "r2", name: "Beta" }),
        summary({ id: "r3", name: "Gamma" }),
      ],
    });
    const a = await getPlanningOptions(WEEK);
    const b = await getPlanningOptions(WEEK);
    expect(a.options.map((o) => [o.id, o.score])).toEqual(
      b.options.map((o) => [o.id, o.score]),
    );
  });

  it("demotes recently-cooked and overcooked recipes below all fresh ones", async () => {
    setup({
      summaries: [
        summary({ id: "fresh1", name: "Fresh One" }),
        summary({ id: "fresh2", name: "Fresh Two" }),
        summary({ id: "fresh3", name: "Fresh Three" }),
        summary({ id: "recent", name: "Recent" }),
        summary({ id: "over", name: "Overcooked" }),
      ],
      sessions: [
        // "recent" cooked last week (within 3 weeks) → demoted
        session("2026-07-13", ["recent"]),
        // "over" cooked 3× within the 8-week window → demoted
        session("2026-07-06", ["over"]),
        session("2026-06-29", ["over"]),
        session("2026-06-22", ["over"]),
      ],
    });

    const { options } = await getPlanningOptions(WEEK);

    // rank is 1-based and sequential
    expect(options.map((o) => o.rank)).toEqual(
      options.map((_, i) => i + 1),
    );

    const byId = new Map(options.map((o) => [o.id, o]));
    expect(byId.get("recent")!.recentlyMade).toBe(true);
    expect(byId.get("over")!.recentlyMade).toBe(true);
    expect(byId.get("over")!.timesCooked8Weeks).toBe(3);
    expect(byId.get("fresh1")!.recentlyMade).toBe(false);

    // Every fresh option ranks before every demoted option.
    const maxFreshRank = Math.max(
      ...options.filter((o) => !o.recentlyMade).map((o) => o.rank),
    );
    const minDemotedRank = Math.min(
      ...options.filter((o) => o.recentlyMade).map((o) => o.rank),
    );
    expect(maxFreshRank).toBeLessThan(minDemotedRank);

    // Each block is sorted by score descending.
    const fresh = options.filter((o) => !o.recentlyMade);
    const demoted = options.filter((o) => o.recentlyMade);
    for (let i = 1; i < fresh.length; i++) {
      expect(fresh[i - 1].score).toBeGreaterThanOrEqual(fresh[i].score);
    }
    for (let i = 1; i < demoted.length; i++) {
      expect(demoted[i - 1].score).toBeGreaterThanOrEqual(demoted[i].score);
    }
  });

  it("caps the unfiltered grid at 20 options", async () => {
    const summaries = Array.from({ length: 30 }, (_, i) =>
      summary({ id: `r${i}`, name: `Recipe ${i}` }),
    );
    setup({ summaries });
    const { options } = await getPlanningOptions(WEEK);
    expect(options).toHaveLength(20);
  });
});

describe("getPlanningOptions — query search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters by substring but keeps restrictions hard-excluded", async () => {
    setup({
      summaries: [
        // Matches "chicken" by name AND ingredient, but contains a restricted nut.
        summary({
          id: "nutty",
          name: "Nutty Chicken",
          ingredientNames: ["peanuts", "chicken breast"],
        }),
        // Clean match.
        summary({
          id: "grilled",
          name: "Grilled Chicken",
          ingredientNames: ["chicken breast", "olive oil"],
        }),
        // Non-match (filtered out by query).
        summary({
          id: "soup",
          name: "Tomato Soup",
          ingredientNames: ["tomato", "basil"],
        }),
      ],
      restrictions: ["nuts"],
    });

    const { options } = await getPlanningOptions(WEEK, { query: "chicken" });

    const ids = options.map((o) => o.id);
    expect(ids).toContain("grilled");
    expect(ids).not.toContain("nutty"); // hard-excluded by restriction
    expect(ids).not.toContain("soup"); // doesn't match query
  });

  it("matches against tags and returns more than the 20-cap when searching", async () => {
    const summaries = Array.from({ length: 25 }, (_, i) =>
      summary({ id: `t${i}`, name: `Item ${i}`, tags: ["quick"] }),
    );
    setup({ summaries });
    const { options } = await getPlanningOptions(WEEK, { query: "quick" });
    expect(options).toHaveLength(25); // no cap when a query is present
  });
});
