export interface ShoppingListItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  recipeIds: string[];
  checked: boolean;
}

export interface ShoppingList {
  sessionId: string;
  items: ShoppingListItem[];
  createdAt: string;
  updatedAt: string;
}
