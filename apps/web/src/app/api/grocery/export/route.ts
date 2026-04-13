import { NextResponse } from "next/server";
import { ensureGroceryList } from "@meal-planner/db";
import type { GroceryListItem } from "@meal-planner/types";

const CATEGORY_ORDER = [
  "produce", "meat", "seafood", "dairy", "bread", "pasta",
  "canned", "condiments", "spices", "pantry", "frozen", "other",
];

const CATEGORY_LABELS: Record<string, string> = {
  produce: "PRODUCE",
  meat: "MEAT",
  seafood: "SEAFOOD",
  dairy: "DAIRY",
  bread: "BREAD & BAKERY",
  pasta: "PASTA & GRAINS",
  canned: "CANNED GOODS",
  condiments: "CONDIMENTS & SAUCES",
  spices: "SPICES & SEASONINGS",
  pantry: "PANTRY",
  frozen: "FROZEN",
  other: "OTHER",
};

function groupByCategory(items: GroceryListItem[]): Map<string, GroceryListItem[]> {
  const groups = new Map<string, GroceryListItem[]>();
  for (const cat of CATEGORY_ORDER) {
    const catItems = items.filter((i) => i.category === cat);
    if (catItems.length > 0) groups.set(cat, catItems);
  }
  // Handle unknown categories
  for (const item of items) {
    if (!CATEGORY_ORDER.includes(item.category)) {
      const existing = groups.get(item.category) ?? [];
      existing.push(item);
      groups.set(item.category, existing);
    }
  }
  return groups;
}

function formatItem(item: GroceryListItem, includePrice: boolean): string {
  const check = item.checked ? "[x]" : "[ ]";
  const qty = item.quantity > 0 ? ` (${item.quantity}${item.unit ? " " + item.unit : ""})` : "";
  const price = includePrice && item.heb?.price ? ` - ${item.heb.price.formatted}` : "";
  return `${check} ${item.name}${qty}${price}`;
}

function exportText(items: GroceryListItem[]): string {
  const date = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const hasHeb = items.some((i) => i.heb?.price);
  const groups = groupByCategory(items);
  const lines: string[] = [`Grocery List (${date})`, ""];

  if (hasHeb) {
    const total = items.reduce((sum, i) => sum + (i.heb?.price?.amount ?? 0), 0);
    if (total > 0) lines.push(`Est. Total: $${total.toFixed(2)}`, "");
  }

  for (const [cat, catItems] of groups) {
    const label = CATEGORY_LABELS[cat] ?? cat.toUpperCase();
    if (hasHeb) {
      const catTotal = catItems.reduce((sum, i) => sum + (i.heb?.price?.amount ?? 0), 0);
      lines.push(catTotal > 0 ? `${label} ($${catTotal.toFixed(2)})` : label);
    } else {
      lines.push(label);
    }
    for (const item of catItems) {
      lines.push(`  ${formatItem(item, hasHeb)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "text";
    const uncheckedOnly = url.searchParams.get("uncheckedOnly") === "true";

    const list = await ensureGroceryList();
    let items = list.items;
    if (uncheckedOnly) {
      items = items.filter((i) => !i.checked);
    }

    if (format === "json") {
      return NextResponse.json({ items });
    }

    const text = exportText(items);
    return new Response(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("GET /api/grocery/export failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
