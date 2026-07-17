import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Recipe, UpdateRecipeInput } from "@meal-planner/types";

export interface FixSuggestion {
  key: "name" | "description" | "steps" | "ingredients";
  label: string;
  patch: UpdateRecipeInput;
}

export interface FixResult {
  suggestions: FixSuggestion[];
}

const SYSTEM_PROMPT = `You are a recipe editor. Your job is to identify and fix formatting, grammar, and structural issues in recipes. You return discrete, independently-applicable suggestions so the user can choose which fixes to accept.

## Fix actions

**Name** (key: "name"):
- Ensure proper title case.

**Description** (key: "description"):
- 1-2 sentences of clear, natural prose. Remove HTML entities, markdown, or marketing language. Start with what the dish is and why it's good.

**Steps** (key: "steps"):
- Each step begins with a capital letter, ends with a period, uses imperative voice ("Add the garlic" not "You should add the garlic" or "Adding the garlic").
- Step splitting: Only split a step when it is clearly a parsing artifact — multiple unrelated actions collapsed into a single line during poor web scraping or import. Do NOT split steps where two actions are part of the same logical cooking motion, or where a professional chef would naturally write them together. A step that contains two related sentences is not automatically a splitting candidate. When in doubt, do not split.
- Do NOT invent new actions or content — only clean and reorganize what is already present.

**Ingredients** (key: "ingredients"):
- Names: consistent lowercase (e.g. "garlic cloves" not "Garlic Cloves" or "GARLIC").
- Units: use standard short forms — tsp, tbsp, cup, oz, lb, g, kg, ml. Remove periods from abbreviations. Use "oz" not "ounce", "tbsp" not "tablespoon" or "T".
- Categories: fill in missing values. Choose from: produce, meat, seafood, dairy, pantry, spices, bakery, frozen, deli, beverages.
- Section headers: title case.

## What NOT to change
- Do not change ingredient quantities.
- Do not invent new actions, ingredients, steps, or any other content.
- Do not change sourceUrl or imageUrl.
- Do not change enrichedStepSections, tags, categories, complexity, equipment, storage, cuisineType, primaryProtein, or notes — those are handled separately.
- Keep the overall character and style of the recipe — just clean it up.

## Return format
Return ONLY a raw JSON object. No markdown code blocks, no explanation, no text before or after the JSON.

{
  "suggestions": [
    {
      "key": "steps",
      "label": "Fixed capitalization and punctuation in 8 steps",
      "patch": { "stepSections": [ ...complete replacement array... ] }
    },
    {
      "key": "ingredients",
      "label": "Standardized units and filled in 4 missing categories",
      "patch": { "ingredientSections": [ ...complete replacement array... ] }
    }
  ]
}

Rules:
- Only include a suggestion if there are actual changes to make for that key. Omit a key entirely if nothing needs fixing.
- Each patch contains ONLY the field(s) changed by that suggestion — always complete replacement arrays.
- Never combine two different keys into one suggestion object.
- The "label" should be specific: say what changed and how many items were affected.`;

export async function fixRecipe(recipe: Recipe): Promise<FixResult> {
  const {
    id: _id,
    createdAt: _ca,
    updatedAt: _ua,
    ingredientNames: _in,
    avgRating: _ar,
    lastCookedAt: _lc,
    enrichedStepSections: _ess,
    ...recipeForClaude
  } = recipe;

  const prompt = `Please review this recipe and suggest fixes for any formatting, grammar, or structural issues:\n\n${JSON.stringify(recipeForClaude, null, 2)}`;

  const options = {
    systemPrompt: SYSTEM_PROMPT,
    tools: [] as string[],
    mcpServers: {} as Record<string, never>,
    allowedTools: [] as string[],
    permissionMode: "bypassPermissions" as const,
    includePartialMessages: false,
    model: "sonnet",
    maxTurns: 1,
  };

  const session = query({ prompt, options });
  let responseText = "";

  for await (const msg of session) {
    if (msg.type === "assistant") {
      const textBlocks = (msg.message.content as Array<{ type: string; text?: string }>).filter(
        (block) => block.type === "text",
      );
      // Accumulate across messages — a multi-message reply must not be truncated
      // to only its final chunk.
      responseText += textBlocks.map((block) => block.text ?? "").join("");
    }
  }

  if (!responseText) {
    throw new Error("No response from Claude");
  }

  const cleaned = responseText.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let parsed: { suggestions?: FixSuggestion[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Claude returned invalid JSON — try again");
  }

  return {
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
  };
}
