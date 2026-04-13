import { NextResponse } from "next/server";
import { getPurchasePatterns, listPantryItems } from "@meal-planner/db";
import { isPantryItem } from "@/lib/pantry-match";

export async function GET() {
  try {
    const [patterns, pantryItems] = await Promise.all([
      getPurchasePatterns(12),
      listPantryItems(),
    ]);

    // Find items that appear frequently but aren't in the pantry
    const suggestions = patterns
      .filter(
        (p) =>
          p.occurrences >= 3 &&
          !isPantryItem(p.itemName, pantryItems),
      )
      .slice(0, 15)
      .map((p) => ({
        name: p.itemName,
        category: p.category,
        occurrences: p.occurrences,
        totalWeeks: p.totalWeeks,
      }));

    return NextResponse.json(suggestions);
  } catch (err) {
    console.error("GET /api/pantry/suggestions failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
