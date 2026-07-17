import { query } from "@anthropic-ai/claude-agent-sdk";
import { createMealPlannerServer } from "./server.js";
import { buildAssistantPrompt } from "./assistant-prompt.js";
import { allTools } from "./tools.js";

/** Planner-only tools the general assistant must never invoke. `save_meal_plan`
 *  would write a meals-only session over a legitimately saved week, and the two
 *  present_* proposal tools have no rendering path on the assistant surface (they
 *  would silently vanish). Enforce an explicit allowlist rather than a wildcard. */
const ASSISTANT_EXCLUDED_TOOLS = new Set([
  "save_meal_plan",
  "present_meal_plan",
  "present_alternatives",
]);

/** Every meal-planner-db tool the assistant is allowed to call — the full tool
 *  set minus the planner-only tools above, prefixed for the MCP server. */
const ASSISTANT_ALLOWED_TOOLS = allTools
  .filter((t) => !ASSISTANT_EXCLUDED_TOOLS.has(t.name))
  .map((t) => `mcp__meal-planner-db__${t.name}`);

export type AssistantStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolName: string; toolUseId: string }
  | { type: "tool_progress"; toolName: string }
  | { type: "tool_complete"; toolUseId: string; toolName: string; durationMs?: number; isError?: boolean }
  | { type: "tool_result"; toolName: string; summary: string; durationMs?: number }
  | { type: "message_complete"; text: string }
  | { type: "session_id"; sessionId: string }
  | { type: "status"; message: string }
  | { type: "heartbeat" }
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
    allowedTools: ASSISTANT_ALLOWED_TOOLS,
    permissionMode: "bypassPermissions" as const,
    includePartialMessages: true,
    model: "sonnet",
    maxTurns: 20,
    ...(claudeSessionId ? { resume: claudeSessionId } : {}),
  };

  const TAG = "[meal-planner:assistant]";
  const turnStart = Date.now();
  console.log(`${TAG} Turn started`);

  try {
    const session = query({ prompt: userMessage, options });
    let currentToolName = "";
    let toolStartTime = 0;
    const toolStarts = new Map<string, { name: string; startedAt: number }>();

    for await (const msg of session) {
      switch (msg.type) {
        case "system": {
          if (msg.subtype === "init" && msg.session_id) {
            console.log(`${TAG} Session: ${msg.session_id}`);
            yield { type: "session_id", sessionId: msg.session_id };
          } else if (msg.subtype === "status") {
            const status = (msg as { status: string | null }).status;
            if (status === "compacting") {
              yield { type: "status", message: "Organizing context..." };
            }
          } else if (msg.subtype === "api_retry") {
            const retry = msg as { attempt: number; max_retries: number };
            console.log(`${TAG} API retry ${retry.attempt}/${retry.max_retries}`);
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
          const info = (msg as { rate_limit_info?: { status?: string } }).rate_limit_info;
          const status = info?.status;
          if (status === "rejected") {
            console.log(`${TAG} Rate limit rejected — waiting`);
            yield { type: "status", message: "Rate limited, waiting..." };
          } else if (status === "allowed_warning") {
            console.log(`${TAG} Rate limit warning (still allowed)`);
          }
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
            const { id: toolUseId, name: toolName } = event.content_block;
            currentToolName = toolName;
            toolStartTime = Date.now();
            toolStarts.set(toolUseId, { name: toolName, startedAt: toolStartTime });
            console.log(`${TAG} Tool started: ${toolName} (${toolUseId})`);
            yield { type: "tool_start", toolName, toolUseId };
          }
          break;
        }

        case "user": {
          const userMsg = msg as { message?: { content?: unknown } };
          const content = userMsg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (
                block &&
                typeof block === "object" &&
                (block as { type?: string }).type === "tool_result"
              ) {
                const tr = block as { tool_use_id: string; is_error?: boolean };
                const start = toolStarts.get(tr.tool_use_id);
                if (start) {
                  const durationMs = Date.now() - start.startedAt;
                  toolStarts.delete(tr.tool_use_id);
                  console.log(
                    `${TAG} Tool completed: ${start.name} (${tr.tool_use_id}) ${durationMs}ms`,
                  );
                  yield {
                    type: "tool_complete",
                    toolUseId: tr.tool_use_id,
                    toolName: start.name,
                    durationMs,
                    isError: tr.is_error,
                  };
                }
              }
            }
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
          const durationMs = toolStartTime ? Date.now() - toolStartTime : undefined;
          console.log(`${TAG} Tool completed: ${toolName}${durationMs != null ? ` (${durationMs}ms)` : ""}`);
          toolStartTime = 0;
          yield {
            type: "tool_result",
            toolName,
            summary: msg.summary,
            durationMs,
          };
          break;
        }

        case "result": {
          if (msg.subtype !== "success") {
            console.error(`${TAG} Turn failed: ${msg.subtype}`);
            yield { type: "error", message: (msg as { result?: string }).result ?? msg.subtype };
          }
          console.log(`${TAG} Turn completed (${Date.now() - turnStart}ms)`);
          yield { type: "done" };
          break;
        }
      }
    }
  } catch (err) {
    console.error(`${TAG} Turn error (${Date.now() - turnStart}ms):`, err);
    yield { type: "error", message: String(err) };
    yield { type: "done" };
  }
}
