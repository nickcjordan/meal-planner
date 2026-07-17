import type { HebProductMatch } from "./shopping.js";

/** Where a grocery list item originated.
 *  Session-derived variants carry `quantity` (the amount this source contributed)
 *  so a re-merge can resync by subtracting exactly that source's share. The
 *  `staple`/`adaptation`/`swap` variants also carry `sessionId`/`weekOf` when
 *  written during a session merge (they may otherwise be session-independent). */
export type GroceryItemSource =
  | { type: "recipe"; sessionId: string; weekOf: string; recipeId: string; recipeName: string; quantity?: number }
  | { type: "extra"; sessionId: string; weekOf: string; extraName: string; quantity?: number }
  | { type: "staple"; stapleName: string; sessionId?: string; weekOf?: string; quantity?: number }
  | { type: "manual" }
  | {
      type: "adaptation";
      originalIngredient: string;
      adaptationName: string;
      memberName: string;
      sessionId?: string;
      weekOf?: string;
      quantity?: number;
    }
  | { type: "carryover"; sessionId: string; weekOf: string; recipeName: string; quantity?: number }
  | {
      type: "swap";
      originalIngredient: string;
      swapFrom: string;
      swapTo: string;
      sessionId?: string;
      weekOf?: string;
      quantity?: number;
    }
  | {
      type: "side";
      sessionId: string;
      weekOf: string;
      day: import("./session.js").DayOfWeek;
      mealType: import("./session.js").MealType;
      sideId?: string;
      sideName: string;
      quantity?: number;
    };

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
