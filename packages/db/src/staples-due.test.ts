import { describe, it, expect } from "vitest";
import type { GroceryStaple, PurchasePattern, StapleFrequency } from "@meal-planner/types";
import { computeStaplesDue } from "./staples-due.js";

const WEEK = "2026-07-20"; // Monday
// Reference lookback anchors relative to WEEK:
const ONE_WEEK_AGO = "2026-07-13";
const TWO_WEEKS_AGO = "2026-07-06";
const THREE_WEEKS_AGO = "2026-06-29";
const FOUR_WEEKS_AGO = "2026-06-22";

function staple(
  over: Partial<GroceryStaple> & { name: string; frequency: StapleFrequency },
): GroceryStaple {
  return {
    id: over.name,
    style: "specific",
    category: "dairy",
    isActive: true,
    createdAt: WEEK,
    updatedAt: WEEK,
    ...over,
  };
}

function purchase(itemName: string, lastPurchasedWeekOf: string): PurchasePattern {
  return {
    itemName,
    category: "dairy",
    occurrences: 1,
    totalWeeks: 8,
    lastPurchasedWeekOf,
    isCurrentStaple: true,
  };
}

const dueNames = (r: { due: GroceryStaple[] }) => r.due.map((s) => s.name);

describe("computeStaplesDue", () => {
  it("weekly staples are always due, purchased or not", () => {
    const r = computeStaplesDue(
      [
        staple({ name: "Milk", frequency: "weekly" }),
        staple({ name: "Bread", frequency: "weekly" }),
      ],
      [purchase("milk", ONE_WEEK_AGO)], // bought last week — still due
      WEEK,
    );
    expect(dueNames(r).sort()).toEqual(["Bread", "Milk"]);
  });

  it("biweekly: due at exactly 2 weeks, not due at 1 week, due if never purchased", () => {
    const exactlyTwo = computeStaplesDue(
      [staple({ name: "Eggs", frequency: "biweekly" })],
      [purchase("eggs", TWO_WEEKS_AGO)],
      WEEK,
    );
    expect(dueNames(exactlyTwo)).toEqual(["Eggs"]);

    const oneWeek = computeStaplesDue(
      [staple({ name: "Eggs", frequency: "biweekly" })],
      [purchase("eggs", ONE_WEEK_AGO)],
      WEEK,
    );
    expect(dueNames(oneWeek)).toEqual([]);

    const never = computeStaplesDue(
      [staple({ name: "Eggs", frequency: "biweekly" })],
      [],
      WEEK,
    );
    expect(dueNames(never)).toEqual(["Eggs"]);
  });

  it("monthly: due at exactly 4 weeks, not due at 3 weeks", () => {
    const exactlyFour = computeStaplesDue(
      [staple({ name: "Rice", frequency: "monthly", category: "pantry" })],
      [purchase("rice", FOUR_WEEKS_AGO)],
      WEEK,
    );
    expect(dueNames(exactlyFour)).toEqual(["Rice"]);

    const threeWeeks = computeStaplesDue(
      [staple({ name: "Rice", frequency: "monthly", category: "pantry" })],
      [purchase("rice", THREE_WEEKS_AGO)],
      WEEK,
    );
    expect(dueNames(threeWeeks)).toEqual([]);
  });

  it("tags due items with their last purchased week", () => {
    const r = computeStaplesDue(
      [staple({ name: "Milk", frequency: "weekly" })],
      [purchase("milk", TWO_WEEKS_AGO)],
      WEEK,
    );
    expect(r.due[0].lastPurchasedWeekOf).toBe(TWO_WEEKS_AGO);
  });

  it("matches purchase history by normalized (case-insensitive) name", () => {
    const r = computeStaplesDue(
      [staple({ name: "  Whole MILK ", frequency: "biweekly" })],
      [purchase("whole milk", ONE_WEEK_AGO)], // bought last week → not yet due
      WEEK,
    );
    expect(dueNames(r)).toEqual([]);
  });

  it("separates as-needed staples and never marks them due", () => {
    const r = computeStaplesDue(
      [
        staple({ name: "Foil", frequency: "as-needed", category: "other" }),
        staple({ name: "Milk", frequency: "weekly" }),
      ],
      [],
      WEEK,
    );
    expect(dueNames(r)).toEqual(["Milk"]);
    expect(r.asNeeded.map((s) => s.name)).toEqual(["Foil"]);
  });

  it("skips inactive staples entirely", () => {
    const r = computeStaplesDue(
      [
        staple({ name: "Milk", frequency: "weekly", isActive: false }),
        staple({ name: "Foil", frequency: "as-needed", isActive: false }),
        staple({ name: "Bread", frequency: "weekly", isActive: true }),
      ],
      [],
      WEEK,
    );
    expect(dueNames(r)).toEqual(["Bread"]);
    expect(r.asNeeded).toEqual([]);
  });
});
