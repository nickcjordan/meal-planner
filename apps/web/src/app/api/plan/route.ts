import { runPlanningTurn } from "@meal-planner/agent";

export async function POST(request: Request) {
  const body = await request.json();
  const { claudeSessionId, weekOf, message } = body as {
    claudeSessionId?: string;
    weekOf: string;
    message: string;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runPlanningTurn({
          claudeSessionId,
          userMessage: message,
          weekOf,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`),
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
