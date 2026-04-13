import { ensureGroceryList, saveGroceryList } from "@meal-planner/db";
import { enrichShoppingListStream } from "@meal-planner/heb";

export async function POST() {
  const list = await ensureGroceryList();
  if (list.items.length === 0) {
    return new Response(JSON.stringify({ error: "Grocery list is empty" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Map GroceryListItems to the shape enrichShoppingListStream expects
  // (it needs { name, heb? } at minimum, plus passes through other fields)
  const itemsForEnrichment = list.items.map((item) => ({
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
            // Map enriched HEB data back onto grocery list items
            const enrichedItems = event.items;
            for (let i = 0; i < list.items.length; i++) {
              if (i < enrichedItems.length) {
                list.items[i].heb = enrichedItems[i].heb;
              }
            }

            const saved = await saveGroceryList(list);
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
