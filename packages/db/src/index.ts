export { getDocClient, TABLE_NAME, GSI1_NAME } from "./client.js";
export { createTableIfNotExists } from "./table.js";

export {
  createRecipe,
  getRecipe,
  updateRecipe,
  deleteRecipe,
  listRecipes,
  getRecipesByTag,
  listTags,
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

export { addPantryItem, removePantryItem, listPantryItems } from "./pantry.js";
