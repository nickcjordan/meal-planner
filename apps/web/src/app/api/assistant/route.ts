import { runAssistantTurn } from "@meal-planner/agent";

const HEARTBEAT_INTERVAL_MS = 5000;

export async function POST(request: Request) {
  const body = await request.json();
  const { claudeSessionId, message, pageContext } = body as {
    claudeSessionId?: string;
    message: string;
    pageContext?: string;
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
        for await (const event of runAssistantTurn({
          claudeSessionId,
          userMessage: message,
          pageContext,
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
