import { query } from "@anthropic-ai/claude-agent-sdk";
import type { CreateRecipeInput } from "@meal-planner/types";
import { normalize } from "../normalize.js";

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Your job is to extract structured recipe data from raw text.

The user will provide text that contains a recipe — it might be from an email, a text message, a document, or copy-pasted from a website.

You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) matching this exact structure:

{
  "name": "Recipe Name",
  "description": "Brief description",
  "ingredients": [
    { "name": "ingredient name", "quantity": 2, "unit": "cup", "category": "produce" }
  ],
  "steps": ["Step 1", "Step 2"],
  "cookTime": 30,
  "prepTime": 15,
  "servings": 4,
  "tags": ["tag1", "tag2"],
  "categories": ["dinner"],
  "complexity": "standard"
}

Rules:
- quantity must be a number (convert fractions: 1/2 = 0.5)
- unit: cup, tbsp, tsp, oz, lb, g, ml, clove, can, piece, etc.
- category: produce, meat, seafood, dairy, pantry, spices, canned, frozen, bakery, condiments, other
- complexity: "staple" (very simple), "standard" (typical), "involved" (complex)
- cookTime and prepTime in minutes; estimate if not stated
- tags: include cuisine type, main protein, descriptors
- If the text does not contain a recipe, respond with: {"error": "No recipe found in the provided text"}
- If information is missing, make reasonable defaults (e.g. servings: 4)

Respond with ONLY the JSON. No other text.`;

export type TextParseResult =
  | { success: true; recipe: CreateRecipeInput }
  | { success: false; error: string };

/**
 * Parse a recipe from unstructured text using the Agent SDK.
 * Uses the Claude subscription (no API key needed).
 */
export async function parseRecipeFromText(
  text: string,
): Promise<TextParseResult> {
  try {
    const session = query({
      prompt: text,
      options: {
        systemPrompt: SYSTEM_PROMPT,
        tools: [],
        mcpServers: {},
        permissionMode: "bypassPermissions" as const,
        model: "haiku",
        maxTurns: 1,
      },
    });

    let responseText = "";

    for await (const msg of session) {
      if (msg.type === "assistant") {
        // Collect text from the assistant's response
        for (const block of msg.message.content) {
          if (block.type === "text") {
            responseText += (block as { type: "text"; text: string }).text;
          }
        }
      } else if (msg.type === "result" && msg.subtype !== "success") {
        return {
          success: false,
          error: (msg as { result?: string }).result ?? "Agent SDK error",
        };
      }
    }

    if (!responseText.trim()) {
      return { success: false, error: "No response from Claude" };
    }

    // Strip markdown code fences if present
    let jsonText = responseText.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    // Parse the JSON response
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return {
        success: false,
        error: "Claude returned invalid JSON. Try providing clearer recipe text.",
      };
    }

    // Check for error response
    if (parsed.error) {
      return { success: false, error: String(parsed.error) };
    }

    // Normalize and validate
    const normalized = normalize(parsed);
    if (!normalized.success) {
      return {
        success: false,
        error: `Validation failed: ${normalized.errors.join(", ")}`,
      };
    }

    return { success: true, recipe: normalized.data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse recipe",
    };
  }
}
