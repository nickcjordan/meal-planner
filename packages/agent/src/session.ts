import { query } from "@anthropic-ai/claude-agent-sdk";
import { createMealPlannerServer } from "./server.js";
import { MEAL_PLANNER_SYSTEM_PROMPT } from "./prompt.js";

export interface ProposedMeal {
  day: string;
  mealType: string;
  recipeId: string;
  recipeName: string;
  complexity: string;
  reasoning: string;
}

export interface StrategyItem {
  label: string;
  detail: string;
}

export interface ProposedExtra {
  name: string;
  description?: string;
  ingredients: { name: string; quantity: number; unit: string; category?: string }[];
}

export interface MealProposal {
  meals: ProposedMeal[];
  extras?: ProposedExtra[];
  strategy?: StrategyItem[];
  shoppingHighlights?: string[];
  unusedRecipes?: string[];
}

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_progress"; toolName: string }
  | { type: "tool_result"; toolName: string; summary: string }
  | { type: "message_complete"; text: string }
  | { type: "meal_proposal"; proposal: MealProposal }
  | { type: "session_id"; sessionId: string }
  | { type: "error"; message: string }
  | { type: "done" };

export async function* runPlanningTurn(params: {
  claudeSessionId?: string;
  userMessage: string;
  weekOf: string;
}): AsyncGenerator<StreamEvent> {
  const { claudeSessionId, userMessage, weekOf } = params;

  const mcpServer = createMealPlannerServer();

  const prompt = claudeSessionId
    ? userMessage
    : `I'd like to plan meals for the week of ${weekOf}. ${userMessage}`;

  const options = {
    systemPrompt: MEAL_PLANNER_SYSTEM_PROMPT,
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
    const session = query({ prompt, options });

    for await (const msg of session) {
      switch (msg.type) {
        case "system": {
          if (msg.subtype === "init" && msg.session_id) {
            yield { type: "session_id", sessionId: msg.session_id };
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
          }
          break;
        }

        case "assistant": {
          // Check for present_meal_plan tool calls in the message
          for (const block of msg.message.content) {
            if (block.type === "tool_use" && block.name === "mcp__meal-planner-db__present_meal_plan") {
              const input = block.input as MealProposal;
              yield { type: "meal_proposal", proposal: input };
            }
          }

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
          yield {
            type: "tool_result",
            toolName: "",
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
