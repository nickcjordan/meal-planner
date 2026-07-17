import type { ShoppingList, PurchasePattern } from "@meal-planner/types";
import { TABLE_NAME, scanAll } from "./client.js";
import { listGroceryStaples } from "./staples.js";
import { getRecentSessions } from "./sessions.js";
import type { PurchaseLogItem } from "./purchase-log.js";

/** One purchase event: a set of items all bought in the same week. */
interface PurchaseEvent {
  weekKey: string;
  items: Array<{ name: string; category: string }>;
}

/** Canonical week key (the Monday, `YYYY-MM-DD`) containing an ISO timestamp.
 *  UTC-based so it is deterministic; collapses same-week clears into one week. */
function weekKeyFromTimestamp(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff),
  );
  return monday.toISOString().slice(0, 10);
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Analyze purchase patterns across both the primary grocery flow (PURCHASELOG
 * entities written by clear-checked) and the legacy per-session shopping lists
 * (SHOPLIST checked items). Occurrences are counted as **distinct weeks** a
 * normalized item name was purchased in — multiple purchases within one week
 * count once, and different weeks never collapse together. Returns items sorted
 * by occurrences (most weeks first). `weekLimit` bounds analysis to the most
 * recent N distinct purchase weeks.
 */
export async function getPurchasePatterns(weekLimit: number = 8): Promise<PurchasePattern[]> {
  const events: PurchaseEvent[] = [];

  // Primary flow: PURCHASELOG entities (week derived from clearedAt).
  const logs = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: { ":type": "PURCHASELOG" },
  });
  for (const raw of logs) {
    const log = raw as { clearedAt?: string; items?: PurchaseLogItem[] };
    if (!log.clearedAt) continue;
    const weekKey = weekKeyFromTimestamp(log.clearedAt);
    events.push({
      weekKey,
      items: (log.items ?? []).map((i) => ({ name: i.name, category: i.category })),
    });
  }

  // Legacy flow: SHOPLIST checked items (week derived from the session's weekOf).
  const sessions = await getRecentSessions(Math.max(weekLimit * 2, weekLimit));
  const sessionWeekMap = new Map(sessions.map((s) => [s.id, s.weekOf]));
  const shoplists = await scanAll({
    TableName: TABLE_NAME,
    FilterExpression: "entityType = :type",
    ExpressionAttributeValues: { ":type": "SHOPLIST" },
  });
  for (const raw of shoplists) {
    const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...list } =
      raw as ShoppingList & Record<string, unknown>;
    const weekKey = sessionWeekMap.get((list as ShoppingList).sessionId);
    if (!weekKey) continue;
    const checked = ((list as ShoppingList).items ?? [])
      .filter((i) => i.checked)
      .map((i) => ({ name: i.name, category: i.category }));
    if (checked.length > 0) events.push({ weekKey, items: checked });
  }

  // Bound the analysis to the most recent `weekLimit` distinct weeks.
  const allWeeks = [...new Set(events.map((e) => e.weekKey))].sort((a, b) =>
    b.localeCompare(a),
  );
  const windowWeeks = new Set(allWeeks.slice(0, weekLimit));
  if (windowWeeks.size === 0) return [];

  // Aggregate distinct weeks per normalized item name.
  const map = new Map<
    string,
    { category: string; weeks: Set<string>; lastWeekOf: string }
  >();
  for (const event of events) {
    if (!windowWeeks.has(event.weekKey)) continue;
    for (const item of event.items) {
      const key = normalizeName(item.name);
      let entry = map.get(key);
      if (!entry) {
        entry = { category: item.category, weeks: new Set(), lastWeekOf: event.weekKey };
        map.set(key, entry);
      }
      entry.weeks.add(event.weekKey);
      if (event.weekKey > entry.lastWeekOf) entry.lastWeekOf = event.weekKey;
    }
  }

  const staples = await listGroceryStaples();
  const stapleSet = new Set(staples.map((s) => s.name.toLowerCase()));

  const totalWeeks = windowWeeks.size;
  return Array.from(map.entries())
    .map(([itemName, data]) => ({
      itemName,
      category: data.category,
      occurrences: data.weeks.size,
      totalWeeks,
      lastPurchasedWeekOf: data.lastWeekOf,
      isCurrentStaple: stapleSet.has(itemName),
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Get items purchased frequently enough to suggest promoting to a staple —
 * present in at least `minFrequency` distinct weeks and not already a staple.
 */
export async function getSmartPromotionCandidates(
  weekLimit: number = 8,
  minFrequency: number = 3,
): Promise<PurchasePattern[]> {
  const patterns = await getPurchasePatterns(weekLimit);
  return patterns.filter(
    (p) => !p.isCurrentStaple && p.occurrences >= minFrequency,
  );
}
