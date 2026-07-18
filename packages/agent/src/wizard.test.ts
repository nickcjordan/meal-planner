import { describe, it, expect } from "vitest";
import { runPlanningTurn } from "./session.js";
import type { StreamEvent } from "./session.js";
import {
  mealOptionsPayloadSchema,
  planDraftPayloadSchema,
  weekRoundoutPayloadSchema,
} from "./tools.js";
import type {
  MealOptionsPayload,
  PlanDraftPayload,
  WeekRoundoutPayload,
} from "./tools.js";

// ---------------------------------------------------------------------------
// Type-level: the StreamEvent union carries the three new wizard variants, and
// each variant's `payload` is exactly the corresponding inferred payload type.
// These assignments are checked by `tsc --noEmit` (this file is in the program).
// ---------------------------------------------------------------------------

type MealOptionsEvent = Extract<StreamEvent, { type: "meal_options" }>;
type PlanDraftEvent = Extract<StreamEvent, { type: "plan_draft" }>;
type WeekRoundoutEvent = Extract<StreamEvent, { type: "week_roundout" }>;

const _mealOptionsPayloadWired: MealOptionsEvent["payload"] = {} as MealOptionsPayload;
const _planDraftPayloadWired: PlanDraftEvent["payload"] = {} as PlanDraftPayload;
const _weekRoundoutPayloadWired: WeekRoundoutEvent["payload"] = {} as WeekRoundoutPayload;
void _mealOptionsPayloadWired;
void _planDraftPayloadWired;
void _weekRoundoutPayloadWired;

// The three new events must be assignable into the StreamEvent union.
const _newEvents: StreamEvent[] = [
  { type: "meal_options", payload: { message: "hi" } },
  { type: "plan_draft", payload: { meals: [] } },
  { type: "week_roundout", payload: { groceryStaples: [], carryoverItems: [], suggestions: [] } },
];
void _newEvents;

// runPlanningTurn's parameter object: claudeSessionId?/userMessage/weekOf.
const _params: Parameters<typeof runPlanningTurn>[0] = {
  userMessage: "x",
  weekOf: "2026-07-13",
};
void _params;

describe("runPlanningTurn", () => {
  it("is callable and returns an async generator", () => {
    // Creating the generator does NOT execute its body (no Claude SDK call)
    // until the first .next() — so this never touches the live API.
    const gen = runPlanningTurn({ userMessage: "PHASE:OPTIONS\n...", weekOf: "2026-07-13" });
    expect(typeof gen[Symbol.asyncIterator]).toBe("function");
    expect(typeof gen.next).toBe("function");
  });
});

describe("present_meal_options payload schema", () => {
  it("accepts a representative payload", () => {
    const payload = {
      annotations: [{ recipeId: "r1", note: "Not made in 6 weeks; kids rated it 5 stars" }],
      reorderedRecipeIds: ["r2", "r1", "r3"],
      addOptions: [
        { recipeId: "r9", recipeName: "Weeknight Salmon", complexity: "staple", reasoning: "Salmon is on sale" },
      ],
      message: "Reordered by variety and surfaced one deal.",
    };
    const result = mealOptionsPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("accepts an empty (all-optional) payload", () => {
    expect(mealOptionsPayloadSchema.safeParse({}).success).toBe(true);
  });
});

describe("present_plan_draft payload schema", () => {
  it("accepts a representative scheduled draft with library + inline sides and adaptations", () => {
    const payload = {
      meals: [
        {
          day: "saturday",
          mealType: "dinner",
          recipeId: "r1",
          recipeName: "Beef Bourguignon",
          complexity: "involved",
          dayReasoning: "Involved recipe → Saturday",
          adaptations: [
            { adaptationName: "Lactose Intolerance", memberName: "Nick", applied: false, skipNote: "Take Lactaid pill" },
          ],
          suggestedSides: [
            { sideId: "s1", sideName: "Steamed Broccoli", sideCategory: "green", complexity: "simple", preAccepted: true },
            {
              sideName: "Buttered Egg Noodles",
              sideCategory: "starch",
              complexity: "simple",
              ingredients: [{ name: "egg noodles", quantity: 12, unit: "oz", category: "pasta" }],
              preAccepted: false,
            },
          ],
          completenessNote: "needs a starch",
        },
        {
          day: "tuesday",
          mealType: "dinner",
          recipeId: "r5",
          recipeName: "Tortellini Soup",
          complexity: "standard",
          dayReasoning: "Complete one-pot meal for busy Tuesday",
          suggestedSides: [],
          completenessNote: "complete on its own",
        },
      ],
    };
    const result = planDraftPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects a meal missing suggestedSides", () => {
    const bad = {
      meals: [
        { day: "monday", mealType: "dinner", recipeId: "r1", recipeName: "X", complexity: "staple", dayReasoning: "y" },
      ],
    };
    expect(planDraftPayloadSchema.safeParse(bad).success).toBe(false);
  });
});

describe("present_week_roundout payload schema", () => {
  it("accepts a representative roundout including a pantry-promotion suggestion", () => {
    const payload = {
      groceryStaples: [
        { name: "Whole Milk", style: "specific", category: "dairy", quantity: 1, unit: "gallon", frequency: "weekly" },
        { name: "Fruit for kids", style: "flexible", category: "produce", description: "Grab 2-3 types", frequency: "weekly" },
      ],
      carryoverItems: [
        {
          name: "Heavy Cream",
          estimatedQuantity: 0.5,
          unit: "cup",
          source: { weekOf: "2026-07-06", recipeName: "Alfredo", purchasedQuantity: 1, usedQuantity: 0.5 },
          neededFor: { day: "wednesday", recipeName: "Tikka Masala", requiredQuantity: 0.25 },
        },
      ],
      suggestions: [
        {
          id: "sug-garlic",
          type: "pantry-promotion",
          title: "Promote garlic to pantry",
          description: "Garlic is in 5 of 7 meals this week",
          rationale: "Adding it to the pantry keeps it off your shopping list every week",
          item: { name: "Garlic", style: "specific", category: "produce", frequency: "weekly" },
        },
        {
          id: "sug-deal",
          type: "deal-meal",
          title: "Chicken thighs are on sale",
          description: "A recipe you skipped uses them",
          rationale: "Two sale items align with it",
        },
      ],
    };
    const result = weekRoundoutPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("rejects an unknown suggestion type", () => {
    const bad = {
      groceryStaples: [],
      carryoverItems: [],
      suggestions: [
        { id: "x", type: "not-a-real-type", title: "t", description: "d", rationale: "r" },
      ],
    };
    expect(weekRoundoutPayloadSchema.safeParse(bad).success).toBe(false);
  });
});
