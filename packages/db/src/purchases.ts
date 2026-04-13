import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { ShoppingList, DynamoDBRecord, PurchasePattern } from "@meal-planner/types";
import { getDocClient, TABLE_NAME } from "./client.js";
import { listGroceryStaples } from "./staples.js";
import { getRecentSessions } from "./sessions.js";

type ShoppingListRecord = DynamoDBRecord & ShoppingList;

/**
 * Scan all shopping lists from recent sessions and analyze purchase patterns.
 * Returns items sorted by frequency (most purchased first).
 */
export async function getPurchasePatterns(weekLimit: number = 8): Promise<PurchasePattern[]> {
  // Get recent sessions to know which weeks we're analyzing
  const sessions = await getRecentSessions(weekLimit);
  if (sessions.length === 0) return [];

  const sessionIds = new Set(sessions.map((s) => s.id));

  // Scan all shopping lists
  const result = await getDocClient().send(
    new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "entityType = :type",
      ExpressionAttributeValues: { ":type": "SHOPLIST" },
    }),
  );

  const shoppingLists = (result.Items ?? [])
    .map((item) => {
      const { PK: _, SK: __, GSI1PK: ___, GSI1SK: ____, entityType: _____, ...list } = item as ShoppingListRecord;
      return list;
    })
    .filter((list) => sessionIds.has(list.sessionId));

  // Build frequency map: itemName -> { count, category, lastWeekOf }
  const frequencyMap = new Map<string, {
    count: number;
    category: string;
    lastWeekOf: string;
  }>();

  // Match shopping lists to their session weekOf
  const sessionWeekMap = new Map(sessions.map((s) => [s.id, s.weekOf]));

  for (const list of shoppingLists) {
    const weekOf = sessionWeekMap.get(list.sessionId) ?? "";
    for (const item of list.items) {
      if (!item.checked) continue; // Only count items that were actually purchased
      const key = item.name.toLowerCase();
      const existing = frequencyMap.get(key);
      if (existing) {
        existing.count++;
        if (weekOf > existing.lastWeekOf) {
          existing.lastWeekOf = weekOf;
        }
      } else {
        frequencyMap.set(key, {
          count: 1,
          category: item.category,
          lastWeekOf: weekOf,
        });
      }
    }
  }

  // Check which items are already staples
  const staples = await listGroceryStaples();
  const stapleSet = new Set(staples.map((s) => s.name.toLowerCase()));

  const patterns: PurchasePattern[] = Array.from(frequencyMap.entries())
    .map(([itemName, data]) => ({
      itemName,
      category: data.category,
      occurrences: data.count,
      totalWeeks: sessions.length,
      lastPurchasedWeekOf: data.lastWeekOf,
      isCurrentStaple: stapleSet.has(itemName),
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  return patterns;
}

/**
 * Get items that appear frequently in shopping lists but aren't staples yet.
 * These are candidates for "smart promotion" suggestions.
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
