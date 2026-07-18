import { describe, it, expect } from "vitest";
import {
  dayIndex,
  orderDraft,
  otherMealsOnDay,
  sideInlineCount,
  sideChipTitle,
  adaptationTooltip,
  completenessTone,
} from "../PlanDraftStep";
import type { DraftMealUI } from "@/lib/wizard";

// ─── Factories ────────────────────────────────────────────────────────────────

type DraftSide = DraftMealUI["sides"][number];
type DraftAdaptation = DraftMealUI["adaptationDecisions"][number];

function meal(overrides: Partial<DraftMealUI> = {}): DraftMealUI {
  return {
    day: "monday",
    mealType: "dinner",
    recipeId: "r1",
    recipeName: "Test Meal",
    complexity: "standard",
    dayReasoning: "",
    sides: [],
    adaptationDecisions: [],
    ...overrides,
  };
}

function side(overrides: Partial<DraftSide> = {}): DraftSide {
  return {
    sideName: "Roasted Broccoli",
    sideCategory: "green",
    complexity: "simple",
    preAccepted: true,
    accepted: true,
    ...overrides,
  } as DraftSide;
}

function adaptation(overrides: Partial<DraftAdaptation> = {}): DraftAdaptation {
  return {
    adaptationName: "Lactose-free",
    memberName: "Nick",
    applied: true,
    ...overrides,
  };
}

// ─── dayIndex ─────────────────────────────────────────────────────────────────

describe("dayIndex", () => {
  it("is sunday-first", () => {
    expect(dayIndex("sunday")).toBe(0);
    expect(dayIndex("monday")).toBe(1);
    expect(dayIndex("saturday")).toBe(6);
  });

  it("sorts unknown days last", () => {
    expect(dayIndex("someday")).toBe(99);
  });
});

// ─── orderDraft ───────────────────────────────────────────────────────────────

describe("orderDraft", () => {
  it("orders by day (sunday-first) and preserves the original index", () => {
    const draft = [
      meal({ day: "tuesday", recipeName: "Tue" }),
      meal({ day: "sunday", recipeName: "Sun" }),
      meal({ day: "friday", recipeName: "Fri" }),
    ];
    const ordered = orderDraft(draft);
    expect(ordered.map((o) => o.meal.recipeName)).toEqual(["Sun", "Tue", "Fri"]);
    // idx points back into the ORIGINAL array
    expect(ordered.map((o) => o.idx)).toEqual([1, 0, 2]);
  });

  it("keeps stable order for meals sharing a day", () => {
    const draft = [
      meal({ day: "monday", recipeName: "First" }),
      meal({ day: "monday", recipeName: "Second" }),
    ];
    const ordered = orderDraft(draft);
    expect(ordered.map((o) => o.meal.recipeName)).toEqual(["First", "Second"]);
  });
});

// ─── otherMealsOnDay ──────────────────────────────────────────────────────────

describe("otherMealsOnDay", () => {
  const draft = [
    meal({ day: "monday", recipeName: "A" }),
    meal({ day: "monday", recipeName: "B" }),
    meal({ day: "tuesday", recipeName: "C" }),
  ];

  it("returns other meals scheduled on the same day, excluding the current row", () => {
    expect(otherMealsOnDay(draft, 0, "monday")).toEqual(["B"]);
  });

  it("returns empty for a free day", () => {
    expect(otherMealsOnDay(draft, 0, "wednesday")).toEqual([]);
  });

  it("does not list the current meal against its own day", () => {
    expect(otherMealsOnDay(draft, 2, "tuesday")).toEqual([]);
  });
});

// ─── sideInlineCount / sideChipTitle ─────────────────────────────────────────

describe("sideInlineCount", () => {
  it("is null for a library side (has sideId)", () => {
    expect(sideInlineCount(side({ sideId: "lib-1" }))).toBeNull();
  });

  it("counts inline ingredients", () => {
    expect(
      sideInlineCount(
        side({ ingredients: [{ name: "x" }, { name: "y" }] as DraftSide["ingredients"] }),
      ),
    ).toBe(2);
  });

  it("is 0 for an inline side with no ingredients array", () => {
    expect(sideInlineCount(side({ ingredients: undefined }))).toBe(0);
  });
});

describe("sideChipTitle", () => {
  it("combines reasoning and inline ingredient count", () => {
    const s = side({
      reasoning: "Pairs with chicken",
      ingredients: [{ name: "x" }, { name: "y" }, { name: "z" }] as DraftSide["ingredients"],
    });
    expect(sideChipTitle(s)).toBe("Pairs with chicken · 3 ingredients");
  });

  it("singularises one ingredient", () => {
    const s = side({ reasoning: undefined, ingredients: [{ name: "x" }] as DraftSide["ingredients"] });
    expect(sideChipTitle(s)).toBe("1 ingredient");
  });

  it("shows only reasoning for a library side", () => {
    expect(sideChipTitle(side({ sideId: "lib-1", reasoning: "Classic combo" }))).toBe(
      "Classic combo",
    );
  });

  it("is empty when a library side has no reasoning", () => {
    expect(sideChipTitle(side({ sideId: "lib-1", reasoning: undefined }))).toBe("");
  });
});

// ─── adaptationTooltip ────────────────────────────────────────────────────────

describe("adaptationTooltip", () => {
  it("lists swaps when applied", () => {
    const a = adaptation({
      applied: true,
      swaps: [
        { from: "milk", to: "oat milk", quality: "exact" },
        { from: "butter", to: "olive oil", quality: "approximate" },
      ],
    });
    expect(adaptationTooltip(a)).toBe(
      "Adapted: milk → oat milk, butter → olive oil — click to skip",
    );
  });

  it("handles applied with no swaps", () => {
    expect(adaptationTooltip(adaptation({ applied: true, swaps: undefined }))).toBe(
      "Adapted — click to skip",
    );
  });

  it("shows skipReason and skipNote when not applied", () => {
    const a = adaptation({
      applied: false,
      skipReason: "Only a trace of dairy",
      skipNote: "Take a Lactaid pill",
    });
    expect(adaptationTooltip(a)).toBe(
      "Only a trace of dairy — Take a Lactaid pill — click to adapt",
    );
  });

  it("defaults the reason when not applied and none given", () => {
    expect(adaptationTooltip(adaptation({ applied: false, skipReason: undefined }))).toBe(
      "Not adapted — click to adapt",
    );
  });
});

// ─── completenessTone ─────────────────────────────────────────────────────────

describe("completenessTone", () => {
  it("reads a self-sufficient meal as complete", () => {
    expect(completenessTone("Complete on its own")).toBe("complete");
    expect(completenessTone("This is a self-contained meal")).toBe("complete");
  });

  it("reads a gap note as consider", () => {
    expect(completenessTone("Consider adding a starch")).toBe("consider");
    expect(completenessTone("Needs a green")).toBe("consider");
  });
});
