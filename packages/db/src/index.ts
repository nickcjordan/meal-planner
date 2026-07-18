export {
  getDocClient,
  TABLE_NAME,
  GSI1_NAME,
  GSI2_NAME,
  scanAll,
  queryAll,
  stripUndefined,
} from "./client.js";
export { createTableIfNotExists } from "./table.js";

export {
  createRecipe,
  getRecipe,
  getRecipesBatch,
  updateRecipe,
  deleteRecipe,
  listRecipes,
  getRecipesByTag,
  listTags,
  findRecipeBySourceUrl,
  listRecipeSummaries,
  updateRecipePlanningFields,
} from "./recipes.js";
export type { RecipeSummary } from "./recipes.js";

export {
  createSession,
  getSession,
  updateSession,
  getSessionByWeek,
  getRecentSessions,
  deleteSession,
} from "./sessions.js";

export { saveFeedback, getFeedbackForSession, getRecipeHistory } from "./feedback.js";

export { saveShoppingList, getShoppingList } from "./shopping.js";

export {
  addPantryItem,
  updatePantryItem,
  getPantryItem,
  getPantryItemByNormalizedName,
  removePantryItem,
  listPantryItems,
} from "./pantry.js";

export {
  addGroceryStaple,
  updateGroceryStaple,
  removeGroceryStaple,
  getGroceryStapleByName,
  listGroceryStaples,
  listActiveGroceryStaples,
} from "./staples.js";

export { getPurchasePatterns, getSmartPromotionCandidates } from "./purchases.js";

export { recordPurchases } from "./purchase-log.js";
export type { PurchaseLogItem } from "./purchase-log.js";

export { getActiveGroceryList, saveGroceryList, ensureGroceryList } from "./grocery-list.js";

export {
  setPreference,
  removePreference,
  listPreferences,
  getPreferencesByType,
} from "./preferences.js";

export {
  setInventoryStatus,
  removeInventoryStatus,
  listInventory,
  getItemsByStatus,
} from "./inventory.js";

export {
  addFamilyMember,
  updateFamilyMember,
  getFamilyMember,
  removeFamilyMember,
  listFamilyMembers,
} from "./members.js";

export {
  addDietaryAdaptation,
  updateDietaryAdaptation,
  getDietaryAdaptation,
  removeDietaryAdaptation,
  listDietaryAdaptations,
  listAdaptationsForMember,
} from "./adaptations.js";

export {
  addIngredientSwap,
  updateIngredientSwap,
  getIngredientSwap,
  removeIngredientSwap,
  listIngredientSwaps,
  listActiveIngredientSwaps,
} from "./swaps.js";

export {
  getPlanningCandidates,
  getPlanningOptions,
  ingredientMatchesRestriction,
  recipeHasRestricted,
} from "./planning.js";
export type {
  PlanningCandidate,
  PlanningContext,
  PlanningCandidatesResult,
  MealOption,
  PlanningOptionsResult,
} from "./planning.js";

export { getStaplesDue, computeStaplesDue } from "./staples-due.js";
export type { StaplesDueResult } from "./staples-due.js";

export {
  createSide,
  getSide,
  updateSide,
  deleteSide,
  listSides,
  getSidesByBase,
  getSidesByTag,
  getSidesBatch,
  searchSides,
  getSidePairingStats,
  getInlineSideFrequencies,
} from "./sides.js";
export type { SidePairingStat, InlineSideFrequency } from "./sides.js";
