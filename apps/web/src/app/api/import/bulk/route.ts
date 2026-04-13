import { bulkScanUrls, discoverRecipeUrls } from "@meal-planner/import";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { urls, blogUrl } = body as {
      urls?: string[];
      blogUrl?: string;
    };

    let targetUrls: string[];

    if (blogUrl) {
      // Discovery mode: scrape a blog page for recipe links
      try {
        new URL(blogUrl);
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid blog URL" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      targetUrls = await discoverRecipeUrls(blogUrl);

      if (targetUrls.length === 0) {
        return new Response(
          JSON.stringify({
            error: "no_recipes_found",
            message:
              "No recipe links found on this page. Try pasting individual recipe URLs instead.",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        );
      }
    } else if (urls && Array.isArray(urls) && urls.length > 0) {
      // Validate each URL
      targetUrls = [];
      for (const url of urls) {
        try {
          new URL(url);
          targetUrls.push(url);
        } catch {
          // Skip invalid URLs silently
        }
      }

      if (targetUrls.length === 0) {
        return new Response(
          JSON.stringify({ error: "No valid URLs provided" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          error: "Provide either 'urls' (string[]) or 'blogUrl' (string)",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Stream results via SSE
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of bulkScanUrls(targetUrls)) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
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
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Bulk import failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
