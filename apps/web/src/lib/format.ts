/**
 * Small, dependency-free formatting helpers.
 */

/**
 * Format a duration in minutes as a compact human string.
 *
 * - `45`  -> `"45m"`
 * - `60`  -> `"1h"`
 * - `85`  -> `"1h 25m"`
 * - `0` / negative / non-finite -> `"0m"`
 */
export function formatMinutes(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "0m";
  const mins = Math.round(total);
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

// Common named HTML entities (exact case). Numeric entities are handled directly.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  sbquo: "‚",
  bull: "•",
  middot: "·",
  deg: "°",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac12: "½",
  frac13: "⅓",
  frac14: "¼",
  frac34: "¾",
  euro: "€",
  cent: "¢",
  pound: "£",
  eacute: "é",
  Eacute: "É",
  egrave: "è",
  agrave: "à",
  aacute: "á",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  ccedil: "ç",
  ouml: "ö",
  uuml: "ü",
  auml: "ä",
};

/**
 * Decode numeric (`&#241;`, `&#xF1;`) and common named (`&nbsp;`, `&amp;`,
 * `&ntilde;`) HTML entities without any DOM dependency. Unknown entities are
 * left untouched. Safe to call on plain strings (no-op when no `&` present).
 *
 * Surface agents use this for HEB product names, which arrive HTML-encoded.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || input.indexOf("&") === -1) return input;
  return input.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
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
  });
}
