import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import {
  listRecipes,
  getRecipe,
  getRecipesByTag,
  getRecentSessions,
  getFeedbackForSession,
  getRecipeHistory,
  listPantryItems,
  getSessionByWeek,
  createSession,
  updateSession,
} from "@meal-planner/db";
import type { DayOfWeek, MealType } from "@meal-planner/types";

export const searchRecipes = tool(
  "search_recipes",
  "Search the recipe library by name, tag, or category. Returns condensed summaries (not full ingredients).",
  {
    query: z.string().optional().describe("Text to search in recipe names and descriptions"),
    tag: z.string().optional().describe("Filter by tag (e.g. 'italian', 'quick', 'chicken')"),
    category: z.string().optional().describe("Filter by category (e.g. 'dinner', 'lunch')"),
  },
  async (args) => {
    let recipes = args.tag ? await getRecipesByTag(args.tag) : await listRecipes();

    if (args.query) {
      const q = args.query.toLowerCase();
      recipes = recipes.filter(
        (r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
      );
    }

    if (args.category) {
      recipes = recipes.filter((r) => r.categories.includes(args.category!));
    }

    const summaries = recipes.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      tags: r.tags,
      complexity: r.complexity ?? "standard",
      totalTime: r.prepTime + r.cookTime,
      servings: r.servings,
    }));

    return { content: [{ type: "text" as const, text: JSON.stringify(summaries, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const getRecipeDetails = tool(
  "get_recipe_details",
  "Get full details for a recipe including ingredients and steps. Use when you need ingredient details for overlap analysis.",
  {
    recipeId: z.string().describe("The recipe ID"),
  },
  async (args) => {
    const recipe = await getRecipe(args.recipeId);
    if (!recipe) {
      return { content: [{ type: "text" as const, text: "Recipe not found" }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(recipe, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const getRecentMealPlans = tool(
  "get_recent_meal_plans",
  "Get recent weekly meal plans with their feedback/ratings. Use this to understand what was recently cooked and how it was rated.",
  {
    limit: z.number().optional().describe("Number of recent weeks to fetch (default 4)"),
  },
  async (args) => {
    const sessions = await getRecentSessions(args.limit ?? 4);

    const results = await Promise.all(
      sessions.map(async (session) => {
        const feedback = await getFeedbackForSession(session.id);
        return {
          weekOf: session.weekOf,
          status: session.status,
          meals: session.meals,
          feedback: feedback.map((f) => ({
            recipeId: f.recipeId,
            wasMade: f.wasMade,
            rating: f.rating,
            comment: f.comment,
          })),
        };
      }),
    );

    return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const getRecipeHistoryTool = tool(
  "get_recipe_history",
  "Get the cooking history for a specific recipe — when it was last made and how it was rated.",
  {
    recipeId: z.string().describe("The recipe ID"),
    limit: z.number().optional().describe("Number of history entries (default 10)"),
  },
  async (args) => {
    const history = await getRecipeHistory(args.recipeId, args.limit ?? 10);
    return { content: [{ type: "text" as const, text: JSON.stringify(history, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const getPantryItems = tool(
  "get_pantry_items",
  "Get the list of standard pantry items the family always has on hand.",
  {},
  async () => {
    const items = await listPantryItems();
    return { content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const saveMealPlan = tool(
  "save_meal_plan",
  "Save the confirmed meal plan for the week. ONLY call this when the user has explicitly confirmed they are happy with the plan.",
  {
    weekOf: z.string().describe("ISO date string for the Monday of the target week (e.g. '2026-04-13')"),
    meals: z.array(
      z.object({
        day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
        mealType: z.enum(["dinner", "lunch", "breakfast"]),
        recipeId: z.string(),
      }),
    ).describe("The confirmed meals for the week"),
    summary: z.string().describe("Brief summary of this week's plan and reasoning"),
  },
  async (args) => {
    const existing = await getSessionByWeek(args.weekOf);

    const meals = args.meals.map((m) => ({
      day: m.day as DayOfWeek,
      mealType: m.mealType as MealType,
      recipeId: m.recipeId,
    }));

    let session;
    if (existing) {
      session = await updateSession(existing.id, {
        meals,
        summary: args.summary,
        status: "confirmed",
      });
    } else {
      session = await createSession({
        weekOf: args.weekOf,
        status: "confirmed",
        meals,
        summary: args.summary,
      });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Meal plan saved for week of ${args.weekOf}. Session ID: ${session!.id}`,
        },
      ],
    };
  },
);

export const presentMealPlan = tool(
  "present_meal_plan",
  "Present a proposed meal plan to the user in a structured format. Call this tool EVERY TIME you suggest or revise a weekly meal plan, instead of writing it as markdown text. The user will see this as a visual card layout. ALL analysis (protein rotation, cuisine variety, time balance, shopping strategy) MUST go in the strategy array, NOT in the chat message.",
  {
    meals: z.array(
      z.object({
        day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
        mealType: z.enum(["dinner", "lunch", "breakfast"]),
        recipeId: z.string().describe("The recipe ID from the database"),
        recipeName: z.string().describe("The recipe name for display"),
        complexity: z.enum(["staple", "standard", "involved"]).describe("The recipe's complexity level"),
        reasoning: z.string().describe("Brief reason for this choice (e.g. 'Quick weeknight meal, pairs well with Tuesday's leftovers')"),
      }),
    ).describe("The proposed meals for the week"),
    strategy: z.array(
      z.object({
        label: z.string().describe("Short label (e.g. 'Protein Rotation', 'Cuisine Variety', 'Time Balance', 'Shopping Win')"),
        detail: z.string().describe("The analysis detail (e.g. 'Beef → Salmon → Chicken → Shrimp → Beef → Pasta → Chicken')"),
      }),
    ).optional().describe("Plan analysis and strategy details — protein rotation, cuisine variety, time balance, shopping wins. Put ALL analysis here, not in the chat."),
    extras: z.array(
      z.object({
        name: z.string().describe("Name of the extra item (e.g. 'Homemade Chocolate Cake', 'Veggie Tray')"),
        description: z.string().optional().describe("Brief description"),
        ingredients: z.array(
          z.object({
            name: z.string(),
            quantity: z.number(),
            unit: z.string(),
            category: z.string().optional(),
          }),
        ).describe("Ingredients needed for this extra"),
      }),
    ).optional().describe("Extra items not tied to a specific meal — desserts, snacks, baking projects, beverages, etc. Use your general recipe knowledge to generate full ingredient lists for these. They do NOT need to be in the recipe database."),
    shoppingHighlights: z.array(z.string()).optional().describe("Notable ingredient overlaps or shopping efficiencies"),
    unusedRecipes: z.array(z.string()).optional().describe("Recipe names not used this week that are good swap candidates"),
  },
  async () => {
    return {
      content: [{ type: "text" as const, text: "Meal plan presented to user." }],
    };
  },
);

export const allTools = [
  searchRecipes,
  getRecipeDetails,
  getRecentMealPlans,
  getRecipeHistoryTool,
  getPantryItems,
  saveMealPlan,
  presentMealPlan,
];
