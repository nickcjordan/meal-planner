import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/lib-dynamodb", () => {
  const send = vi.fn();
  return {
    DynamoDBDocumentClient: {
      from: vi.fn(() => ({ send })),
    },
    PutCommand: vi.fn((input: unknown) => ({ input, _type: "Put" })),
    GetCommand: vi.fn((input: unknown) => ({ input, _type: "Get" })),
    DeleteCommand: vi.fn((input: unknown) => ({ input, _type: "Delete" })),
    QueryCommand: vi.fn((input: unknown) => ({ input, _type: "Query" })),
    ScanCommand: vi.fn((input: unknown) => ({ input, _type: "Scan" })),
    UpdateCommand: vi.fn((input: unknown) => ({ input, _type: "Update" })),
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));

import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { createRecipe, getRecipe, listRecipes, deleteRecipe, updateRecipe } from "./recipes.js";
import type { CreateRecipeInput, EnrichedStepSection } from "@meal-planner/types";

function getMockSend() {
  const client = DynamoDBDocumentClient.from({} as never);
  return client.send as ReturnType<typeof vi.fn>;
}

/** Extract the Item written by the last PutCommand call. */
function lastPutItem(): Record<string, unknown> {
  const calls = (PutCommand as unknown as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1][0].Item;
}

const existingRecipeItem = {
  PK: "RECIPE#r1",
  SK: "RECIPE#r1",
  entityType: "RECIPE",
  id: "r1",
  name: "Existing",
  description: "desc",
  ingredientSections: [{ items: [{ name: "flour", quantity: 1, unit: "cup" }] }],
  stepSections: [{ steps: ["mix"] }],
  enrichedStepSections: [{ steps: [{ text: "mix it" }] }],
  cookTime: 10,
  prepTime: 5,
  servings: 2,
  tags: ["a"],
  categories: ["dinner"],
  complexity: "standard",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
};

const sampleInput: CreateRecipeInput = {
  name: "Chicken Tikka Masala",
  description: "Classic Indian curry",
  ingredientSections: [
    {
      items: [
        { name: "chicken breast", quantity: 2, unit: "lbs" },
        { name: "tikka masala sauce", quantity: 1, unit: "jar" },
      ],
    },
  ],
  stepSections: [
    {
      steps: ["Cook chicken", "Add sauce", "Simmer 20 minutes"],
    },
  ],
  cookTime: 30,
  prepTime: 15,
  servings: 4,
  tags: ["indian", "curry"],
  categories: ["dinner"],
  complexity: "involved",
};

describe("recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createRecipe", () => {
    it("creates a recipe with generated id and timestamps", async () => {
      const send = getMockSend();
      send.mockResolvedValue({});

      const recipe = await createRecipe(sampleInput);

      expect(recipe.id).toBeDefined();
      expect(recipe.name).toBe("Chicken Tikka Masala");
      expect(recipe.ingredientSections).toHaveLength(1);
      expect(recipe.stepSections).toHaveLength(1);
      expect(recipe.createdAt).toBeDefined();
      expect(recipe.updatedAt).toBeDefined();
      // 1 for recipe + 2 for tags
      expect(send).toHaveBeenCalledTimes(3);
    });
  });

  describe("getRecipe", () => {
    it("returns recipe when found", async () => {
      const send = getMockSend();
      send.mockResolvedValue({
        Item: {
          PK: "RECIPE#123",
          SK: "RECIPE#123",
          entityType: "RECIPE",
          id: "123",
          name: "Test Recipe",
          description: "Test",
          ingredientSections: [{ items: [] }],
          stepSections: [{ steps: [] }],
          cookTime: 10,
          prepTime: 5,
          servings: 2,
          tags: [],
          categories: [],
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      });

      const recipe = await getRecipe("123");
      expect(recipe).not.toBeNull();
      expect(recipe!.name).toBe("Test Recipe");
      expect(recipe!.ingredientSections).toBeDefined();
      expect(recipe!.stepSections).toBeDefined();
    });

    it("returns null when not found", async () => {
      const send = getMockSend();
      send.mockResolvedValue({ Item: undefined });

      const recipe = await getRecipe("nonexistent");
      expect(recipe).toBeNull();
    });

    it("converts legacy flat arrays into sections", async () => {
      const send = getMockSend();
      send.mockResolvedValue({
        Item: {
          PK: "RECIPE#legacy",
          SK: "RECIPE#legacy",
          entityType: "RECIPE",
          id: "legacy",
          name: "Legacy Recipe",
          description: "Has old flat format",
          ingredients: [
            { name: "flour", quantity: 2, unit: "cups" },
            { name: "sugar", quantity: 1, unit: "cup" },
          ],
          steps: ["Mix ingredients", "Bake at 350F"],
          cookTime: 30,
          prepTime: 10,
          servings: 4,
          tags: [],
          categories: [],
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      });

      const recipe = await getRecipe("legacy");
      expect(recipe).not.toBeNull();
      expect(recipe!.ingredientSections).toEqual([
        {
          items: [
            { name: "flour", quantity: 2, unit: "cups" },
            { name: "sugar", quantity: 1, unit: "cup" },
          ],
        },
      ]);
      expect(recipe!.stepSections).toEqual([
        { steps: ["Mix ingredients", "Bake at 350F"] },
      ]);
      // Old fields should not be present
      expect((recipe as unknown as Record<string, unknown>).ingredients).toBeUndefined();
      expect((recipe as unknown as Record<string, unknown>).steps).toBeUndefined();
    });
  });

  describe("listRecipes", () => {
    it("returns all recipes", async () => {
      const send = getMockSend();
      send.mockResolvedValue({
        Items: [
          {
            PK: "RECIPE#1",
            SK: "RECIPE#1",
            entityType: "RECIPE",
            id: "1",
            name: "Recipe 1",
            description: "",
            ingredientSections: [{ items: [] }],
            stepSections: [{ steps: [] }],
            cookTime: 10,
            prepTime: 5,
            servings: 2,
            tags: [],
            categories: [],
            createdAt: "2024-01-01",
            updatedAt: "2024-01-01",
          },
        ],
      });

      const recipes = await listRecipes();
      expect(recipes).toHaveLength(1);
      expect(recipes[0].name).toBe("Recipe 1");
    });
  });

  describe("deleteRecipe", () => {
    it("returns false when recipe does not exist", async () => {
      const send = getMockSend();
      send.mockResolvedValue({ Item: undefined });

      const result = await deleteRecipe("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("updateRecipe", () => {
    it("does not clobber stored fields with undefined values", async () => {
      const send = getMockSend();
      // getRecipe → existing, then Put
      send.mockResolvedValueOnce({ Item: { ...existingRecipeItem } }).mockResolvedValue({});

      await updateRecipe("r1", { description: undefined, name: "Renamed" });

      const item = lastPutItem();
      expect(item.name).toBe("Renamed");
      // description was undefined in input → preserved from existing
      expect(item.description).toBe("desc");
    });

    it("deletes enrichedStepSections when passed the null sentinel", async () => {
      const send = getMockSend();
      send.mockResolvedValueOnce({ Item: { ...existingRecipeItem } }).mockResolvedValue({});

      await updateRecipe("r1", { enrichedStepSections: null });

      const item = lastPutItem();
      expect("enrichedStepSections" in item).toBe(false);
    });

    it("sets enrichedStepSections when passed an array", async () => {
      const send = getMockSend();
      send.mockResolvedValueOnce({ Item: { ...existingRecipeItem } }).mockResolvedValue({});

      const next: EnrichedStepSection[] = [{ steps: [{ text: "new step" }] }];
      await updateRecipe("r1", { enrichedStepSections: next });

      const item = lastPutItem();
      expect(item.enrichedStepSections).toEqual(next);
    });

    it("preserves enrichedStepSections when the field is omitted", async () => {
      const send = getMockSend();
      send.mockResolvedValueOnce({ Item: { ...existingRecipeItem } }).mockResolvedValue({});

      await updateRecipe("r1", { name: "Renamed" });

      const item = lastPutItem();
      expect(item.enrichedStepSections).toEqual(existingRecipeItem.enrichedStepSections);
    });
  });
});
