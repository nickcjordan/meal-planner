/**
 * Staples due — deterministic "which grocery staples are due this week" logic
 * for the planning wizard's roundout step. Pure computation lives in
 * computeStaplesDue (unit-testable without AWS); getStaplesDue wraps it with the
 * data fetch.
 */

import type { GroceryStaple, PurchasePattern } from "@meal-planner/types";
import { listGroceryStaples } from "./staples.js";
import { getPurchasePatterns } from "./purchases.js";

/** Normalize a name for staple ↔ purchase-history matching (lowercase + trim).
 *  Matches the normalization getPurchasePatterns applies to its itemName, so the
 *  two are directly comparable. */
function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

/** Weeks of lookback before a staple of a given frequency is considered due. */
const LOOKBACK_WEEKS: Record<GroceryStaple["frequency"], number> = {
  weekly: 0,
  biweekly: 2,
  monthly: 4,
  "as-needed": 0, // never auto-due
};

/** `weekOf` minus `weeks` weeks, as a `YYYY-MM-DD` string. */
function weeksBefore(weekOf: string, weeks: number): string {
  const date = new Date(weekOf);
  date.setDate(date.getDate() - weeks * 7);
  return date.toISOString().split("T")[0];
}

export interface StaplesDueResult {
  /** Active staples due this week, each tagged with its last purchase week (if any). */
  due: Array<GroceryStaple & { lastPurchasedWeekOf?: string }>;
  /** Active as-needed staples — never auto-due, surfaced separately. */
  asNeeded: GroceryStaple[];
}

/**
 * Decide which staples are due for the given week.
 *
 * Rules (active staples only):
 * - weekly    → always due
 * - biweekly  → due if the last purchase of a matching item is ≥2 weeks before
 *               weekOf, or it was never purchased
 * - monthly   → same, but ≥4 weeks
 * - as-needed → never due; returned in `asNeeded`
 *
 * A staple matches a purchase-history entry by normalized (lowercase/trim) name.
 */
export function computeStaplesDue(
  staples: GroceryStaple[],
  purchaseHistory: PurchasePattern[],
  weekOf: string,
): StaplesDueResult {
  // Index purchase history by normalized item name → last purchased week.
  const lastPurchasedByName = new Map<string, string>();
  for (const p of purchaseHistory) {
    const key = normalizeName(p.itemName);
    const existing = lastPurchasedByName.get(key);
    if (!existing || p.lastPurchasedWeekOf > existing) {
      lastPurchasedByName.set(key, p.lastPurchasedWeekOf);
    }
  }

  const due: Array<GroceryStaple & { lastPurchasedWeekOf?: string }> = [];
  const asNeeded: GroceryStaple[] = [];

  for (const staple of staples) {
    if (!staple.isActive) continue;

    if (staple.frequency === "as-needed") {
      asNeeded.push(staple);
      continue;
    }

    const lastPurchasedWeekOf = lastPurchasedByName.get(normalizeName(staple.name));

    if (staple.frequency === "weekly") {
      due.push({ ...staple, lastPurchasedWeekOf });
      continue;
    }

    // biweekly / monthly: due when never purchased, or last purchase is at least
    // the lookback window before this week.
    const lookback = LOOKBACK_WEEKS[staple.frequency];
    if (!lastPurchasedWeekOf) {
      due.push({ ...staple, lastPurchasedWeekOf: undefined });
      continue;
    }
    const threshold = weeksBefore(weekOf, lookback);
    if (lastPurchasedWeekOf <= threshold) {
      due.push({ ...staple, lastPurchasedWeekOf });
    }
  }

  return { due, asNeeded };
}

/** Fetch staples + purchase history and compute which are due for `weekOf`. */
export async function getStaplesDue(weekOf: string): Promise<StaplesDueResult> {
  const [staples, purchaseHistory] = await Promise.all([
    listGroceryStaples(),
    getPurchasePatterns(),
  ]);
  return computeStaplesDue(staples, purchaseHistory, weekOf);
}
