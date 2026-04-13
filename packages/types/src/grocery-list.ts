import type { HebProductMatch } from "./shopping.js";

/** Where a grocery list item originated */
export type GroceryItemSource =
  | { type: "recipe"; sessionId: string; weekOf: string; recipeId: string; recipeName: string }
  | { type: "extra"; sessionId: string; weekOf: string; extraName: string }
  | { type: "staple"; stapleName: string }
  | { type: "manual" }
  | { type: "adaptation"; originalIngredient: string; adaptationName: string; memberName: string };

export interface GroceryListItem {
  /** Stable UUID for targeted updates */
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  checked: boolean;
  /** Tracks all origins — same item can come from multiple recipes + manual */
  sources: GroceryItemSource[];
  /** HEB enrichment data */
  heb?: HebProductMatch;
  /** User notes, e.g. "get the organic one" */
  notes?: string;
  /** For flexible staple items */
  isFlexible?: boolean;
  flexibleDescription?: string;
  addedAt: string;
}

export interface GroceryList {
  items: GroceryListItem[];
  /** Session IDs already merged — prevents double-merge */
  mergedSessionIds: string[];
  createdAt: string;
  updatedAt: string;
}
