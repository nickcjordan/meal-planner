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

import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createRecipe, getRecipe, listRecipes, deleteRecipe } from "./recipes.js";
import type { CreateRecipeInput } from "@meal-planner/types";

function getMockSend() {
  const client = DynamoDBDocumentClient.from({} as never);
  return client.send as ReturnType<typeof vi.fn>;
}

const sampleInput: CreateRecipeInput = {
  name: "Chicken Tikka Masala",
  description: "Classic Indian curry",
  ingredients: [
    { name: "chicken breast", quantity: 2, unit: "lbs" },
    { name: "tikka masala sauce", quantity: 1, unit: "jar" },
  ],
  steps: ["Cook chicken", "Add sauce", "Simmer 20 minutes"],
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
          ingredients: [],
          steps: [],
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
    });

    it("returns null when not found", async () => {
      const send = getMockSend();
      send.mockResolvedValue({ Item: undefined });

      const recipe = await getRecipe("nonexistent");
      expect(recipe).toBeNull();
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
            ingredients: [],
            steps: [],
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
});
