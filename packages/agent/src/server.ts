import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { allTools } from "./tools.js";

export function createMealPlannerServer() {
  return createSdkMcpServer({
    name: "meal-planner-db",
    tools: allTools,
  });
}
