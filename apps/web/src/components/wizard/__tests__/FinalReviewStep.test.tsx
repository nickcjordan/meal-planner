import { describe, it, expect } from "vitest";
import { parseExclusionKey } from "../FinalReviewStep";

// NOTE: like the sibling PlanDraftStep.test.tsx, this suite cannot execute until
// apps/web gets a vitest config resolving the `@/` path alias — FinalReviewStep
// transitively imports `@/components/ui`, which vitest currently can't resolve.
// The assertions below cover the pure `parseExclusionKey` helper (the inverse of
// lib/wizard `itemExclusionKeys`) and pass once that shared infra lands.

describe("parseExclusionKey", () => {
  it("parses a recipe key", () => {
    expect(parseExclusionKey("recipe:abc-123:olive oil")).toEqual({
      type: "recipe",
      source: "abc-123",
      name: "olive oil",
    });
  });

  it("parses an extra key", () => {
    expect(parseExclusionKey("extra:Birthday cake:eggs")).toEqual({
      type: "extra",
      source: "Birthday cake",
      name: "eggs",
    });
  });

  it("parses a side key (day-mealType middle)", () => {
    expect(parseExclusionKey("side:monday-dinner:parmesan")).toEqual({
      type: "side",
      source: "monday-dinner",
      name: "parmesan",
    });
  });

  it("keeps interior colons in the source; name is the last segment", () => {
    expect(parseExclusionKey("recipe:ns:id:99:sea salt")).toEqual({
      type: "recipe",
      source: "ns:id:99",
      name: "sea salt",
    });
  });

  it("degrades gracefully on a malformed key", () => {
    expect(parseExclusionKey("justsomething")).toEqual({
      type: "unknown",
      source: "",
      name: "justsomething",
    });
  });
});
