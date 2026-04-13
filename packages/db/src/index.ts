export { getDocClient, TABLE_NAME, GSI1_NAME } from "./client.js";
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
} from "./recipes.js";

export {
  createSession,
  getSession,
  updateSession,
  getSessionByWeek,
  getRecentSessions,
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
