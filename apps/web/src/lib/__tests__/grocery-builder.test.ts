import { describe, it, expect } from "vitest";
import type {
  CarryoverItem,
  DietaryAdaptation,
  FamilyMember,
  Ingredient,
  PantryItem,
  Recipe,
  SessionStapleItem,
  Side,
} from "@meal-planner/types";
import {
  buildGroceryItems,
  type BuildGroceryContext,
  type BuildGroceryInput,
} from "../grocery-builder";

// ─── Factories ───────────────────────────────────────────────────────────────

function ing(
  name: string,
  quantity: number,
  unit: string,
  category?: string,
): Ingredient {
  return { name, quantity, unit, category };
}

function makeRecipe(id: string, name: string, items: Ingredient[]): Recipe {
  return {
    id,
    name,
    description: "",
    ingredientSections: [{ items }],
    stepSections: [],
    cookTime: 0,
    prepTime: 0,
    servings: 2,
    tags: [],
    categories: [],
    complexity: "standard",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function makeSide(id: string, name: string, items: Ingredient[]): Side {
  return {
    id,
    name,
    baseIngredient: "",
    complexity: "simple",
    ingredients: items,
    tags: [],
    sideCategory: "starch",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function lactoseAdaptation(
  overrides: Partial<DietaryAdaptation> = {},
): DietaryAdaptation {
  return {
    id: "adapt-1",
    memberId: "m1",
    name: "Lactose",
    leniency: "always",
    rules: [{ id: "r1", from: "milk", to: "lactose-free milk", quality: "exact" }],
    isActive: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function makeMember(id: string, name: string): FamilyMember {
  return { id, name, isActive: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
}

function makePantry(name: string): PantryItem {
  return {
    id: name,
    name,
    normalizedName: name,
    category: "other",
    isDefault: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function makeCarryover(
  name: string,
  status: CarryoverItem["status"],
  requiredQuantity: number,
  unit: string,
): CarryoverItem {
  return {
    name,
    estimatedQuantity: 0,
    unit,
    source: {
      weekOf: "2025-12-29",
      recipeName: "Prior",
      purchasedQuantity: 10,
      usedQuantity: 8,
    },
    neededFor: { day: "monday", recipeName: "This Week", requiredQuantity },
    status,
  };
}

function makeContext(
  overrides: Partial<BuildGroceryContext> = {},
): BuildGroceryContext {
  return {
    recipes: new Map(),
    sides: new Map(),
    adaptations: [],
    members: [],
    pantryItems: [],
    restrictions: [],
    ...overrides,
  };
}

const WEEK = "2026-01-05";

function baseInput(overrides: Partial<BuildGroceryInput> = {}): BuildGroceryInput {
  return { sessionId: "s1", weekOf: WEEK, meals: [], ...overrides };
}

// ─── Consolidation ───────────────────────────────────────────────────────────

describe("buildGroceryItems — consolidation", () => {
  it("dedups by name||unit (case-insensitive), summing quantities and merging sources", () => {
    const recipes = new Map([
      ["r1", makeRecipe("r1", "Pasta", [ing("garlic", 2, "clove", "produce")])],
      ["r2", makeRecipe("r2", "Soup", [ing("Garlic", 3, "clove", "produce")])],
    ]);
    const input = baseInput({
      meals: [
        { day: "monday", mealType: "dinner", recipeId: "r1" },
        { day: "tuesday", mealType: "dinner", recipeId: "r2" },
      ],
    });

    const { items } = buildGroceryItems(input, makeContext({ recipes }));

    expect(items).toHaveLength(1);
    const garlic = items[0];
    expect(garlic.name).toBe("garlic");
    expect(garlic.quantity).toBe(5);
    expect(garlic.sources).toHaveLength(2);
  });

  it("keeps different units as separate lines", () => {
    const recipes = new Map([
      [
        "r1",
        makeRecipe("r1", "Mix", [
          ing("flour", 1, "cup", "pantry"),
          ing("flour", 100, "g", "pantry"),
        ]),
      ],
    ]);
    const input = baseInput({
      meals: [{ day: "monday", mealType: "dinner", recipeId: "r1" }],
    });

    const { items } = buildGroceryItems(input, makeContext({ recipes }));
    expect(items).toHaveLength(2);
  });
});

// ─── Exclusion keys ──────────────────────────────────────────────────────────

describe("buildGroceryItems — exclusion keys", () => {
  it("recipe: excludes only the targeted recipe's ingredient", () => {
    const recipes = new Map([
      ["r1", makeRecipe("r1", "A", [ing("garlic", 2, "clove")])],
      ["r2", makeRecipe("r2", "B", [ing("garlic", 3, "clove")])],
    ]);
    const input = baseInput({
      meals: [
        { day: "monday", mealType: "dinner", recipeId: "r1" },
        { day: "tuesday", mealType: "dinner", recipeId: "r2" },
      ],
      excludedIngredients: ["recipe:r1:garlic"],
    });

    const { items } = buildGroceryItems(input, makeContext({ recipes }));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3); // only r2 contributes
  });

  it("extra: excludes the named extra ingredient", () => {
    const input = baseInput({
      extras: [
        {
          name: "Party",
          ingredients: [
            { name: "chips", quantity: 1, unit: "bag" },
            { name: "soda", quantity: 2, unit: "bottle" },
          ],
        },
      ],
      excludedIngredients: ["extra:Party:chips"],
    });

    const { items } = buildGroceryItems(input, makeContext());
    expect(items.map((i) => i.name).sort()).toEqual(["soda"]);
  });

  it("side: excludes a side ingredient via side:{day}-{mealType}:{name} (inline and ref)", () => {
    const recipes = new Map([["r1", makeRecipe("r1", "Main", [ing("beef", 1, "lb")])]]);
    const sides = new Map([["side-rice", makeSide("side-rice", "Rice", [ing("rice", 1, "cup")])]]);
    const input = baseInput({
      meals: [
        {
          day: "monday",
          mealType: "dinner",
          recipeId: "r1",
          sides: [
            { kind: "ref", sideId: "side-rice" },
            {
              kind: "inline",
              name: "Salad",
              ingredients: [ing("lettuce", 1, "head")],
              complexity: "simple",
            },
          ],
        },
      ],
      excludedIngredients: [
        "side:monday-dinner:rice",
        "side:monday-dinner:lettuce",
      ],
    });

    const { items } = buildGroceryItems(input, makeContext({ recipes, sides }));
    expect(items.map((i) => i.name).sort()).toEqual(["beef"]);
  });
});

// ─── Per-meal adaptations ────────────────────────────────────────────────────

describe("buildGroceryItems — per-meal adaptations", () => {
  const recipes = new Map([
    ["milk-recipe", makeRecipe("milk-recipe", "Milkshake", [ing("milk", 2, "cup", "dairy")])],
  ]);
  const ctx = () =>
    makeContext({
      recipes,
      adaptations: [lactoseAdaptation()],
      members: [makeMember("m1", "Dad")],
    });

  it("applied:true swaps the ingredient", () => {
    const input = baseInput({
      meals: [
        {
          day: "monday",
          mealType: "dinner",
          recipeId: "milk-recipe",
          adaptations: [{ adaptationName: "Lactose", applied: true }],
        },
      ],
    });
    const { items } = buildGroceryItems(input, ctx());
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("lactose-free milk");
    expect(items[0].sources[0].type).toBe("adaptation");
  });

  it("applied:false leaves the ingredient unchanged", () => {
    const input = baseInput({
      meals: [
        {
          day: "monday",
          mealType: "dinner",
          recipeId: "milk-recipe",
          adaptations: [{ adaptationName: "Lactose", applied: false }],
        },
      ],
    });
    const { items } = buildGroceryItems(input, ctx());
    expect(items[0].name).toBe("milk");
    expect(items[0].sources[0].type).toBe("recipe");
  });

  it("absent adaptations field falls back to global apply", () => {
    const input = baseInput({
      meals: [{ day: "monday", mealType: "dinner", recipeId: "milk-recipe" }],
    });
    const { items } = buildGroceryItems(input, ctx());
    expect(items[0].name).toBe("lactose-free milk");
  });

  it("empty adaptations array applies nothing (present-but-empty)", () => {
    const input = baseInput({
      meals: [
        {
          day: "monday",
          mealType: "dinner",
          recipeId: "milk-recipe",
          adaptations: [],
        },
      ],
    });
    const { items } = buildGroceryItems(input, ctx());
    expect(items[0].name).toBe("milk");
  });

  it("populates §3b origin provenance from a replaced recipe source", () => {
    const input = baseInput({
      meals: [
        {
          day: "monday",
          mealType: "dinner",
          recipeId: "milk-recipe",
          adaptations: [{ adaptationName: "Lactose", applied: true }],
        },
      ],
    });
    const { items } = buildGroceryItems(input, ctx());
    const src = items[0].sources[0];
    expect(src.type).toBe("adaptation");
    if (src.type === "adaptation") {
      expect(src.originRecipeId).toBe("milk-recipe");
      expect(src.originRecipeName).toBe("Milkshake");
      expect(src.originalIngredient).toBe("milk");
      expect(src.memberName).toBe("Dad");
    }
  });

  it("populates §3b origin provenance from a replaced side source", () => {
    const recipesLocal = new Map([
      ["r1", makeRecipe("r1", "Main", [ing("beef", 1, "lb")])],
    ]);
    const input = baseInput({
      meals: [
        {
          day: "friday",
          mealType: "dinner",
          recipeId: "r1",
          sides: [
            {
              kind: "inline",
              name: "Creamed Corn",
              ingredients: [ing("milk", 1, "cup", "dairy")],
              complexity: "simple",
            },
          ],
          adaptations: [{ adaptationName: "Lactose", applied: true }],
        },
      ],
    });
    const { items } = buildGroceryItems(
      input,
      makeContext({
        recipes: recipesLocal,
        adaptations: [lactoseAdaptation()],
        members: [makeMember("m1", "Dad")],
      }),
    );
    const adapted = items.find((i) => i.name === "lactose-free milk");
    expect(adapted).toBeDefined();
    const src = adapted!.sources[0];
    expect(src.type).toBe("adaptation");
    if (src.type === "adaptation") {
      expect(src.originSideName).toBe("Creamed Corn");
      expect(src.originDay).toBe("friday");
    }
  });
});

// ─── Carryovers ──────────────────────────────────────────────────────────────

describe("buildGroceryItems — carryovers", () => {
  it("includes only status:need carryovers, not unresolved/confirmed", () => {
    const input = baseInput({
      carryoverItems: [
        makeCarryover("butter", "need", 2, "tbsp"),
        makeCarryover("sugar", "confirmed", 1, "cup"),
        makeCarryover("flour", "unresolved", 1, "cup"),
      ],
    });
    const { items } = buildGroceryItems(input, makeContext());
    expect(items.map((i) => i.name).sort()).toEqual(["butter"]);
    expect(items[0].sources[0].type).toBe("carryover");
    expect(items[0].quantity).toBe(2);
  });

  it("merges a need-carryover into an existing matching line", () => {
    const recipes = new Map([
      ["r1", makeRecipe("r1", "Bake", [ing("butter", 1, "tbsp", "dairy")])],
    ]);
    const input = baseInput({
      meals: [{ day: "monday", mealType: "dinner", recipeId: "r1" }],
      carryoverItems: [makeCarryover("butter", "need", 3, "tbsp")],
    });
    const { items } = buildGroceryItems(input, makeContext({ recipes }));
    const butter = items.find((i) => i.name === "butter");
    expect(butter?.quantity).toBe(4);
    expect(butter?.sources.map((s) => s.type).sort()).toEqual([
      "carryover",
      "recipe",
    ]);
  });
});

// ─── Pantry filtering ────────────────────────────────────────────────────────

describe("buildGroceryItems — pantry filtering", () => {
  it("suppresses items matching pantry staples but keeps the rest", () => {
    const recipes = new Map([
      [
        "r1",
        makeRecipe("r1", "Dressing", [
          ing("olive oil", 2, "tbsp", "pantry"),
          ing("salt", 1, "tsp", "spices"),
        ]),
      ],
    ]);
    const input = baseInput({
      meals: [{ day: "monday", mealType: "dinner", recipeId: "r1" }],
    });
    const { items } = buildGroceryItems(
      input,
      makeContext({ recipes, pantryItems: [makePantry("olive oil")] }),
    );
    expect(items.map((i) => i.name).sort()).toEqual(["salt"]);
  });
});

// ─── Staples ─────────────────────────────────────────────────────────────────

describe("buildGroceryItems — grocery staples", () => {
  it("passes flexible staples through with description and no quantity", () => {
    const staple: SessionStapleItem = {
      name: "Snacks",
      style: "flexible",
      category: "pantry",
      description: "Grab 2-3 the kids will eat",
      frequency: "weekly",
    };
    const input = baseInput({ groceryStaples: [staple] });
    const { items } = buildGroceryItems(input, makeContext());
    expect(items).toHaveLength(1);
    expect(items[0].isFlexible).toBe(true);
    expect(items[0].flexibleDescription).toBe("Grab 2-3 the kids will eat");
    expect(items[0].quantity).toBe(0);
    expect(items[0].unit).toBe("");
    expect(items[0].sources[0].type).toBe("staple");
  });

  it("passes specific staples through with quantity", () => {
    const staple: SessionStapleItem = {
      name: "Milk",
      style: "specific",
      category: "dairy",
      quantity: 1,
      unit: "gallon",
      frequency: "weekly",
    };
    const { items } = buildGroceryItems(
      baseInput({ groceryStaples: [staple] }),
      makeContext(),
    );
    expect(items[0].isFlexible).toBe(false);
    expect(items[0].quantity).toBe(1);
  });

  it("skips a staple already covered by a recipe ingredient of the same name", () => {
    const recipes = new Map([
      ["r1", makeRecipe("r1", "Cereal", [ing("milk", 2, "cup", "dairy")])],
    ]);
    const staple: SessionStapleItem = {
      name: "milk",
      style: "specific",
      category: "dairy",
      quantity: 1,
      unit: "gallon",
      frequency: "weekly",
    };
    const input = baseInput({
      meals: [{ day: "monday", mealType: "dinner", recipeId: "r1" }],
      groceryStaples: [staple],
    });
    const { items } = buildGroceryItems(input, makeContext({ recipes }));
    const milk = items.filter((i) => i.name === "milk");
    expect(milk).toHaveLength(1); // staple did not add a second line
    expect(milk[0].sources[0].type).toBe("recipe");
  });
});

// ─── Day-less (Step 1) meals ─────────────────────────────────────────────────

describe("buildGroceryItems — day-less meals", () => {
  it("contributes recipe ingredients only; sides are skipped without a day", () => {
    const recipes = new Map([
      ["r1", makeRecipe("r1", "Main", [ing("garlic", 1, "clove", "produce")])],
    ]);
    const input = baseInput({
      meals: [
        {
          recipeId: "r1",
          sides: [
            {
              kind: "inline",
              name: "Rice",
              ingredients: [ing("rice", 1, "cup")],
              complexity: "simple",
            },
          ],
        },
      ],
    });
    const { items } = buildGroceryItems(input, makeContext({ recipes }));
    expect(items.map((i) => i.name).sort()).toEqual(["garlic"]);
  });
});

// ─── Restriction warnings ────────────────────────────────────────────────────

describe("buildGroceryItems — restriction warnings", () => {
  it("warns when a recipe ingredient matches a restriction", () => {
    const recipes = new Map([
      ["r1", makeRecipe("r1", "Chicken Satay", [ing("peanuts", 1, "cup")])],
    ]);
    const input = baseInput({
      meals: [{ day: "monday", mealType: "dinner", recipeId: "r1" }],
    });
    const { warnings } = buildGroceryItems(
      input,
      makeContext({ recipes, restrictions: ["nuts"] }),
    );
    expect(warnings).toContain(
      '"Chicken Satay" contains peanuts (restriction: nuts)',
    );
  });

  it("does NOT flag false-positive exclusions (coconut milk for milk)", () => {
    const recipes = new Map([
      [
        "r1",
        makeRecipe("r1", "Curry", [
          ing("coconut milk", 1, "can"),
          ing("whole milk", 1, "cup"),
        ]),
      ],
    ]);
    const input = baseInput({
      meals: [{ day: "monday", mealType: "dinner", recipeId: "r1" }],
    });
    const { warnings } = buildGroceryItems(
      input,
      makeContext({ recipes, restrictions: ["milk"] }),
    );
    // coconut milk is suppressed, but whole milk is a genuine hit
    expect(warnings).toContain('"Curry" contains whole milk (restriction: milk)');
    expect(
      warnings.some((w) => w.includes("coconut milk")),
    ).toBe(false);
  });

  it("warns and skips a meal whose recipe does not resolve", () => {
    const input = baseInput({
      meals: [{ day: "monday", mealType: "dinner", recipeId: "missing" }],
    });
    const { items, warnings } = buildGroceryItems(input, makeContext());
    expect(items).toHaveLength(0);
    expect(warnings).toContain("Recipe not found (missing) — meal skipped.");
  });
});
