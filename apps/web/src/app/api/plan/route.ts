import { runPlanningTurn } from "@meal-planner/agent";

const HEARTBEAT_INTERVAL_MS = 5000;

export async function POST(request: Request) {
  const body = await request.json();
  const { claudeSessionId, weekOf, message, mode } = body as {
    claudeSessionId?: string;
    weekOf: string;
    message: string;
    mode?: "legacy" | "wizard";
  };

  const encoder = new TextEncoder();
  const heartbeatData = encoder.encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(heartbeatData);
        } catch {
          // stream already closed
        }
      }, HEARTBEAT_INTERVAL_MS);

      try {
        for await (const event of runPlanningTurn({
          claudeSessionId,
          userMessage: message,
          weekOf,
          mode,
        })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`),
        );
      } finally {
        clearInterval(heartbeat);
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
