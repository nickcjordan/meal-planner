export interface Message {
  role: "user" | "assistant";
  content: string;
}

const TOOL_LABELS: Record<string, string> = {
  search_recipes: "Searching recipes...",
  get_recipe_details: "Reading recipe details...",
  get_recent_meal_plans: "Checking recent meal history...",
  get_recipe_history: "Looking up recipe history...",
  get_pantry_items: "Checking pantry items...",
  get_grocery_staples: "Loading grocery staples...",
  manage_grocery_staple: "Updating grocery staples...",
  get_purchase_patterns: "Analyzing purchase history...",
  get_last_week_shopping_list: "Checking last week's shopping list...",
  save_meal_plan: "Saving your meal plan...",
  present_meal_plan: "Preparing meal plan...",
  save_feedback: "Recording feedback...",
  get_session_feedback: "Checking feedback...",
  add_pantry_item: "Adding pantry item...",
  remove_pantry_item: "Removing pantry item...",
  create_recipe: "Creating recipe...",
  update_recipe: "Updating recipe...",
  delete_recipe: "Deleting recipe...",
  list_tags: "Loading tags...",
  get_shopping_list: "Checking shopping list...",
  add_shopping_list_item: "Adding to grocery list...",
  remove_shopping_list_item: "Removing from grocery list...",
  check_shopping_list_item: "Updating grocery list...",
  get_session: "Loading session...",
  update_session_status: "Updating session...",
  get_preferences: "Loading family preferences...",
  set_preference: "Saving preference...",
  remove_preference: "Removing preference...",
  get_inventory: "Checking pantry inventory...",
  set_inventory_status: "Updating inventory...",
  clear_inventory_status: "Clearing inventory status...",
  get_family_members: "Loading family members...",
  manage_family_member: "Updating family members...",
  get_dietary_adaptations: "Loading dietary adaptations...",
  manage_dietary_adaptation: "Updating dietary adaptations...",
  import_recipe_from_url: "Importing recipe from URL...",
  get_active_grocery_list: "Loading grocery list...",
  get_weekly_ad: "Checking H-E-B weekly deals...",
};

export function getToolLabel(toolName: string): string {
  const shortName = stripMcpPrefix(toolName);
  return TOOL_LABELS[shortName] ?? `Using ${shortName}...`;
}

function stripMcpPrefix(toolName: string): string {
  return toolName.includes("__") ? toolName.split("__").pop()! : toolName;
}

/** Tools that write to DynamoDB — used for audit trail toasts */
const WRITE_TOOLS = new Set([
  "add_pantry_item",
  "remove_pantry_item",
  "set_inventory_status",
  "clear_inventory_status",
  "set_preference",
  "remove_preference",
  "manage_family_member",
  "manage_dietary_adaptation",
  "manage_grocery_staple",
  "save_feedback",
  "create_recipe",
  "update_recipe",
  "delete_recipe",
  "add_shopping_list_item",
  "remove_shopping_list_item",
  "check_shopping_list_item",
  "update_session_status",
  "save_meal_plan",
  "import_recipe_from_url",
]);

export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOLS.has(stripMcpPrefix(toolName));
}
