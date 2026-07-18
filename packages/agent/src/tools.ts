import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import {
  listRecipes,
  getRecipe,
  getRecipesByTag,
  listTags,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  getRecentSessions,
  getSession,
  getSessionByWeek,
  createSession,
  updateSession,
  saveFeedback,
  getFeedbackForSession,
  getRecipeHistory,
  listPantryItems,
  addPantryItem,
  updatePantryItem,
  removePantryItem,
  getShoppingList,
  getActiveGroceryList,
  saveGroceryList,
  listActiveGroceryStaples,
  addGroceryStaple,
  updateGroceryStaple,
  removeGroceryStaple,
  getGroceryStapleByName,
  getPurchasePatterns,
  setPreference,
  removePreference,
  listPreferences,
  getPreferencesByType,
  setInventoryStatus,
  removeInventoryStatus,
  listInventory,
  getItemsByStatus,
  listFamilyMembers,
  addFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  listDietaryAdaptations,
  listAdaptationsForMember,
  addDietaryAdaptation,
  updateDietaryAdaptation,
  removeDietaryAdaptation,
  getSide,
  getSidesByBase,
  searchSides,
  createSide,
  updateSide,
  deleteSide,
  getSidePairingStats,
  getInlineSideFrequencies,
  listActiveIngredientSwaps,
  listIngredientSwaps,
  addIngredientSwap,
  updateIngredientSwap,
  removeIngredientSwap,
  getPlanningCandidates,
} from "@meal-planner/db";
import {
  extractRecipeFromUrl,
  normalize,
  checkDuplicates,
  applySwaps,
} from "@meal-planner/import";
import { getWeeklyAd } from "@meal-planner/heb";
import type {
  DayOfWeek,
  MealType,
  PlannedMeal,
  PlannedSide,
  CreateRecipeInput,
  PreferenceType,
  AdaptationLeniency,
  SubstitutionRule,
  SideCategory,
  SideComplexity,
} from "@meal-planner/types";

export const searchRecipes = tool(
  "search_recipes",
  "Search the recipe library by name, tag, or category. Returns condensed summaries (not full ingredients). Use for browsing and non-planning queries — during planning, use get_planning_candidates instead.",
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

    // Group by complexity so Claude can easily see the available mix
    const grouped = {
      staple: summaries.filter((r) => r.complexity === "staple"),
      standard: summaries.filter((r) => r.complexity === "standard"),
      involved: summaries.filter((r) => r.complexity === "involved"),
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(grouped, null, 2) }] };
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

export const getPlanningCandidatesTool = tool(
  "get_planning_candidates",
  "Get a pre-scored shortlist of recipe candidates for meal planning. Reads preferences, family members, recent history, and pantry data internally — returns scored candidates with full ingredient data plus a context summary. Call this instead of search_recipes during planning.",
  {
    weekOf: z.string().describe("ISO date string for the Monday of the target week (e.g. '2026-04-21')"),
  },
  async (args) => {
    const result = await getPlanningCandidates(args.weekOf);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    };
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

// --- Feedback write tools ---

export const saveFeedbackTool = tool(
  "save_feedback",
  "Record feedback for a meal that was cooked. Use when the user says things like 'we made the tikka masala last night, it was great'.",
  {
    sessionId: z.string().describe("The session ID (use get_recent_meal_plans to find it)"),
    recipeId: z.string().describe("The recipe ID"),
    wasMade: z.boolean().describe("Whether the meal was actually cooked"),
    rating: z.number().min(1).max(5).describe("Rating from 1-5"),
    comment: z.string().describe("Brief comment about the meal"),
  },
  async (args) => {
    await saveFeedback({
      sessionId: args.sessionId,
      recipeId: args.recipeId,
      wasMade: args.wasMade,
      rating: args.rating,
      comment: args.comment,
    });
    return {
      content: [{
        type: "text" as const,
        text: `Feedback saved for recipe ${args.recipeId}: ${args.rating}/5 — "${args.comment}"`,
      }],
    };
  },
);

export const getSessionFeedbackTool = tool(
  "get_session_feedback",
  "Get all feedback entries for a specific planning session.",
  {
    sessionId: z.string().describe("The session ID"),
  },
  async (args) => {
    const feedback = await getFeedbackForSession(args.sessionId);
    return { content: [{ type: "text" as const, text: JSON.stringify(feedback, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

// --- Pantry write tools ---

export const addPantryItemTool = tool(
  "add_pantry_item",
  "Add an item to the family's standard pantry list. Pantry items are things always on hand (salt, oil, flour) and get excluded from shopping lists.",
  {
    name: z.string().describe("Name of the pantry item"),
    category: z.string().describe("Category (e.g. 'spices', 'oils', 'baking', 'condiments')"),
  },
  async (args) => {
    const item = await addPantryItem({ name: args.name, category: args.category });
    return {
      content: [{ type: "text" as const, text: `Added pantry item: ${item.name} (${item.category})` }],
    };
  },
);

export const removePantryItemTool = tool(
  "remove_pantry_item",
  "Remove an item from the family's pantry list. Use when the user says they no longer keep something on hand.",
  {
    name: z.string().describe("Name of the pantry item to find and remove"),
  },
  async (args) => {
    // Find the item by name first
    const items = await listPantryItems();
    const match = items.find((i) => i.name.toLowerCase() === args.name.toLowerCase());
    if (!match) {
      return { content: [{ type: "text" as const, text: `Pantry item "${args.name}" not found` }] };
    }
    await removePantryItem(match.id);
    return { content: [{ type: "text" as const, text: `Removed pantry item: ${match.name}` }] };
  },
);

export const updatePantryItemTool = tool(
  "update_pantry_item",
  "Update an existing pantry item — rename it, change its category, add aliases, or add notes.",
  {
    name: z.string().describe("Current name of the pantry item to update"),
    newName: z.string().optional().describe("New name for the item"),
    category: z.string().optional().describe("New category"),
    aliases: z.array(z.string()).optional().describe("Alias names for fuzzy matching (e.g. 'boneless skinless chicken breast' for 'Chicken Breast')"),
    notes: z.string().optional().describe("Optional notes about the item"),
  },
  async (args) => {
    const items = await listPantryItems();
    const match = items.find((i) => i.name.toLowerCase() === args.name.toLowerCase());
    if (!match) {
      return { content: [{ type: "text" as const, text: `Pantry item "${args.name}" not found` }] };
    }
    const updates: Record<string, unknown> = {};
    if (args.newName) updates.name = args.newName;
    if (args.category) updates.category = args.category;
    if (args.aliases) updates.aliases = args.aliases;
    if (args.notes !== undefined) updates.notes = args.notes;

    const updated = await updatePantryItem(match.id, updates);
    if (!updated) {
      return { content: [{ type: "text" as const, text: `Failed to update pantry item "${args.name}"` }] };
    }
    return { content: [{ type: "text" as const, text: `Updated pantry item: ${updated.name} (${updated.category})` }] };
  },
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
        sides: z.array(z.object({
          sideId: z.string().optional().describe("Side ID from the library (omit for inline sides)"),
          sideName: z.string().describe("Display name of the side"),
          sideCategory: z.enum(["green", "starch", "grain", "bread", "legume", "salad", "other"]).describe("Category of the side"),
          complexity: z.enum(["effortless", "simple", "prepared"]).describe("Side complexity level"),
          ingredients: z.array(z.object({
            name: z.string(),
            quantity: z.number(),
            unit: z.string(),
            category: z.string().optional(),
          })).optional().describe("Ingredients for inline sides (omit for library sides)"),
          baseIngredient: z.string().optional().describe("Base ingredient grouping key (e.g. 'broccoli')"),
        })).optional().describe("0-2 sides for this meal, matching the confirmed sides. Omit for self-contained meals."),
      }),
    ).describe("The confirmed meals for the week"),
    summary: z.string().describe("Brief summary of this week's plan and reasoning"),
  },
  async (args) => {
    const existing = await getSessionByWeek(args.weekOf);

    // Preserve sides through the save path — map the presented side shape into
    // stored PlannedSide (ref when a library sideId is present, otherwise inline
    // with its ingredients).
    const meals: PlannedMeal[] = args.meals.map((m) => ({
      day: m.day as DayOfWeek,
      mealType: m.mealType as MealType,
      recipeId: m.recipeId,
      ...(m.sides
        ? {
            sides: m.sides.map((s): PlannedSide =>
              s.sideId
                ? { kind: "ref" as const, sideId: s.sideId }
                : {
                    kind: "inline" as const,
                    name: s.sideName,
                    ingredients: s.ingredients ?? [],
                    complexity: s.complexity as SideComplexity,
                    baseIngredient: s.baseIngredient,
                    sideCategory: s.sideCategory as SideCategory,
                  },
            ),
          }
        : {}),
    }));

    let session;
    if (existing) {
      session = await updateSession(existing.id, {
        meals,
        summary: args.summary,
        status: existing.status === "completed" ? "completed" : "confirmed",
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

export const getGroceryStaples = tool(
  "get_grocery_staples",
  "Get the family's configured grocery staples — items they regularly buy each week (milk, bananas, etc). Returns active staples with their frequency and style (specific vs flexible).",
  {},
  async () => {
    const staples = await listActiveGroceryStaples();
    return { content: [{ type: "text" as const, text: JSON.stringify(staples, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const manageGroceryStaple = tool(
  "manage_grocery_staple",
  "Add, update, or remove a grocery staple. Use when the user says things like 'add oat milk as a weekly staple' or 'change Cherry Coke Zero to biweekly'.",
  {
    action: z.enum(["add", "update", "remove"]).describe("What to do"),
    name: z.string().describe("Name of the staple item"),
    style: z.enum(["specific", "flexible"]).optional().describe("specific = exact item (e.g. 'Cherry Coke Zero'), flexible = category (e.g. 'Fruit for kids')"),
    category: z.string().optional().describe("Grocery category (produce, dairy, beverages, etc.)"),
    defaultQuantity: z.number().optional().describe("For specific items: default quantity"),
    defaultUnit: z.string().optional().describe("For specific items: unit (gallon, 12-pack, bunch, etc.)"),
    description: z.string().optional().describe("For flexible items: shopper guidance (e.g. 'Grab 2-3 types the kids will eat')"),
    frequency: z.enum(["weekly", "biweekly", "monthly", "as-needed"]).optional().describe("How often this item is needed"),
    notes: z.string().optional().describe("Optional context (e.g. 'for coffee', 'for the kids')"),
    isActive: z.boolean().optional().describe("Whether the staple is active"),
  },
  async (args) => {
    switch (args.action) {
      case "add": {
        const staple = await addGroceryStaple({
          name: args.name,
          style: args.style ?? "specific",
          category: args.category ?? "other",
          defaultQuantity: args.defaultQuantity,
          defaultUnit: args.defaultUnit,
          description: args.description,
          frequency: args.frequency ?? "weekly",
          notes: args.notes,
          isActive: args.isActive ?? true,
        });
        return { content: [{ type: "text" as const, text: `Added grocery staple: ${staple.name} (${staple.frequency})` }] };
      }
      case "update": {
        const existing = await getGroceryStapleByName(args.name);
        if (!existing) {
          return { content: [{ type: "text" as const, text: `Staple "${args.name}" not found` }] };
        }
        const updated = await updateGroceryStaple(existing.id, {
          style: args.style,
          category: args.category,
          defaultQuantity: args.defaultQuantity,
          defaultUnit: args.defaultUnit,
          description: args.description,
          frequency: args.frequency,
          notes: args.notes,
          isActive: args.isActive,
        });
        if (!updated) {
          return { content: [{ type: "text" as const, text: `Failed to update staple "${args.name}"` }] };
        }
        return { content: [{ type: "text" as const, text: `Updated staple: ${updated.name}` }] };
      }
      case "remove": {
        const toRemove = await getGroceryStapleByName(args.name);
        if (!toRemove) {
          return { content: [{ type: "text" as const, text: `Staple "${args.name}" not found` }] };
        }
        await removeGroceryStaple(toRemove.id);
        return { content: [{ type: "text" as const, text: `Removed staple: ${args.name}` }] };
      }
    }
  },
);

export const getPurchasePatternsTool = tool(
  "get_purchase_patterns",
  "Analyze purchase history from past shopping lists. Returns items sorted by frequency, showing which are already staples and which might be candidates for promotion. Use this to make smart suggestions during planning.",
  {
    limit: z.number().optional().describe("Number of weeks to analyze (default 8)"),
  },
  async (args) => {
    const patterns = await getPurchasePatterns(args.limit ?? 8);
    return { content: [{ type: "text" as const, text: JSON.stringify(patterns, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const getLastWeekShoppingList = tool(
  "get_last_week_shopping_list",
  "Get the shopping list from a recent session to analyze leftover/carryover ingredients. Compare recipe quantities vs purchased quantities to estimate what might still be available.",
  {
    weekOf: z.string().describe("The weekOf date to look up (ISO string, e.g. '2026-04-06')"),
  },
  async (args) => {
    const session = await getSessionByWeek(args.weekOf);
    if (!session) {
      return { content: [{ type: "text" as const, text: "No session found for that week" }] };
    }
    const list = await getShoppingList(session.id);
    if (!list) {
      return { content: [{ type: "text" as const, text: "No shopping list found for that session" }] };
    }
    // Return session meals + shopping list so the agent can compute deltas
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          weekOf: session.weekOf,
          meals: session.meals,
          extras: session.extras,
          shoppingList: list.items,
        }, null, 2),
      }],
    };
  },
  { annotations: { readOnlyHint: true } },
);

// --- Recipe write tools ---

export const createRecipeTool = tool(
  "create_recipe",
  "Create a new recipe in the database. Use when the user describes a recipe to add or when importing from text.",
  {
    name: z.string().describe("Recipe name"),
    description: z.string().describe("Brief description of the dish"),
    ingredientSections: z.array(z.object({
      header: z.string().optional().describe("Section header (e.g. 'For the Sauce'). Omit for simple recipes."),
      items: z.array(z.object({
        name: z.string(),
        quantity: z.number(),
        unit: z.string(),
        category: z.string().optional(),
      })),
    })).describe("Ingredient sections. Use one section with no header for simple recipes."),
    stepSections: z.array(z.object({
      header: z.string().optional().describe("Section header (e.g. 'Make the Sauce'). Omit for simple recipes."),
      steps: z.array(z.string()),
    })).describe("Step sections. Use one section with no header for simple recipes."),
    cookTime: z.number().describe("Cook time in minutes"),
    prepTime: z.number().describe("Prep time in minutes"),
    inactiveTime: z.number().optional().describe("Inactive time in minutes (marinating, resting, chilling)"),
    servings: z.number().describe("Number of servings"),
    yieldDescription: z.string().optional().describe("Yield description (e.g. 'makes 24 cookies')"),
    tags: z.array(z.string()).describe("Tags (e.g. 'italian', 'chicken', 'quick')"),
    categories: z.array(z.string()).describe("Meal categories (e.g. 'dinner', 'lunch')"),
    complexity: z.enum(["staple", "standard", "involved"]).describe("Recipe complexity level"),
    notes: z.array(z.string()).optional().describe("Tips, make-ahead notes, or serving suggestions"),
    equipment: z.array(z.string()).optional().describe("Required equipment (e.g. 'stand mixer', 'Dutch oven')"),
    storage: z.object({
      makeAhead: z.string().optional(),
      refrigerate: z.string().optional(),
      freeze: z.string().optional(),
    }).optional().describe("Storage and make-ahead instructions"),
    sourceUrl: z.string().optional().describe("URL where the recipe came from"),
    imageUrl: z.string().optional().describe("URL of a photo for this recipe (external URLs are fine)"),
    primaryProtein: z.string().optional().describe("Primary protein in this recipe: chicken, beef, pork, salmon, shrimp, tofu, turkey, lamb, or none"),
    cuisineType: z.string().optional().describe("Primary cuisine type: italian, mexican, asian, american, mediterranean, indian, thai, korean, japanese, greek, french, cajun, etc."),
  },
  async (args) => {
    const input: CreateRecipeInput = {
      name: args.name,
      description: args.description,
      ingredientSections: args.ingredientSections,
      stepSections: args.stepSections,
      cookTime: args.cookTime,
      prepTime: args.prepTime,
      inactiveTime: args.inactiveTime,
      servings: args.servings,
      yieldDescription: args.yieldDescription,
      tags: args.tags,
      categories: args.categories,
      complexity: args.complexity,
      notes: args.notes,
      equipment: args.equipment,
      storage: args.storage,
      sourceUrl: args.sourceUrl,
      imageUrl: args.imageUrl,
      primaryProtein: args.primaryProtein,
      cuisineType: args.cuisineType,
    };
    const recipe = await createRecipe(input);
    return {
      content: [{ type: "text" as const, text: `Created recipe: ${recipe.name} (ID: ${recipe.id})` }],
    };
  },
);

export const updateRecipeTool = tool(
  "update_recipe",
  "Update fields on an existing recipe. Use for tag changes, fixing cook times, updating ingredients, reorganizing into sections, adding notes, etc.",
  {
    recipeId: z.string().describe("The recipe ID to update"),
    name: z.string().optional().describe("New name"),
    description: z.string().optional().describe("New description"),
    ingredientSections: z.array(z.object({
      header: z.string().optional().describe("Section header (e.g. 'For the Sauce'). Omit for simple recipes."),
      items: z.array(z.object({
        name: z.string(),
        quantity: z.number(),
        unit: z.string(),
        category: z.string().optional(),
      })),
    })).optional().describe("Full replacement ingredient sections"),
    stepSections: z.array(z.object({
      header: z.string().optional().describe("Section header. Omit for simple recipes."),
      steps: z.array(z.string()),
    })).optional().describe("Full replacement step sections"),
    cookTime: z.number().optional().describe("Cook time in minutes"),
    prepTime: z.number().optional().describe("Prep time in minutes"),
    inactiveTime: z.number().optional().describe("Inactive time in minutes (marinating, resting, chilling)"),
    servings: z.number().optional().describe("Number of servings"),
    yieldDescription: z.string().optional().describe("Yield description (e.g. 'makes 24 cookies')"),
    tags: z.array(z.string()).optional().describe("Full replacement tag list"),
    categories: z.array(z.string()).optional().describe("Full replacement category list"),
    complexity: z.enum(["staple", "standard", "involved"]).optional().describe("Recipe complexity"),
    notes: z.array(z.string()).optional().describe("Tips, make-ahead notes, or serving suggestions"),
    equipment: z.array(z.string()).optional().describe("Required equipment"),
    storage: z.object({
      makeAhead: z.string().optional(),
      refrigerate: z.string().optional(),
      freeze: z.string().optional(),
    }).optional().describe("Storage and make-ahead instructions"),
    primaryProtein: z.string().optional().describe("Primary protein: chicken, beef, pork, salmon, shrimp, tofu, turkey, lamb, or none"),
    cuisineType: z.string().optional().describe("Primary cuisine type: italian, mexican, asian, american, mediterranean, indian, thai, korean, japanese, greek, french, cajun, etc."),
    imageUrl: z.string().optional().describe("URL of a photo for this recipe (external URLs are fine)"),
  },
  async (args) => {
    const { recipeId, ...updates } = args;
    // Filter out undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    );
    const recipe = await updateRecipe(recipeId, cleanUpdates);
    if (!recipe) {
      return { content: [{ type: "text" as const, text: `Recipe ${recipeId} not found` }] };
    }
    return { content: [{ type: "text" as const, text: `Updated recipe: ${recipe.name}` }] };
  },
);

export const deleteRecipeTool = tool(
  "delete_recipe",
  "Delete a recipe from the library. Use when the user wants to remove a recipe permanently.",
  {
    recipeId: z.string().describe("The recipe ID to delete"),
  },
  async (args) => {
    const deleted = await deleteRecipe(args.recipeId);
    if (!deleted) {
      return { content: [{ type: "text" as const, text: `Recipe ${args.recipeId} not found` }] };
    }
    return { content: [{ type: "text" as const, text: `Recipe deleted.` }] };
  },
);

export const listTagsTool = tool(
  "list_tags",
  "Get all tags used across the recipe library.",
  {},
  async () => {
    const tags = await listTags();
    return { content: [{ type: "text" as const, text: JSON.stringify(tags, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

// --- Shopping list tools ---

export const getShoppingListTool = tool(
  "get_shopping_list",
  "Get the shopping list for a planning session.",
  {
    sessionId: z.string().describe("The session ID"),
  },
  async (args) => {
    const list = await getShoppingList(args.sessionId);
    if (!list) {
      return { content: [{ type: "text" as const, text: "No shopping list found for this session" }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(list, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const addShoppingListItemTool = tool(
  "add_shopping_list_item",
  "Add a manual item to the current grocery list. Use when the user says 'add paper towels to the list' or 'we need sugar this week'.",
  {
    name: z.string().describe("Item name"),
    quantity: z.number().describe("Quantity"),
    unit: z.string().describe("Unit (e.g. 'bag', 'lb', 'each')"),
    category: z.string().describe("Grocery category (e.g. 'produce', 'dairy', 'household')"),
  },
  async (args) => {
    const list = await getActiveGroceryList();
    if (!list) {
      return { content: [{ type: "text" as const, text: "No active grocery list found. Save a meal plan first." }] };
    }
    const newItem = {
      id: crypto.randomUUID(),
      name: args.name,
      quantity: args.quantity,
      unit: args.unit,
      category: args.category,
      checked: false,
      sources: [{ type: "manual" as const }],
      addedAt: new Date().toISOString(),
    };
    list.items.push(newItem);
    await saveGroceryList(list);
    return { content: [{ type: "text" as const, text: `Added "${args.name}" to the grocery list` }] };
  },
);

export const removeShoppingListItemTool = tool(
  "remove_shopping_list_item",
  "Remove an item from the current grocery list by name.",
  {
    name: z.string().describe("Name of the item to remove"),
  },
  async (args) => {
    const list = await getActiveGroceryList();
    if (!list) {
      return { content: [{ type: "text" as const, text: "No active grocery list found" }] };
    }
    const idx = list.items.findIndex((i) => i.name.toLowerCase() === args.name.toLowerCase());
    if (idx === -1) {
      return { content: [{ type: "text" as const, text: `"${args.name}" not found on the grocery list` }] };
    }
    list.items.splice(idx, 1);
    await saveGroceryList(list);
    return { content: [{ type: "text" as const, text: `Removed "${args.name}" from the grocery list` }] };
  },
);

export const checkShoppingListItemTool = tool(
  "check_shopping_list_item",
  "Toggle an item's checked state on the grocery list.",
  {
    name: z.string().describe("Name of the item"),
    checked: z.boolean().describe("Whether the item is checked/bought"),
  },
  async (args) => {
    const list = await getActiveGroceryList();
    if (!list) {
      return { content: [{ type: "text" as const, text: "No active grocery list found" }] };
    }
    const item = list.items.find((i) => i.name.toLowerCase() === args.name.toLowerCase());
    if (!item) {
      return { content: [{ type: "text" as const, text: `"${args.name}" not found on the grocery list` }] };
    }
    item.checked = args.checked;
    await saveGroceryList(list);
    return {
      content: [{ type: "text" as const, text: `${args.name}: ${args.checked ? "checked" : "unchecked"}` }],
    };
  },
);

// --- Session tools ---

export const getSessionTool = tool(
  "get_session",
  "Get a specific planning session by ID or by week date.",
  {
    sessionId: z.string().optional().describe("The session ID"),
    weekOf: z.string().optional().describe("ISO date for the Monday of the week (e.g. '2026-04-13')"),
  },
  async (args) => {
    let session;
    if (args.sessionId) {
      session = await getSession(args.sessionId);
    } else if (args.weekOf) {
      session = await getSessionByWeek(args.weekOf);
    } else {
      return { content: [{ type: "text" as const, text: "Provide either sessionId or weekOf" }] };
    }
    if (!session) {
      return { content: [{ type: "text" as const, text: "Session not found" }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(session, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const updateSessionStatusTool = tool(
  "update_session_status",
  "Update a session's status (draft/confirmed/completed).",
  {
    sessionId: z.string().describe("The session ID"),
    status: z.enum(["draft", "confirmed", "completed"]).describe("New status"),
  },
  async (args) => {
    const session = await updateSession(args.sessionId, { status: args.status });
    if (!session) {
      return { content: [{ type: "text" as const, text: `Session ${args.sessionId} not found` }] };
    }
    return {
      content: [{ type: "text" as const, text: `Session ${args.sessionId} status updated to ${args.status}` }],
    };
  },
);

// --- Family Preferences tools ---

export const getPreferencesTool = tool(
  "get_preferences",
  "Get the family's preferences — dietary restrictions, likes/dislikes, cuisine affinities, schedule constraints, and temporary diets. Call this at the start of planning sessions.",
  {
    type: z.enum(["restriction", "dislike", "like", "cuisine", "schedule", "diet"]).optional()
      .describe("Filter by preference type. Omit to get all preferences."),
  },
  async (args) => {
    const prefs = args.type
      ? await getPreferencesByType(args.type)
      : await listPreferences();
    return { content: [{ type: "text" as const, text: JSON.stringify(prefs, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const setPreferenceTool = tool(
  "set_preference",
  "Add or update a family preference. Types: restriction (allergies), dislike (avoid), like (favor), cuisine (affinities), schedule (day constraints), diet (temporary programs like Whole30).",
  {
    type: z.enum(["restriction", "dislike", "like", "cuisine", "schedule", "diet"])
      .describe("Preference type"),
    key: z.string().describe("The subject (e.g., 'tree-nuts', 'cilantro', 'tuesday', 'whole30')"),
    value: z.string().describe("Details (e.g., 'daughter allergic', 'soccer night - staples only')"),
    member: z.string().optional().describe("Family member if person-specific (e.g., 'Emma')"),
    startDate: z.string().optional().describe("Start date for time-bound prefs like diets (ISO string)"),
    endDate: z.string().optional().describe("End date for time-bound prefs like diets (ISO string)"),
  },
  async (args) => {
    const pref = await setPreference({
      type: args.type as PreferenceType,
      key: args.key,
      value: args.value,
      member: args.member,
      startDate: args.startDate,
      endDate: args.endDate,
    });
    return {
      content: [{
        type: "text" as const,
        text: `Preference saved: [${pref.type}] ${pref.key} — ${pref.value}${pref.member ? ` (${pref.member})` : ""}`,
      }],
    };
  },
);

export const removePreferenceTool = tool(
  "remove_preference",
  "Remove a family preference.",
  {
    type: z.enum(["restriction", "dislike", "like", "cuisine", "schedule", "diet"])
      .describe("Preference type"),
    key: z.string().describe("The subject to remove (e.g., 'tree-nuts', 'tuesday')"),
  },
  async (args) => {
    await removePreference(args.type, args.key);
    return {
      content: [{ type: "text" as const, text: `Removed preference: [${args.type}] ${args.key}` }],
    };
  },
);

// --- Pantry Inventory tools ---

export const getInventoryTool = tool(
  "get_inventory",
  "Get current pantry inventory status — what's in stock, low, or out. Use to check restocking needs.",
  {
    status: z.enum(["in-stock", "low", "out"]).optional()
      .describe("Filter by status. Omit to get all inventory items."),
  },
  async (args) => {
    const items = args.status
      ? await getItemsByStatus(args.status)
      : await listInventory();
    return { content: [{ type: "text" as const, text: JSON.stringify(items, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const setInventoryStatusTool = tool(
  "set_inventory_status",
  "Update the stock status of an item. Use when the user says 'we're out of sugar' or 'running low on olive oil'.",
  {
    name: z.string().describe("Item name"),
    status: z.enum(["in-stock", "low", "out"]).describe("Current stock status"),
    quantity: z.string().optional().describe("Freeform quantity (e.g., 'half a bag', '2 cans')"),
    notes: z.string().optional().describe("Optional notes"),
  },
  async (args) => {
    const item = await setInventoryStatus({
      name: args.name,
      status: args.status,
      quantity: args.quantity,
      notes: args.notes,
    });
    return {
      content: [{ type: "text" as const, text: `Inventory updated: ${item.name} — ${item.status}${item.quantity ? ` (${item.quantity})` : ""}` }],
    };
  },
);

export const clearInventoryStatusTool = tool(
  "clear_inventory_status",
  "Remove an inventory status override. Returns the item to default/unknown state.",
  {
    name: z.string().describe("Item name to clear"),
  },
  async (args) => {
    await removeInventoryStatus(args.name);
    return {
      content: [{ type: "text" as const, text: `Cleared inventory status for: ${args.name}` }],
    };
  },
);

// --- Family Member tools ---

export const getFamilyMembersTool = tool(
  "get_family_members",
  "Get the list of family members. Returns names, roles, notes, and active status. Call at the start of every planning session.",
  {},
  async () => {
    const members = await listFamilyMembers();
    return { content: [{ type: "text" as const, text: JSON.stringify(members, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const manageFamilyMemberTool = tool(
  "manage_family_member",
  "Add, update, or remove a family member. Use for 'add my son Jake', 'Emma is out of town' (set isActive=false), etc.",
  {
    action: z.enum(["add", "update", "remove"]).describe("What to do"),
    name: z.string().describe("Member name"),
    role: z.string().optional().describe("Role (dad, mom, son, daughter, etc.)"),
    notes: z.string().optional().describe("Notes about the member"),
    isActive: z.boolean().optional().describe("Set false when member is temporarily away"),
  },
  async (args) => {
    switch (args.action) {
      case "add": {
        const member = await addFamilyMember({
          name: args.name,
          role: args.role,
          notes: args.notes,
          isActive: args.isActive ?? true,
        });
        return { content: [{ type: "text" as const, text: `Added family member: ${member.name} (ID: ${member.id})` }] };
      }
      case "update": {
        const members = await listFamilyMembers();
        const match = members.find((m: { name: string }) => m.name.toLowerCase() === args.name.toLowerCase());
        if (!match) {
          return { content: [{ type: "text" as const, text: `Member "${args.name}" not found` }] };
        }
        const updated = await updateFamilyMember(match.id, {
          name: args.name,
          role: args.role,
          notes: args.notes,
          isActive: args.isActive,
        });
        if (!updated) {
          return { content: [{ type: "text" as const, text: `Failed to update "${args.name}"` }] };
        }
        return { content: [{ type: "text" as const, text: `Updated member: ${updated.name}` }] };
      }
      case "remove": {
        const allMembers = await listFamilyMembers();
        const toRemove = allMembers.find((m: { name: string }) => m.name.toLowerCase() === args.name.toLowerCase());
        if (!toRemove) {
          return { content: [{ type: "text" as const, text: `Member "${args.name}" not found` }] };
        }
        await removeFamilyMember(toRemove.id);
        return { content: [{ type: "text" as const, text: `Removed member: ${args.name}` }] };
      }
    }
  },
);

// --- Dietary Adaptation tools ---

export const getDietaryAdaptationsTool = tool(
  "get_dietary_adaptations",
  "Get dietary adaptations (ingredient substitution profiles). Returns rules, leniency, and skip notes. Call at the start of planning sessions.",
  {
    memberId: z.string().optional().describe("Filter by member ID. Omit for all adaptations."),
  },
  async (args) => {
    const adaptations = args.memberId
      ? await listAdaptationsForMember(args.memberId)
      : await listDietaryAdaptations();
    return { content: [{ type: "text" as const, text: JSON.stringify(adaptations, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const manageDietaryAdaptationTool = tool(
  "manage_dietary_adaptation",
  "Add, update, or remove a dietary adaptation. Adaptations define ingredient swaps (e.g., milk -> LF milk) with leniency settings for a family member.",
  {
    action: z.enum(["add", "update", "remove"]).describe("What to do"),
    id: z.string().optional().describe("Adaptation ID (required for update/remove)"),
    memberId: z.string().optional().describe("Member ID (required for add)"),
    name: z.string().optional().describe("Adaptation name (e.g., 'Lactose Intolerance')"),
    description: z.string().optional(),
    leniency: z.enum(["always", "when-easy", "gentle-reminder"]).optional()
      .describe("How aggressively to apply: always (adapt all), when-easy (adapt if all swaps are exact), gentle-reminder (just annotate)"),
    skipNote: z.string().optional().describe("What to do when not adapting (e.g., 'Take Lactaid pill')"),
    rules: z.array(z.object({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      quality: z.enum(["exact", "approximate"]),
      condition: z.string().optional(),
    })).optional().describe("Full replacement list of substitution rules"),
    isActive: z.boolean().optional(),
  },
  async (args) => {
    switch (args.action) {
      case "add": {
        if (!args.memberId || !args.name) {
          return { content: [{ type: "text" as const, text: "memberId and name are required for add" }] };
        }
        const adaptation = await addDietaryAdaptation({
          memberId: args.memberId,
          name: args.name,
          description: args.description,
          leniency: (args.leniency ?? "when-easy") as AdaptationLeniency,
          skipNote: args.skipNote,
          rules: (args.rules ?? []) as SubstitutionRule[],
          isActive: args.isActive ?? true,
        });
        return { content: [{ type: "text" as const, text: `Created adaptation: ${adaptation.name} (ID: ${adaptation.id})` }] };
      }
      case "update": {
        if (!args.id) {
          return { content: [{ type: "text" as const, text: "id is required for update" }] };
        }
        const updated = await updateDietaryAdaptation(args.id, {
          name: args.name,
          description: args.description,
          leniency: args.leniency as AdaptationLeniency | undefined,
          skipNote: args.skipNote,
          rules: args.rules as SubstitutionRule[] | undefined,
          isActive: args.isActive,
        });
        if (!updated) {
          return { content: [{ type: "text" as const, text: `Adaptation ${args.id} not found` }] };
        }
        return { content: [{ type: "text" as const, text: `Updated adaptation: ${updated.name}` }] };
      }
      case "remove": {
        if (!args.id) {
          return { content: [{ type: "text" as const, text: "id is required for remove" }] };
        }
        await removeDietaryAdaptation(args.id);
        return { content: [{ type: "text" as const, text: "Adaptation removed" }] };
      }
    }
  },
);

// --- Recipe import tool ---

export const importRecipeFromUrlTool = tool(
  "import_recipe_from_url",
  "Import a recipe from a website URL. Extracts, normalizes, checks for duplicates, and saves to the database. Use when the user shares a recipe link.",
  {
    url: z.string().describe("The recipe URL to import"),
  },
  async (args) => {
    try {
      const { extraction } = await extractRecipeFromUrl(args.url);
      const normalized = normalize(extraction.recipe as Record<string, unknown>);
      if (!normalized.success) {
        return { content: [{ type: "text" as const, text: `Failed to normalize recipe: ${normalized.errors.join(", ")}` }] };
      }

      const dupes = await checkDuplicates(normalized.data.name, args.url);
      if (dupes.length > 0) {
        const dupeInfo = dupes.map((d) => `${d.type}: "${d.existingRecipe.name}" (${d.similarity ? Math.round(d.similarity * 100) + "% match" : "exact URL"})`).join("; ");
        return { content: [{ type: "text" as const, text: `Possible duplicates found: ${dupeInfo}. Recipe extracted but NOT saved. Use create_recipe to save it manually if desired.\n\nExtracted: ${JSON.stringify(normalized.data, null, 2)}` }] };
      }

      // Apply active ingredient swaps before saving
      const activeSwaps = await listActiveIngredientSwaps();
      const { recipe: swappedData, applied: swapResults } = applySwaps(
        normalized.data,
        activeSwaps.map((s) => ({ from: s.from, to: s.to })),
      );

      const recipe = await createRecipe({ ...swappedData, sourceUrl: args.url });
      const ingCount = recipe.ingredientSections.reduce((n: number, s: { items: unknown[] }) => n + s.items.length, 0);
      const stepCount = recipe.stepSections.reduce((n: number, s: { steps: unknown[] }) => n + s.steps.length, 0);
      const swapNote = swapResults.length > 0
        ? `\nAuto swaps applied: ${swapResults.map((s) => `${s.originalName} → ${s.newName}`).join(", ")}`
        : "";
      return { content: [{ type: "text" as const, text: `Imported recipe: ${recipe.name} (ID: ${recipe.id})\nComplexity: ${recipe.complexity}, ${ingCount} ingredients, ${stepCount} steps${swapNote}` }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Failed to import from URL: ${String(err)}` }] };
    }
  },
);

// --- Active grocery list tool ---

export const getActiveGroceryListTool = tool(
  "get_active_grocery_list",
  "Get the current active grocery list — the persistent merged list used for shopping. Shows all items with their sources, checked status, and HEB pricing.",
  {},
  async () => {
    const list = await getActiveGroceryList();
    if (!list) {
      return { content: [{ type: "text" as const, text: "No active grocery list. Save a meal plan and merge it first." }] };
    }
    const summary = {
      totalItems: list.items.length,
      unchecked: list.items.filter((i: { checked: boolean }) => !i.checked).length,
      checked: list.items.filter((i: { checked: boolean }) => i.checked).length,
      items: list.items,
    };
    return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

// --- HEB weekly ad tool ---

export const getWeeklyAdTool = tool(
  "get_weekly_ad",
  "Get the current H-E-B weekly ad deals. Use to suggest meals around items on sale.",
  {
    postalCode: z.string().optional().describe("ZIP code (defaults to 78704)"),
  },
  async (args) => {
    try {
      const data = await getWeeklyAd(args.postalCode ?? "78704");
      if (!data) {
        return { content: [{ type: "text" as const, text: "Could not fetch weekly ad" }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Failed to fetch weekly ad: ${String(err)}` }] };
    }
  },
  { annotations: { readOnlyHint: true } },
);

// --- Side tools ---

export const listSidesTool = tool(
  "list_sides",
  "Search and filter the sides library. Returns all sides or filtered by category, complexity, tag, or name search.",
  {
    category: z.enum(["green", "starch", "grain", "bread", "legume", "salad", "other"]).optional().describe("Filter by side category"),
    complexity: z.enum(["effortless", "simple", "prepared"]).optional().describe("Filter by complexity"),
    tag: z.string().optional().describe("Filter by tag (e.g. 'kid-friendly', 'asian')"),
    query: z.string().optional().describe("Text search in name, base ingredient, or prep style"),
  },
  async (args) => {
    const sides = await searchSides({
      category: args.category as SideCategory | undefined,
      complexity: args.complexity as SideComplexity | undefined,
      tags: args.tag ? [args.tag] : undefined,
      query: args.query,
    });

    const grouped: Record<string, typeof sides> = {};
    for (const side of sides) {
      const cat = side.sideCategory;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(side);
    }

    return { content: [{ type: "text" as const, text: JSON.stringify(grouped, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const getSideTool = tool(
  "get_side",
  "Get full details for a side by ID.",
  {
    sideId: z.string().describe("The side ID"),
  },
  async (args) => {
    const side = await getSide(args.sideId);
    if (!side) {
      return { content: [{ type: "text" as const, text: "Side not found" }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(side, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const getSidesByBaseTool = tool(
  "get_sides_by_base",
  "Get all variations of a side by base ingredient (e.g. all 'broccoli' preps).",
  {
    baseIngredient: z.string().describe("Base ingredient to search for (e.g. 'broccoli', 'rice')"),
  },
  async (args) => {
    const sides = await getSidesByBase(args.baseIngredient);
    return { content: [{ type: "text" as const, text: JSON.stringify(sides, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const manageSideTool = tool(
  "manage_side",
  "Create, update, or delete a side in the library. Use this to manage the curated sides library or to promote frequently-used inline sides.",
  {
    action: z.enum(["create", "update", "delete"]).describe("Action to perform"),
    sideId: z.string().optional().describe("Side ID (required for update/delete)"),
    name: z.string().optional().describe("Side name (required for create)"),
    baseIngredient: z.string().optional().describe("Base ingredient grouping key (required for create)"),
    prepStyle: z.string().optional().describe("Preparation style (e.g. 'steamed', 'roasted')"),
    complexity: z.enum(["effortless", "simple", "prepared"]).optional().describe("Complexity level (required for create)"),
    ingredients: z.array(z.object({
      name: z.string(),
      quantity: z.number(),
      unit: z.string(),
      category: z.string().optional(),
      optional: z.boolean().optional(),
    })).optional().describe("Ingredient list (required for create)"),
    prepTime: z.number().optional().describe("Prep time in minutes"),
    cookTime: z.number().optional().describe("Cook time in minutes"),
    servings: z.number().optional().describe("Number of servings"),
    tags: z.array(z.string()).optional().describe("Tags for filtering"),
    sideCategory: z.enum(["green", "starch", "grain", "bread", "legume", "salad", "other"]).optional().describe("Category (required for create)"),
    pairingHints: z.array(z.string()).optional().describe("Cuisine/protein pairing hints"),
    prepNotes: z.string().optional().describe("Brief prep instructions"),
  },
  async (args) => {
    switch (args.action) {
      case "create": {
        if (!args.name || !args.baseIngredient || !args.complexity || !args.ingredients || !args.sideCategory) {
          return { content: [{ type: "text" as const, text: "Missing required fields: name, baseIngredient, complexity, ingredients, sideCategory" }] };
        }
        const side = await createSide({
          name: args.name,
          baseIngredient: args.baseIngredient,
          prepStyle: args.prepStyle,
          complexity: args.complexity as SideComplexity,
          ingredients: args.ingredients,
          prepTime: args.prepTime,
          cookTime: args.cookTime,
          servings: args.servings,
          tags: args.tags ?? [],
          sideCategory: args.sideCategory as SideCategory,
          pairingHints: args.pairingHints,
          prepNotes: args.prepNotes,
        });
        return { content: [{ type: "text" as const, text: `Created side: ${side.name} (${side.id})` }] };
      }
      case "update": {
        if (!args.sideId) {
          return { content: [{ type: "text" as const, text: "Missing sideId for update" }] };
        }
        const updates: Record<string, unknown> = {};
        if (args.name) updates.name = args.name;
        if (args.baseIngredient) updates.baseIngredient = args.baseIngredient;
        if (args.prepStyle !== undefined) updates.prepStyle = args.prepStyle;
        if (args.complexity) updates.complexity = args.complexity;
        if (args.ingredients) updates.ingredients = args.ingredients;
        if (args.prepTime !== undefined) updates.prepTime = args.prepTime;
        if (args.cookTime !== undefined) updates.cookTime = args.cookTime;
        if (args.servings !== undefined) updates.servings = args.servings;
        if (args.tags) updates.tags = args.tags;
        if (args.sideCategory) updates.sideCategory = args.sideCategory;
        if (args.pairingHints) updates.pairingHints = args.pairingHints;
        if (args.prepNotes !== undefined) updates.prepNotes = args.prepNotes;
        const updated = await updateSide(args.sideId, updates);
        if (!updated) {
          return { content: [{ type: "text" as const, text: `Side ${args.sideId} not found` }] };
        }
        return { content: [{ type: "text" as const, text: `Updated side: ${updated.name}` }] };
      }
      case "delete": {
        if (!args.sideId) {
          return { content: [{ type: "text" as const, text: "Missing sideId for delete" }] };
        }
        const deleted = await deleteSide(args.sideId);
        if (!deleted) {
          return { content: [{ type: "text" as const, text: `Side ${args.sideId} not found` }] };
        }
        return { content: [{ type: "text" as const, text: `Deleted side ${args.sideId}` }] };
      }
    }
  },
);

export const getSidePairingsTool = tool(
  "get_side_pairings",
  "Get side-meal pairing statistics derived from historical sessions. Shows which sides are most commonly paired with which recipes, helping make smarter side recommendations.",
  {
    sessionsBack: z.number().optional().describe("Number of recent sessions to analyze (default 12)"),
  },
  async (args) => {
    const stats = await getSidePairingStats(args.sessionsBack);
    return { content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const getInlineSideFrequenciesTool = tool(
  "get_inline_side_frequencies",
  "Find inline (non-library) sides that have been used 3+ times. Use during planning to suggest promoting frequently-used inline sides to the curated library.",
  {
    sessionsBack: z.number().optional().describe("Number of recent sessions to analyze (default 12)"),
  },
  async (args) => {
    const frequencies = await getInlineSideFrequencies(args.sessionsBack);
    if (frequencies.length === 0) {
      return { content: [{ type: "text" as const, text: "No frequently-used inline sides found." }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(frequencies, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

// --- Ingredient Swap tools ---

export const getIngredientSwapsTool = tool(
  "get_ingredient_swaps",
  "Get the family's configured auto swaps — ingredient replacements applied automatically during planning (e.g. shallots -> onion). These are convenience preferences, not dietary.",
  {},
  async () => {
    const swaps = await listActiveIngredientSwaps();
    return { content: [{ type: "text" as const, text: JSON.stringify(swaps, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } },
);

export const manageIngredientSwapTool = tool(
  "manage_ingredient_swap",
  "Add, update, or remove an ingredient auto swap. Use when the user says 'always use onion instead of shallots' or 'stop swapping ghee'.",
  {
    action: z.enum(["add", "update", "remove"]).describe("What to do"),
    id: z.string().optional().describe("Swap ID (required for update/remove)"),
    from: z.string().optional().describe("Original ingredient to match (required for add)"),
    to: z.string().optional().describe("Replacement ingredient (required for add)"),
    category: z.string().optional().describe("Category (produce, dairy, pantry, meat, spices, other)"),
    reason: z.string().optional().describe("Why this swap exists (e.g. 'overpriced', 'hard to find')"),
    isActive: z.boolean().optional().describe("Whether the swap is active"),
  },
  async (args) => {
    switch (args.action) {
      case "add": {
        if (!args.from || !args.to) {
          return { content: [{ type: "text" as const, text: "'from' and 'to' are required for add" }] };
        }
        const swap = await addIngredientSwap({
          from: args.from,
          to: args.to,
          category: args.category ?? "other",
          reason: args.reason,
          isActive: args.isActive ?? true,
        });
        return { content: [{ type: "text" as const, text: `Added auto swap: ${swap.from} → ${swap.to}` }] };
      }
      case "update": {
        if (!args.id) {
          return { content: [{ type: "text" as const, text: "id is required for update" }] };
        }
        const updated = await updateIngredientSwap(args.id, {
          from: args.from,
          to: args.to,
          category: args.category,
          reason: args.reason,
          isActive: args.isActive,
        });
        if (!updated) {
          return { content: [{ type: "text" as const, text: `Swap ${args.id} not found` }] };
        }
        return { content: [{ type: "text" as const, text: `Updated swap: ${updated.from} → ${updated.to}` }] };
      }
      case "remove": {
        if (!args.id) {
          // Try to find by "from" name
          const all = await listIngredientSwaps();
          const match = all.find((s) => s.from.toLowerCase() === (args.from ?? "").toLowerCase());
          if (!match) {
            return { content: [{ type: "text" as const, text: `Swap not found. Provide an id or a 'from' name.` }] };
          }
          await removeIngredientSwap(match.id);
          return { content: [{ type: "text" as const, text: `Removed swap: ${match.from} → ${match.to}` }] };
        }
        await removeIngredientSwap(args.id);
        return { content: [{ type: "text" as const, text: "Swap removed" }] };
      }
    }
  },
);

// --- Wizard present tools (collaborative planning wizard) ---
//
// These three no-op present tools each return a short static string, and
// packages/agent/session.ts intercepts the tool call to forward its input as a
// StreamEvent. The inferred payload types below are re-exported from the package
// index and consumed by the wizard UI.
//
// Shapes are FROZEN per scratchpad/phase1-shared-contracts.md §4. Note that the
// roundout suggestion enum below intentionally includes "pantry-promotion".

const wizardIngredientSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  category: z.string().optional(),
});

// -- present_meal_options (PHASE:OPTIONS) --

const optionAnnotationSchema = z.object({
  recipeId: z.string().describe("Recipe ID from the current grid this note is layered onto"),
  note: z.string().describe("One-line why/insight for this card — history, variety, deals, family fit"),
});

const mealOptionsShape = {
  annotations: z
    .array(optionAnnotationSchema)
    .optional()
    .describe("AI notes layered onto the existing grid, one per recipe card"),
  reorderedRecipeIds: z
    .array(z.string())
    .optional()
    .describe("Full replacement ranking — include ONLY when the user asked to re-rank or filter the grid"),
  addOptions: z
    .array(
      z.object({
        recipeId: z.string(),
        recipeName: z.string(),
        complexity: z.string(),
        reasoning: z.string(),
      }),
    )
    .optional()
    .describe("Recipes outside the current grid to surface. Must never contain a restricted ingredient. Only real recipe IDs."),
  message: z.string().optional().describe("One-liner for the chat bubble"),
};
export const mealOptionsPayloadSchema = z.object(mealOptionsShape);

export type OptionAnnotation = z.infer<typeof optionAnnotationSchema>;
export type MealOptionsPayload = z.infer<typeof mealOptionsPayloadSchema>;

export const presentMealOptions = tool(
  "present_meal_options",
  "PHASE:OPTIONS — refine the recipe options grid. Use this to annotate cards with one-line insights, re-rank the grid (reorderedRecipeIds), and/or surface additional library recipes (addOptions). Respond to every PHASE:OPTIONS message with this tool, never markdown. Never surface a recipe containing a restricted ingredient.",
  mealOptionsShape,
  async () => {
    return { content: [{ type: "text" as const, text: "Meal options presented to user." }] };
  },
);

// -- present_plan_draft (PHASE:DRAFT) --

const wizardAdaptationSchema = z.object({
  adaptationName: z.string().describe("e.g. 'Lactose Intolerance'"),
  memberName: z.string().describe("e.g. 'Nick'"),
  applied: z.boolean().describe("Whether the adaptation is applied to this meal"),
  swaps: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        quality: z.enum(["exact", "approximate"]),
      }),
    )
    .optional()
    .describe("Specific swaps being made (when applied=true)"),
  skipReason: z.string().optional().describe("Why not adapting (when applied=false)"),
  skipNote: z.string().optional().describe("What to do instead (e.g. 'Take Lactaid pill')"),
});

const draftSideSuggestionSchema = z.object({
  sideId: z.string().optional().describe("Side ID from the library (omit for inline sides)"),
  sideName: z.string().describe("Display name of the side"),
  sideCategory: z.string().describe("Category: green, starch, grain, bread, legume, salad, or other"),
  complexity: z.string().describe("Side complexity: effortless, simple, or prepared"),
  reasoning: z.string().optional().describe("Why this side pairs well with the main"),
  ingredients: z
    .array(wizardIngredientSchema)
    .optional()
    .describe("Full ingredient list — REQUIRED for inline sides (no sideId), omit for library sides"),
  baseIngredient: z.string().optional().describe("Base ingredient grouping key (e.g. 'broccoli')"),
  preAccepted: z
    .boolean()
    .describe("Strong pairing → true (starts accepted); weak/optional → false (starts declined)"),
});

const draftMealProposalSchema = z.object({
  day: z.string().describe("Proposed day, lowercase (monday..sunday)"),
  mealType: z.string().describe("Meal type, lowercase (dinner, lunch, breakfast) — defaults to dinner"),
  recipeId: z.string().describe("Recipe ID from the database — never invent one"),
  recipeName: z.string(),
  complexity: z.string().describe("Must match the recipe's actual complexity from the database"),
  dayReasoning: z.string().describe("One-line reason for the day assignment, e.g. 'Involved recipe → Saturday'"),
  adaptations: z
    .array(wizardAdaptationSchema)
    .optional()
    .describe("Per-meal dietary adaptation decisions (applied flag = proposed decision)"),
  suggestedSides: z
    .array(draftSideSuggestionSchema)
    .describe("0-2 sides for this meal. Pass an empty array for complete-on-their-own meals."),
  completenessNote: z
    .string()
    .optional()
    .describe("e.g. 'complete on its own' or 'needs a starch'"),
});

const planDraftShape = {
  meals: z
    .array(draftMealProposalSchema)
    .describe("Each selected meal scheduled to a day, with sides and adaptations"),
};
export const planDraftPayloadSchema = z.object(planDraftShape);

export type DraftSideSuggestion = z.infer<typeof draftSideSuggestionSchema>;
export type DraftMealProposal = z.infer<typeof draftMealProposalSchema>;
export type PlanDraftPayload = z.infer<typeof planDraftPayloadSchema>;

export const presentPlanDraft = tool(
  "present_plan_draft",
  "PHASE:DRAFT — schedule the user's selected meals. Assign each a day with a one-line dayReasoning (involved → weekend/lighter days, no same-protein back-to-back, balance cook time), propose 0-2 sides per meal (preAccepted for strong pairings), and record per-meal dietary adaptation decisions. Respond to every PHASE:DRAFT message with this tool, never markdown.",
  planDraftShape,
  async () => {
    return { content: [{ type: "text" as const, text: "Plan draft presented to user." }] };
  },
);

// -- present_week_roundout (PHASE:ROUNDOUT) --

const wizardStapleSchema = z.object({
  name: z.string(),
  style: z.enum(["specific", "flexible"]),
  category: z.string(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  description: z.string().optional(),
  frequency: z.enum(["weekly", "biweekly", "monthly", "as-needed"]),
});

const wizardCarryoverSchema = z.object({
  name: z.string(),
  estimatedQuantity: z.number(),
  unit: z.string(),
  source: z.object({
    weekOf: z.string(),
    recipeName: z.string(),
    purchasedQuantity: z.number(),
    usedQuantity: z.number(),
  }),
  neededFor: z.object({
    day: z.string(),
    recipeName: z.string(),
    requiredQuantity: z.number(),
  }),
  status: z.enum(["confirmed", "need"]).optional().describe("Resolution is done in the UI — usually omit"),
});

const wizardSuggestionSchema = z.object({
  id: z.string(),
  // The roundout suggestion enum includes "pantry-promotion" (contract §4
  // requires it).
  type: z.enum([
    "deal-meal",
    "recurring-item",
    "pattern-detected",
    "smart-promotion",
    "pantry-promotion",
  ]),
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  item: wizardStapleSchema.optional().describe("For item-type suggestions, the staple item details"),
});

const wizardExtraSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  ingredients: z.array(wizardIngredientSchema),
});

const weekRoundoutShape = {
  groceryStaples: z
    .array(wizardStapleSchema)
    .describe("Deterministic staples-due list, included AS-IS. Flexible staples pass through untouched — never expand them into products."),
  carryoverItems: z
    .array(wizardCarryoverSchema)
    .describe("Leftover ingredients from a prior week that this week's meals need. Every assumption must be visible."),
  suggestions: z
    .array(wizardSuggestionSchema)
    .describe("Non-plan recommendations: recurring-item, pattern-detected, smart-promotion, pantry-promotion, deal-meal"),
  extras: z
    .array(wizardExtraSchema)
    .optional()
    .describe("Only when the user asked for extras via chat"),
};
export const weekRoundoutPayloadSchema = z.object(weekRoundoutShape);

export type WeekRoundoutPayload = z.infer<typeof weekRoundoutPayloadSchema>;

export const presentWeekRoundout = tool(
  "present_week_roundout",
  "PHASE:ROUNDOUT — round out the shopping list. Pass the deterministic staples-due list through as-is in groceryStaples, add analyzed carryoverItems, and surface non-plan suggestions (deal-meal / recurring-item / pattern-detected / smart-promotion / pantry-promotion). Include extras only when the user asked. Respond to every PHASE:ROUNDOUT message with this tool, never markdown.",
  weekRoundoutShape,
  async () => {
    return { content: [{ type: "text" as const, text: "Week roundout presented to user." }] };
  },
);

export const allTools = [
  // Read tools — planning
  getPlanningCandidatesTool,
  // Read tools — browsing & history
  searchRecipes,
  getRecipeDetails,
  getRecentMealPlans,
  getRecipeHistoryTool,
  getPantryItems,
  getGroceryStaples,
  getPurchasePatternsTool,
  getLastWeekShoppingList,
  getSessionFeedbackTool,
  listTagsTool,
  getShoppingListTool,
  getSessionTool,
  // Write tools
  saveMealPlan,
  manageGroceryStaple,
  saveFeedbackTool,
  addPantryItemTool,
  updatePantryItemTool,
  removePantryItemTool,
  createRecipeTool,
  updateRecipeTool,
  deleteRecipeTool,
  addShoppingListItemTool,
  removeShoppingListItemTool,
  checkShoppingListItemTool,
  updateSessionStatusTool,
  // Preferences
  getPreferencesTool,
  setPreferenceTool,
  removePreferenceTool,
  // Inventory
  getInventoryTool,
  setInventoryStatusTool,
  clearInventoryStatusTool,
  // Family Members
  getFamilyMembersTool,
  manageFamilyMemberTool,
  // Dietary Adaptations
  getDietaryAdaptationsTool,
  manageDietaryAdaptationTool,
  // Import + Grocery + HEB
  importRecipeFromUrlTool,
  getActiveGroceryListTool,
  getWeeklyAdTool,
  // Ingredient Swaps
  getIngredientSwapsTool,
  manageIngredientSwapTool,
  // Sides
  listSidesTool,
  getSideTool,
  getSidesByBaseTool,
  manageSideTool,
  getSidePairingsTool,
  getInlineSideFrequenciesTool,
  // Wizard present tools (mode: "wizard")
  presentMealOptions,
  presentPlanDraft,
  presentWeekRoundout,
];
