import { query } from "@anthropic-ai/claude-agent-sdk";
import { CATEGORY_MAP } from "./categorize-map.js";
import { CATEGORY_ORDER } from "./categorize-categories.js";

export interface CategorizationResult {
  input: string;
  displayName: string;
  category: string;
  aliases: string[];
}

const VALID_CATEGORIES = new Set(CATEGORY_ORDER);

const SYSTEM_PROMPT = `You are a grocery item categorization assistant. Given one or more grocery/pantry item names, return structured data for each.

You MUST respond with ONLY a valid JSON array (no markdown, no code fences, no extra text).

Each element:
{
  "input": "the original input text",
  "displayName": "Properly Capitalized Name",
  "category": "one of the valid categories",
  "aliases": ["alternate name 1", "alternate name 2"]
}

Valid categories: ${CATEGORY_ORDER.join(", ")}

Rules:
- displayName: proper English title case, standardized (e.g. "chkn breast" → "Chicken Breast", "evoo" → "Extra Virgin Olive Oil")
- category: must be exactly one of the valid categories listed above
- aliases: 2-5 common alternate names, abbreviations, or variations people might use. Always lowercase. Include plural/singular forms.
- For ambiguous items, pick the most common interpretation
- Correct typos and abbreviations in displayName

Respond with ONLY the JSON array.`;

/**
 * Normalize input for lookup: lowercase, trim, strip common trailing "s" for plurals.
 */
function normalizeForLookup(input: string): string {
  const cleaned = input.toLowerCase().trim();
  // Try exact match first, then try without trailing "s" for simple plurals
  if (CATEGORY_MAP.has(cleaned)) return cleaned;
  if (cleaned.endsWith("s") && CATEGORY_MAP.has(cleaned.slice(0, -1))) {
    return cleaned.slice(0, -1);
  }
  return cleaned;
}

/**
 * Look up an item in the local categorization map.
 * Returns null if not found.
 */
function localLookup(input: string): CategorizationResult | null {
  const key = normalizeForLookup(input);
  const entry = CATEGORY_MAP.get(key);
  if (!entry) return null;
  return {
    input,
    displayName: entry.displayName,
    category: entry.category,
    aliases: [],
  };
}

/**
 * Categorize items using Claude Haiku as a fallback.
 * Batches multiple items into a single API call.
 */
async function claudeCategorize(
  inputs: string[],
): Promise<CategorizationResult[]> {
  const prompt =
    inputs.length === 1
      ? `Categorize this grocery item: "${inputs[0]}"`
      : `Categorize these grocery items:\n${inputs.map((i, idx) => `${idx + 1}. "${i}"`).join("\n")}`;

  const session = query({
    prompt,
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
      for (const block of msg.message.content) {
        if (block.type === "text") {
          responseText += (block as { type: "text"; text: string }).text;
        }
      }
    }
  }

  if (!responseText.trim()) {
    // Return basic fallback for each input
    return inputs.map((input) => ({
      input,
      displayName: titleCase(input),
      category: "other",
      aliases: [],
    }));
  }

  // Strip markdown code fences if present
  let jsonText = responseText.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\n?/, "")
      .replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(jsonText);
    const results = Array.isArray(parsed) ? parsed : [parsed];

    return results.map(
      (r: {
        input?: string;
        displayName?: string;
        category?: string;
        aliases?: string[];
      }, idx: number) => ({
        input: r.input ?? inputs[idx] ?? "",
        displayName: r.displayName ?? titleCase(inputs[idx] ?? ""),
        category:
          r.category && VALID_CATEGORIES.has(r.category)
            ? r.category
            : "other",
        aliases: Array.isArray(r.aliases) ? r.aliases : [],
      }),
    );
  } catch {
    // JSON parse failed — return basic fallback
    return inputs.map((input) => ({
      input,
      displayName: titleCase(input),
      category: "other",
      aliases: [],
    }));
  }
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

/**
 * Categorize one or more grocery items.
 * Uses local lookup for known items, falls back to Claude Haiku for unknown ones.
 * Returns results in the same order as inputs.
 */
export async function categorizeItems(
  inputs: string[],
): Promise<CategorizationResult[]> {
  const results: (CategorizationResult | null)[] = new Array(inputs.length).fill(null);
  const unknowns: Array<{ input: string; index: number }> = [];

  // First pass: local lookup
  for (let i = 0; i < inputs.length; i++) {
    const local = localLookup(inputs[i]);
    if (local) {
      results[i] = local;
    } else {
      unknowns.push({ input: inputs[i], index: i });
    }
  }

  // Second pass: Claude fallback for unknowns
  if (unknowns.length > 0) {
    const claudeResults = await claudeCategorize(
      unknowns.map((u) => u.input),
    );

    for (let i = 0; i < unknowns.length; i++) {
      results[unknowns[i].index] = claudeResults[i] ?? {
        input: unknowns[i].input,
        displayName: titleCase(unknowns[i].input),
        category: "other",
        aliases: [],
      };
    }
  }

  return results as CategorizationResult[];
}
