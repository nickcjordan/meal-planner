export type StapleStyle = "specific" | "flexible";

export type StapleFrequency = "weekly" | "biweekly" | "monthly" | "as-needed";

export interface GroceryStaple {
  id: string;
  name: string;
  style: StapleStyle;
  category: string;
  /** For specific items: default quantity to add to list */
  defaultQuantity?: number;
  /** For specific items: unit (e.g. "gallon", "12-pack") */
  defaultUnit?: string;
  /** For flexible items: guidance for the shopper (e.g. "Grab 2-3 types the kids will eat") */
  description?: string;
  frequency: StapleFrequency;
  /** Optional notes (e.g. "for coffee", "for the kids") */
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateGroceryStapleInput = Omit<GroceryStaple, "id" | "createdAt" | "updatedAt"> & {
  isActive?: boolean;
};

/** A staple item as included in a specific session's plan */
export interface SessionStapleItem {
  stapleId?: string;
  name: string;
  style: StapleStyle;
  category: string;
  quantity?: number;
  unit?: string;
  description?: string;
  frequency: StapleFrequency;
}

/** An ingredient assumed to be on hand from a previous week's purchase */
export interface CarryoverItem {
  name: string;
  estimatedQuantity: number;
  unit: string;
  source: {
    weekOf: string;
    recipeName: string;
    purchasedQuantity: number;
    usedQuantity: number;
  };
  neededFor: {
    day: string;
    recipeName: string;
    requiredQuantity: number;
  };
  status: "unresolved" | "confirmed" | "added-to-list";
}

/** A suggestion surfaced to the user during planning (not yet in the plan) */
export interface PlanSuggestion {
  id: string;
  type: "deal-meal" | "recurring-item" | "pattern-detected" | "smart-promotion";
  title: string;
  description: string;
  rationale: string;
  /** For item-type suggestions */
  item?: SessionStapleItem;
}

/** Purchase frequency data derived from historical shopping lists */
export interface PurchasePattern {
  itemName: string;
  category: string;
  occurrences: number;
  totalWeeks: number;
  lastPurchasedWeekOf: string;
  isCurrentStaple: boolean;
}
