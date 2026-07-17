export interface HebProductMatch {
  productId: string;
  name: string;
  brand?: string;
  isOwnBrand?: boolean;
  size?: string;
  price?: {
    amount: number;
    formatted: string;
  };
  unitPrice?: {
    amount: number;
    unit: string;
    formatted: string;
  };
  isOnSale?: boolean;
  inStock?: boolean;
  aisleLocation?: string;
  matchedAt: string;
}

export type ShoppingItemSource = "recipe" | "extra" | "staple";

export interface ShoppingListItem {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  recipeIds: string[];
  checked: boolean;
  heb?: HebProductMatch;
  /** Where this item came from */
  source?: ShoppingItemSource;
  /** For flexible staple items — shopper guidance instead of a specific quantity */
  isFlexible?: boolean;
  /** For flexible items — description shown instead of quantity */
  flexibleDescription?: string;
}

/** Items assumed on hand from prior weeks, shown as a reminder on the shopping list */
export interface ShoppingListCarryover {
  name: string;
  estimatedQuantity: number;
  unit: string;
  neededForRecipe: string;
  neededForDay: string;
  sourceWeekOf: string;
}

export interface ShoppingList {
  sessionId: string;
  items: ShoppingListItem[];
  carryoverItems?: ShoppingListCarryover[];
  createdAt: string;
  updatedAt: string;
}
