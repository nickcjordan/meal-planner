import { ensureGroceryList, saveGroceryList } from "@meal-planner/db";
import { enrichShoppingListStream } from "@meal-planner/heb";
import type { HebProductMatch } from "@meal-planner/types";

export async function POST() {
  const list = await ensureGroceryList();
  if (list.items.length === 0) {
    return new Response(JSON.stringify({ error: "Grocery list is empty" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Map GroceryListItems to the shape enrichShoppingListStream expects
  // (it needs { name, heb? } at minimum, plus passes through other fields).
  // We carry the stable `id` through so the completion handler can merge
  // enrichment back onto the (possibly concurrently-edited) list by id.
  const itemsForEnrichment = list.items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    recipeIds: [] as string[],
    checked: item.checked,
    heb: item.heb,
  }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of enrichShoppingListStream(itemsForEnrichment)) {
          if (event.type === "complete") {
            // Re-read the list so items added/checked/edited/removed *during* the
            // enrichment stream keep their live state. Merge enrichment results
            // onto surviving items by stable id (fallback: name+unit). Items not
            // present in the enrichment set (added mid-stream) are left untouched;
            // items removed mid-stream are simply absent and skipped.
            const current = await ensureGroceryList();

            const enriched = event.items as Array<{
              id?: string;
              name: string;
              unit: string;
              heb?: HebProductMatch;
            }>;
            const byId = new Map<string, HebProductMatch | undefined>();
            const byNameUnit = new Map<string, HebProductMatch | undefined>();
            for (const e of enriched) {
              if (e.id) byId.set(e.id, e.heb);
              byNameUnit.set(
                `${e.name.toLowerCase().trim()}||${e.unit.toLowerCase().trim()}`,
                e.heb,
              );
            }

            for (const item of current.items) {
              if (byId.has(item.id)) {
                item.heb = byId.get(item.id);
                continue;
              }
              const key = `${item.name.toLowerCase().trim()}||${item.unit.toLowerCase().trim()}`;
              if (byNameUnit.has(key)) {
                item.heb = byNameUnit.get(key);
              }
            }

            const saved = await saveGroceryList(current);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ ...event, list: saved })}\n\n`,
              ),
            );
          } else {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
