import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Recipe, UpdateRecipeInput } from "@meal-planner/types";

export interface EnhanceResult {
  changes: UpdateRecipeInput;
  summary: string[];
}

const SYSTEM_PROMPT = `You are a recipe enrichment engine. Your job is to add metadata and structured annotations to recipes — not to fix or edit the existing content. You are adding objective, non-destructive enrichment data.

## What to add

**enrichedStepSections** (ALWAYS generate):
An array of sections. Each section is exactly: { "header"?: "<same header as the matching stepSections section, omit if none>", "steps": [ ... ] }. Mirror the exact section structure and step text from stepSections — do not modify the step text in any way.

Each entry in a section's "steps" array MUST be an object with this exact shape (NOT a bare string):
{ "text": "<the step text copied VERBATIM from stepSections>", "ingredients": [ ... ] }

The "ingredients" array lists which recipe ingredients are used in that step. Each ingredient entry: { "name": "<must match ingredient name exactly>", "prep": "<how to prep it at this point, e.g. diced, minced>", "quantityOverride": <number, only when the step uses a partial amount of the total ingredient> }. Omit "prep" if none applies. Omit "quantityOverride" if the full quantity is used. Steps with no ingredients (e.g. "Preheat oven to 375°F.") should still be an object with the "text" key and an empty or omitted "ingredients" array.

**Metadata** (only add/update fields that are missing or weak — do not overwrite good existing values):
- tags: add relevant lowercase tags — main ingredient, cuisine, cooking method, dietary notes, occasion (e.g. "chicken", "italian", "one-pan", "gluten-free", "weeknight"). Merge with existing tags, never replace them.
- categories: meal type(s) in lowercase (dinner, lunch, breakfast, snack, dessert, side, appetizer)
- complexity: "staple" = simple protein + sides, no recipe really needed; "standard" = familiar recipe, you know it well; "involved" = new, complex, or multi-component — follow steps carefully
- equipment: key non-obvious equipment inferred from the steps (e.g. "large skillet", "9x13 baking dish", "stand mixer", "immersion blender"). Omit basics like "knife" or "bowl".
- storage: MUST be an object with this exact shape (NOT a bare string): { "makeAhead"?: "<make-ahead guidance>", "refrigerate"?: "<fridge shelf life / reheating>", "freeze"?: "<whether and how it freezes>" }. Include only the keys that apply; omit the whole field if nothing applies.
- cuisineType: primary cuisine if identifiable (italian, mexican, asian, american, mediterranean, indian, thai, korean, japanese, greek, french, cajun, etc.)
- primaryProtein: the main protein if any — chicken, beef, pork, salmon, shrimp, tofu, turkey, lamb — or "none"
- notes: 1-2 practical cooking tips if the recipe has none and tips are obvious (e.g. "Don't overcrowd the pan or the chicken will steam instead of sear."). Skip if notes already exist or nothing obvious to add.

## What NOT to change
- Do not modify name, description, stepSections, ingredientSections, quantities, units, or any other existing recipe content
- enrichedStepSections must mirror stepSections exactly — copy step text verbatim, same section structure

## Return format
Return ONLY a raw JSON object. No markdown code blocks, no explanation, no text before or after the JSON.

{
  "changes": {
    // Only fields you are adding/updating — always include enrichedStepSections
    // Omit fields that already have good values
  },
  "summary": [
    // Short human-readable strings describing what was added, e.g.:
    // "Added ingredient annotations for 12 steps"
    // "Added tags: italian, pasta, weeknight, comfort-food"
    // "Filled in cuisine type, primary protein, and equipment"
  ]
}

Even if nothing else needs to be added, always include enrichedStepSections in the changes object.`;

export async function enhanceRecipe(recipe: Recipe): Promise<EnhanceResult> {
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

  const prompt = `Please enrich this recipe with annotations and metadata:\n\n${JSON.stringify(recipeForClaude, null, 2)}`;

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

  let parsed: { changes?: UpdateRecipeInput; summary?: string[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Claude returned invalid JSON — try again");
  }

  const changes: UpdateRecipeInput = parsed.changes ?? {};

  // Shape validation — the model sometimes returns weaker shapes than the types
  // require, which would then store fine but never render.
  // 1. storage: a bare string is coerced to { refrigerate: <string> } so it renders.
  if (typeof (changes as { storage?: unknown }).storage === "string") {
    changes.storage = { refrigerate: (changes as unknown as { storage: string }).storage };
  }
  // 2. enrichedStepSections: every step must be an EnrichedStep object with a
  //    "text" key. Bare-string steps (or missing "text") are unusable — reject.
  if (Array.isArray(changes.enrichedStepSections)) {
    for (const section of changes.enrichedStepSections) {
      const steps = (section as { steps?: unknown })?.steps;
      if (!Array.isArray(steps)) {
        throw new Error("Claude returned malformed enriched steps — try again");
      }
      for (const step of steps) {
        if (
          typeof step !== "object" ||
          step === null ||
          typeof (step as { text?: unknown }).text !== "string"
        ) {
          throw new Error("Claude returned malformed enriched steps — try again");
        }
      }
    }
  }

  return {
    changes,
    summary: Array.isArray(parsed.summary) ? parsed.summary : [],
  };
}
