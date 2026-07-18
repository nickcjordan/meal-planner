import { query } from "@anthropic-ai/claude-agent-sdk";
import { createMealPlannerServer } from "./server.js";
import { MEAL_PLANNER_SYSTEM_PROMPT } from "./prompt.js";
import { WIZARD_PLANNER_SYSTEM_PROMPT } from "./prompt-wizard.js";
import type {
  MealOptionsPayload,
  PlanDraftPayload,
  WeekRoundoutPayload,
} from "./tools.js";

export interface ProposedAdaptation {
  adaptationName: string;
  memberName: string;
  applied: boolean;
  swaps?: { from: string; to: string; quality: "exact" | "approximate" }[];
  skipReason?: string;
  skipNote?: string;
}

export interface ProposedSide {
  sideId?: string;
  sideName: string;
  sideCategory: string;
  complexity: string;
  reasoning?: string;
  ingredients?: { name: string; quantity: number; unit: string; category?: string }[];
  baseIngredient?: string;
}

export interface ProposedMeal {
  day: string;
  mealType: string;
  recipeId: string;
  recipeName: string;
  complexity: string;
  reasoning: string;
  adaptations?: ProposedAdaptation[];
  sides?: ProposedSide[];
}

export interface ComplexityMix {
  staple: number;
  standard: number;
  involved: number;
}

export interface CookTimeEntry {
  day: string;
  minutes: number;
}

export interface ShoppingHighlight {
  ingredient: string;
  days: string[];
  buyNote: string;
}

export interface SwapCandidate {
  name: string;
  complexity: string;
}

export interface ProposedExtra {
  name: string;
  description?: string;
  ingredients: { name: string; quantity: number; unit: string; category?: string }[];
}

export interface ProposedStaple {
  name: string;
  style: "specific" | "flexible";
  category: string;
  quantity?: number;
  unit?: string;
  description?: string;
  frequency: "weekly" | "biweekly" | "monthly" | "as-needed";
}

export interface ProposedCarryover {
  name: string;
  estimatedQuantity: number;
  unit: string;
  source: {
    weekOf: string;
    recipeName: string;
    purchasedQuantity: number;
    usedQuantity: number;
  };
  neededFor: {
    day: string;
    recipeName: string;
    requiredQuantity: number;
  };
  status?: "confirmed" | "need";
}

export interface ProposedSuggestion {
  id: string;
  type: "deal-meal" | "recurring-item" | "pattern-detected" | "smart-promotion" | "pantry-promotion";
  title: string;
  description: string;
  rationale: string;
  item?: ProposedStaple;
}

export interface MealProposal {
  meals: ProposedMeal[];
  extras?: ProposedExtra[];
  complexityMix?: ComplexityMix;
  proteinRotation?: string[];
  cuisineVariety?: string[];
  cookTimes?: CookTimeEntry[];
  shoppingHighlights?: ShoppingHighlight[];
  unusedRecipes?: SwapCandidate[];
  groceryStaples?: ProposedStaple[];
  carryoverItems?: ProposedCarryover[];
  suggestions?: ProposedSuggestion[];
}

export interface AlternativeMeal {
  recipeId: string;
  recipeName: string;
  complexity: string;
  reasoning: string;
  adaptations?: ProposedAdaptation[];
  sides?: ProposedSide[];
}

export interface SlotAlternatives {
  day: string;
  mealType: string;
  alternatives: AlternativeMeal[];
}

export interface MealAlternativesPayload {
  slots: SlotAlternatives[];
}

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolName: string; toolUseId: string }
  | { type: "tool_progress"; toolName: string }
  | { type: "tool_complete"; toolUseId: string; toolName: string; durationMs?: number; isError?: boolean }
  | { type: "tool_result"; toolName: string; summary: string; durationMs?: number }
  | { type: "message_complete"; text: string }
  | { type: "meal_proposal"; proposal: MealProposal }
  | { type: "meal_alternatives"; alternatives: MealAlternativesPayload }
  | { type: "meal_options"; payload: MealOptionsPayload }
  | { type: "plan_draft"; payload: PlanDraftPayload }
  | { type: "week_roundout"; payload: WeekRoundoutPayload }
  | { type: "session_id"; sessionId: string }
  | { type: "status"; message: string }
  | { type: "heartbeat" }
  | { type: "error"; message: string }
  | { type: "done" };

export async function* runPlanningTurn(params: {
  claudeSessionId?: string;
  userMessage: string;
  weekOf: string;
  mode?: "legacy" | "wizard";
}): AsyncGenerator<StreamEvent> {
  const { claudeSessionId, userMessage, weekOf, mode = "legacy" } = params;

  const mcpServer = createMealPlannerServer();

  // In wizard mode the client sends self-contained PHASE messages that must
  // reach the model verbatim (the phase prefix drives routing), so never
  // prepend the legacy intro. Legacy mode is byte-identical to before.
  const prompt =
    mode === "wizard"
      ? userMessage
      : claudeSessionId
        ? userMessage
        : `I'd like to plan meals for the week of ${weekOf}. ${userMessage}`;

  const options = {
    systemPrompt: mode === "wizard" ? WIZARD_PLANNER_SYSTEM_PROMPT : MEAL_PLANNER_SYSTEM_PROMPT,
    tools: [] as string[],
    mcpServers: { "meal-planner-db": mcpServer },
    allowedTools: ["mcp__meal-planner-db__*"],
    permissionMode: "bypassPermissions" as const,
    includePartialMessages: true,
    model: "sonnet",
    maxTurns: 20,
    ...(claudeSessionId ? { resume: claudeSessionId } : {}),
  };

  const TAG = "[meal-planner:plan]";
  const turnStart = Date.now();
  console.log(`${TAG} Turn started`);

  try {
    const session = query({ prompt, options });
    let currentToolName = "";
    let toolStartTime = 0;
    const toolStarts = new Map<string, { name: string; startedAt: number }>();
    let planPresented = false;

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
            event.content_block.type === "tool_use" &&
            !planPresented
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
          // After plan was presented and its tool result returned, Claude's
          // next message is the follow-up text ("Here's your plan!"). Capture
          // it, then close the session to prevent further tool calls / token use.
          if (planPresented) {
            const postTextBlocks = msg.message.content.filter(
              (block) => block.type === "text",
            );
            const postText = postTextBlocks
              .map((block) => (block as { type: "text"; text: string }).text)
              .join("");
            if (postText) {
              yield { type: "message_complete", text: postText };
            }
            console.log(`${TAG} Closing after plan presentation (${Date.now() - turnStart}ms)`);
            yield { type: "done" };
            try { session.close(); } catch { /* session may already be closing */ }
            return;
          }

          // Check for present_meal_plan / present_alternatives tool calls in the message
          for (const block of msg.message.content) {
            if (block.type === "tool_use" && block.name === "mcp__meal-planner-db__present_meal_plan") {
              const input = block.input as MealProposal;
              yield { type: "meal_proposal", proposal: input };
              planPresented = true;
            }
            if (block.type === "tool_use" && block.name === "mcp__meal-planner-db__present_alternatives") {
              const input = block.input as MealAlternativesPayload;
              yield { type: "meal_alternatives", alternatives: input };
              planPresented = true;
            }
            // Wizard present tools — same intercept-and-close flow. These only
            // fire in wizard mode (the legacy prompt never calls them), so the
            // legacy path stays byte-identical.
            if (block.type === "tool_use" && block.name === "mcp__meal-planner-db__present_meal_options") {
              yield { type: "meal_options", payload: block.input as MealOptionsPayload };
              planPresented = true;
            }
            if (block.type === "tool_use" && block.name === "mcp__meal-planner-db__present_plan_draft") {
              yield { type: "plan_draft", payload: block.input as PlanDraftPayload };
              planPresented = true;
            }
            if (block.type === "tool_use" && block.name === "mcp__meal-planner-db__present_week_roundout") {
              yield { type: "week_roundout", payload: block.input as WeekRoundoutPayload };
              planPresented = true;
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
