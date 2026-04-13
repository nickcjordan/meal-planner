import { getShoppingList, saveShoppingList } from "@meal-planner/db";
import { enrichShoppingListStream } from "@meal-planner/heb";

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
          // On completion, save the enriched list before sending the final event
          if (event.type === "complete") {
            const enrichedList = await saveShoppingList({
              ...list,
              items: event.items,
            });
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
