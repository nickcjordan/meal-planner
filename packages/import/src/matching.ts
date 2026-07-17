/**
 * Shared ingredient-name matcher. Used wherever a name comparison drives a
 * decision — destructive ones (swap rename at import, adaptation substitution at
 * merge, pantry suppression) must use `namesMatchExact`; display-only suggestion
 * contexts may additionally use `nameIsSubset`. Policy: false negatives are
 * acceptable, false positives are not — so "olive oil" matches "extra virgin
 * olive oil", but "milk" never matches "coconut milk".
 */

/** Conservative modifier words dropped during normalization so descriptive
 *  prefixes don't block an otherwise-exact match. */
const MODIFIER_STOPLIST = new Set([
  "fresh",
  "organic",
  "extra",
  "virgin",
  "large",
  "small",
  "medium",
  "boneless",
  "skinless",
  "raw",
]);

/** Strip a trailing plural (s/es), leaving irregulars mostly intact. Consistent
 *  transformation on both sides is what matters for matching. */
function singularize(token: string): string {
  if (token.endsWith("ss")) return token; // glass, dress — not a plural
  if (token.endsWith("ies") && token.length > 4) return token.slice(0, -3) + "y"; // berries → berry
  // "es" is only a distinct plural marker after these stems; elsewhere it's just "s".
  if (/(oes|ches|shes|xes|zes|ses)$/.test(token) && token.length > 3) {
    return token.slice(0, -2); // tomatoes → tomato, boxes → box
  }
  if (token.endsWith("s") && token.length > 2) return token.slice(0, -1); // olives → olive
  return token;
}

/**
 * Normalize an ingredient name into a bag of comparison tokens: lowercase, strip
 * punctuation, split on whitespace, singularize each token, and drop modifier
 * stoplist words. May return an empty array (e.g. "", or a name consisting only
 * of stoplist words).
 */
export function normalizeTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singularize)
    .filter((t) => !MODIFIER_STOPLIST.has(t));
}

/**
 * True when two names have identical token *sets* after normalization. Use for
 * destructive operations. An empty token set on either side never matches.
 */
export function namesMatchExact(a: string, b: string): boolean {
  const ta = new Set(normalizeTokens(a));
  const tb = new Set(normalizeTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  if (ta.size !== tb.size) return false;
  for (const t of ta) {
    if (!tb.has(t)) return false;
  }
  return true;
}

/**
 * True when `a`'s tokens are a subset of `b`'s tokens after normalization (so
 * "milk" is a subset of "coconut milk"). Use only for non-destructive,
 * display-only suggestions. An empty token set on either side never matches.
 */
export function nameIsSubset(a: string, b: string): boolean {
  const ta = new Set(normalizeTokens(a));
  const tb = new Set(normalizeTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  for (const t of ta) {
    if (!tb.has(t)) return false;
  }
  return true;
}
