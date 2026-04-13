/**
 * Parse an ISO 8601 duration string into total minutes.
 *
 * Examples:
 *  - "PT30M"     -> 30
 *  - "PT1H30M"   -> 90
 *  - "PT1H"      -> 60
 *  - "PT45S"     -> 1 (rounds up)
 *  - "P0DT0H30M" -> 30
 *
 * Returns 0 if the string cannot be parsed.
 */
export function parseIsoDuration(iso: string | undefined | null): number {
  if (!iso || typeof iso !== "string") return 0;

  const match = iso.match(
    /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i,
  );
  if (!match) return 0;

  const days = parseInt(match[1] || "0", 10);
  const hours = parseInt(match[2] || "0", 10);
  const minutes = parseInt(match[3] || "0", 10);
  const seconds = parseInt(match[4] || "0", 10);

  return days * 24 * 60 + hours * 60 + minutes + Math.ceil(seconds / 60);
}

/**
 * Extract a number from a recipe yield string.
 *
 * Examples:
 *  - "4"            -> 4
 *  - "4 servings"   -> 4
 *  - "1 loaf"       -> 1
 *  - ["4 servings"] -> 4
 */
export function parseRecipeYield(
  value: string | number | string[] | undefined | null,
): number {
  if (value == null) return 4; // reasonable default
  if (typeof value === "number") return Math.max(1, Math.round(value));
  if (Array.isArray(value)) {
    // Prefer entries containing "serving", otherwise take first
    const servingEntry = value.find((v) =>
      /serving/i.test(v),
    );
    return parseRecipeYield(servingEntry || value[0]);
  }

  const match = String(value).match(/(\d+)/);
  return match ? Math.max(1, parseInt(match[1], 10)) : 4;
}
