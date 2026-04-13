import { query } from "@anthropic-ai/claude-agent-sdk";
import { createMealPlannerServer } from "./server.js";
import { buildAssistantPrompt } from "./assistant-prompt.js";

export type AssistantStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_progress"; toolName: string }
  | { type: "tool_result"; toolName: string; summary: string }
  | { type: "message_complete"; text: string }
  | { type: "session_id"; sessionId: string }
  | { type: "status"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

export async function* runAssistantTurn(params: {
  claudeSessionId?: string;
  userMessage: string;
  pageContext?: string;
}): AsyncGenerator<AssistantStreamEvent> {
  const { claudeSessionId, userMessage, pageContext } = params;

  const mcpServer = createMealPlannerServer();

  const options = {
    systemPrompt: buildAssistantPrompt(pageContext),
    tools: [] as string[],
    mcpServers: { "meal-planner-db": mcpServer },
    allowedTools: ["mcp__meal-planner-db__*"],
    permissionMode: "bypassPermissions" as const,
    includePartialMessages: true,
    model: "sonnet",
    maxTurns: 20,
    ...(claudeSessionId ? { resume: claudeSessionId } : {}),
  };

  try {
    const session = query({ prompt: userMessage, options });
    let currentToolName = "";

    for await (const msg of session) {
      switch (msg.type) {
        case "system": {
          if (msg.subtype === "init" && msg.session_id) {
            yield { type: "session_id", sessionId: msg.session_id };
          } else if (msg.subtype === "status") {
            const status = (msg as { status: string | null }).status;
            if (status === "compacting") {
              yield { type: "status", message: "Organizing context..." };
            }
          } else if (msg.subtype === "api_retry") {
            const retry = msg as { attempt: number; max_retries: number };
            yield { type: "status", message: `Retrying (${retry.attempt}/${retry.max_retries})...` };
          }
          break;
        }

        case "auth_status": {
          if ((msg as { isAuthenticating: boolean }).isAuthenticating) {
            yield { type: "status", message: "Authenticating..." };
          }
          break;
        }

        case "rate_limit_event": {
          yield { type: "status", message: "Rate limited, waiting..." };
          break;
        }

        case "stream_event": {
          const event = msg.event;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            yield { type: "text_delta", text: event.delta.text };
          } else if (
            event.type === "content_block_start" &&
            event.content_block.type === "tool_use"
          ) {
            currentToolName = event.content_block.name;
            yield { type: "tool_start", toolName: event.content_block.name };
          }
          break;
        }

        case "assistant": {
          const textBlocks = msg.message.content.filter(
            (block) => block.type === "text",
          );
          const fullText = textBlocks
            .map((block) => (block as { type: "text"; text: string }).text)
            .join("");
          if (fullText) {
            yield { type: "message_complete", text: fullText };
          }
          break;
        }

        case "tool_progress": {
          yield { type: "tool_progress", toolName: msg.tool_name };
          break;
        }

        case "tool_use_summary": {
          const toolName = (msg as { tool_name?: string }).tool_name ?? currentToolName;
          yield {
            type: "tool_result",
            toolName,
            summary: msg.summary,
          };
          break;
        }

        case "result": {
          if (msg.subtype !== "success") {
            yield { type: "error", message: (msg as { result?: string }).result ?? msg.subtype };
          }
          yield { type: "done" };
          break;
        }
      }
    }
  } catch (err) {
    yield { type: "error", message: String(err) };
    yield { type: "done" };
  }
}
