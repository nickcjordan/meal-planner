import { getShoppingList, saveShoppingList } from "@meal-planner/db";
import { enrichShoppingListStream } from "@meal-planner/heb";
import type { HebProductMatch } from "@meal-planner/types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const list = await getShoppingList(id);
  if (!list) {
    return new Response(JSON.stringify({ error: "Shopping list not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of enrichShoppingListStream(list.items)) {
          // On completion, re-read the list so items added/checked/edited/removed
          // *during* the stream keep their live state. `ShoppingListItem` has no
          // stable id, so merge enrichment onto surviving items by name+unit.
          // Items not present in the enrichment set are left untouched; items
          // removed mid-stream are absent and skipped.
          if (event.type === "complete") {
            const current = await getShoppingList(id);
            if (!current) {
              // List was deleted mid-stream — nothing to write back.
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
              );
              continue;
            }

            const byNameUnit = new Map<string, HebProductMatch | undefined>();
            for (const e of event.items) {
              byNameUnit.set(
                `${e.name.toLowerCase().trim()}||${e.unit.toLowerCase().trim()}`,
                e.heb,
              );
            }

            for (const item of current.items) {
              const key = `${item.name.toLowerCase().trim()}||${item.unit.toLowerCase().trim()}`;
              if (byNameUnit.has(key)) {
                item.heb = byNameUnit.get(key);
              }
            }

            const enrichedList = await saveShoppingList(current);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ ...event, list: enrichedList })}\n\n`,
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
