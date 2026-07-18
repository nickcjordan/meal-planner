/**
 * Tiny, dependency-free HTML-entity decoder for HEB product names.
 *
 * HEB's GraphQL `displayName` arrives HTML-encoded (e.g. "Sweet Baby
 * Broccoli&nbsp;", "Ben &amp; Jerry's"). Those entities leak into the grocery
 * UI and — worse — pollute the match tokenizer with junk tokens like "nbsp".
 * We decode at the source (the matcher) so both the stored name and the
 * similarity comparison see clean text.
 *
 * This is a deliberate local copy: `packages/heb` must not depend on the web
 * app's `@/lib/format`. The web-side copy stays for decoding legacy data that
 * was persisted before this fix landed.
 */

// Common named entities seen in grocery product names. Numeric entities
// (`&#241;`, `&#xF1;`) are handled directly.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  reg: "®",
  copy: "©",
  trade: "™",
  deg: "°",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  eacute: "é",
  Eacute: "É",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
};

/**
 * Decode numeric and common named HTML entities. Unknown entities are left
 * untouched. No-op (returns the input) when the string contains no `&`.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || input.indexOf("&") === -1) return input;
  return input.replace(
    /&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, entity: string) => {
      if (entity[0] === "#") {
        const isHex = entity[1] === "x" || entity[1] === "X";
        const code = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      return NAMED_ENTITIES[entity] ?? match;
    },
  );
}
