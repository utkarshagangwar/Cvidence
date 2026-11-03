// Board HTML -> plain text. The result is only ever shown as text (React escapes
// it), never as HTML, so a hostile posting can't inject markup into the app.

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-",
  hellip: "...", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', bull: "-", middot: "-", trade: "", reg: "", copy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    }
    return NAMED[code.toLowerCase()] ?? m;
  });
}

/**
 * HTML to readable text: block tags become line breaks, list items become "- ",
 * scripts and styles are dropped, entities are decoded.
 * Greenhouse sends HTML that is itself entity-escaped, so pass `escaped: true`
 * to decode once before stripping tags (and once more after).
 */
export function htmlToText(html: string, opts: { escaped?: boolean } = {}): string {
  let s = opts.escaped ? decodeEntities(html) : html;
  s = s
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section|article|header|footer|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  s = decodeEntities(s);
  return s
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n- /g, "\n- ") // no blank line before a list item
    .trim();
}
