import { marked } from 'marked';

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;
const SHA256 = /\b[a-f0-9]{64}\b/gi;
const SHA1 = /\b[a-f0-9]{40}\b/gi;
const MD5 = /\b[a-f0-9]{32}\b/gi;

function linkifyText(text: string): string {
  // encodeURIComponent the query value: the hex/IP regexes can't emit
  // attribute-breaking chars today, but this keeps the scraped→HTML
  // path correct if a looser IOC pattern is ever added here.
  const link = (m: string) => `<a class="ioc-link" href="/dfir/ioc-check?q=${encodeURIComponent(m)}">${m}</a>`;
  return text.replace(SHA256, link).replace(SHA1, link).replace(MD5, link).replace(IPV4, link);
}

/**
 * Walk the marked-rendered HTML and wrap bare IOC patterns (hashes, IPs)
 * in <a class="ioc-link"> links to the IOC checker. Three nesting zones
 * must be skipped or the rewriter corrupts the output:
 *   1. Inside <code>/<pre> blocks — keep verbatim (analyst pasted on purpose).
 *   2. Inside an existing <a>…</a> — would create invalid nested anchors;
 *      browsers auto-close the outer one and the original link breaks.
 *   3. Inside any tag's attribute value — e.g. `<a href="https://x/HASH">`.
 *      The OLD implementation matched HASH inside the href and inserted
 *      <a class="ioc-link"…> mid-attribute, which broke the outer quoting
 *      and made the URL render as raw text after the link.
 * The three-level split below makes each of those zones a no-touch region;
 * linkifyText runs only on actual text nodes outside all of them.
 */
function linkify(html: string): string {
  return html
    .split(/(<code[^>]*>[\s\S]*?<\/code>|<pre[^>]*>[\s\S]*?<\/pre>)/g)
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // <code>/<pre> — leave verbatim
      return seg
        .split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi)
        .map((s, j) => {
          if (j % 2 === 1) return s; // existing <a> — leave verbatim
          // Outside anchors: split on tag boundaries so attribute values
          // can't be matched. Only TEXT nodes (even indices) get rewritten.
          return s
            .split(/(<[^>]+>)/g)
            .map((t, k) => (k % 2 === 1 ? t : linkifyText(t)))
            .join('');
        })
        .join('');
    })
    .join('');
}

// Lightweight HTML sanitizer suitable for the Cloudflare Workers runtime,
// where a full DOMPurify (with jsdom or a browser DOM) is unavailable. Marked's
// output is already a known-safe HTML subset; this pass strips anything that
// could come from untrusted markdown source: <script>, <iframe>, on*=
// event-handler attributes, and javascript:/data: URLs.
const DANGEROUS_TAGS =
  /<\/?(?:script|iframe|object|embed|style|link|meta|base|form|input|button|noscript|svg|math)\b[^>]*>/gi;
const EVENT_HANDLER_ATTRS = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// Neutralise script-bearing URL schemes in any attribute that dereferences a
// URL. Covers javascript:, vbscript:, and data:text/html (data:image/* is
// intentionally still allowed so inline markdown images keep working).
const DANGEROUS_URL_ATTRS = /(\s(?:href|src|srcset|action|formaction|xlink:href)\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi;
// Inline style attributes enable CSS-based exfiltration / phishing overlays.
// Generated post content never legitimately needs them.
const STYLE_ATTRS = /\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

// Characters a browser silently drops from a URL before resolving its scheme.
// WHATWG URL parsing strips ASCII tab and newline anywhere in the input, and
// leading/trailing C0 controls + space. `java\nscript:` therefore navigates as
// `javascript:`. We must strip the same set before testing the scheme.
const URL_IGNORED_CHARS = /[\u0000-\u0020\u007f]/g;
// HTML named/numeric character references. Browsers decode these in attribute
// values BEFORE the URL is parsed, so `jav&#x61;script:` is `javascript:`.
// This is intentionally a small, well-known subset (enough to spell the
// dangerous schemes) rather than a full entity table.
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  tab: '\t',
  newline: '\n',
  colon: ':',
  sol: '/',
  semi: ';',
};
const HTML_ENTITY_RE = /&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi;

/**
 * Reduce a URL attribute value to the form the browser will actually resolve:
 * decode character references, then strip the characters URL parsing ignores.
 * Both steps are required — a scheme spelled with either an entity or an
 * embedded control character still navigates as that scheme.
 */
function normalizeUrlForSchemeCheck(value: string): string {
  const decoded = value.replace(HTML_ENTITY_RE, (match, hex, dec, name) => {
    if (hex) {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (dec) {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const key = String(name).toLowerCase();
    return Object.prototype.hasOwnProperty.call(HTML_ENTITY_MAP, key) ? HTML_ENTITY_MAP[key]! : match;
  });
  return decoded.replace(URL_IGNORED_CHARS, '').toLowerCase();
}

/** True if a URL attribute value resolves to a script-bearing scheme. */
function isDangerousUrlValue(raw: string): boolean {
  // `raw` is the raw attribute value INCLUDING its surrounding quotes (group 2
  // of DANGEROUS_URL_ATTRS). Strip them first: the quote characters are not
  // part of the URL, and leaving them in place would defeat the prefix checks
  // below.
  const unquoted = raw.length >= 2 && (raw.startsWith('"') || raw.startsWith("'")) ? raw.slice(1, -1) : raw;
  const value = normalizeUrlForSchemeCheck(unquoted);
  if (value === '') return false;
  if (value.startsWith('javascript:') || value.startsWith('vbscript:')) return true;
  if (value.startsWith('data:text/html')) return true;
  return false;
}

function sanitizeHtml(html: string): string {
  return (
    html
      .replace(DANGEROUS_TAGS, '')
      .replace(EVENT_HANDLER_ATTRS, '')
      .replace(STYLE_ATTRS, '')
      // Decode-then-test rather than regex-matching the raw scheme, so entity
      // encoded (`jav&#x61;script:`) and whitespace-split (`java\nscript:`)
      // variants are caught. Preserve the original quote character so we do not
      // rewrite markup we are leaving alone. Group 1 = `prefix`, group 2 = the
      // raw attribute value including its quotes.
      .replace(DANGEROUS_URL_ATTRS, (match: string, prefix: string, quoteAndValue: string) => {
        if (!isDangerousUrlValue(quoteAndValue)) return match;
        const quote = quoteAndValue.startsWith('"') ? '"' : quoteAndValue.startsWith("'") ? "'" : '"';
        return `${prefix}${quote}#${quote}`;
      })
  );
}

/**
 * Outer ceiling on the markdown source size we'll attempt to parse. Manual
 * admin posts are already body-bounded to 256 KB by `safeJsonBody`, and LLM
 * output is capped by `max_tokens` (~12 KB). 512 KB gives both paths
 * comfortable headroom while keeping `marked.parse` + the regex sanitiser
 * out of pathological territory. An oversize input is truncated with a
 * visible marker rather than rejected — a partial render is still useful
 * for debugging if a future code path manages to slip a giant blob through.
 */
const MAX_MD_BYTES = 512 * 1024;

/**
 * Rewrite anchors whose visible text IS the URL into anchors whose visible
 * text is just the host. Belt-and-braces backstop: even when the prompt
 * tells the LLM to use a source name as link text, the model sometimes
 * emits `[https://www.ransomlook.io/post/HASH](https://www.ransomlook.io/post/HASH)`
 * and the rendered References list becomes a wall of duplicated long URLs.
 * Catches `href` ≈ `text` (same URL, or text wraps href + extra query)
 * — every other anchor (ioc-link wrappers, named sources like "ransomlook.io")
 * has non-URL visible text and is left alone.
 */
function shortenUrlAnchorText(html: string): string {
  return html.replace(/<a\b([^>]*)>([^<]+)<\/a>/g, (match, attrs: string, text: string) => {
    const stripped = text.trim();
    if (!/^https?:\/\//i.test(stripped)) return match;
    try {
      const host = new URL(stripped).hostname.replace(/^www\./, '');
      return `<a${attrs}>${host}</a>`;
    } catch {
      return match;
    }
  });
}

export function renderMarkdown(md: string): string {
  const safeMd =
    new Blob([md]).size > MAX_MD_BYTES
      ? `${md.slice(0, MAX_MD_BYTES)}\n\n_…[post body truncated at ${MAX_MD_BYTES} bytes]_`
      : md;
  // Strip dangerous tags from the markdown source first: marked treats lines
  // beginning with raw HTML as a single block and won't render inline markdown
  // inside them, so post-render stripping alone would discard surrounding text.
  const presanitized = sanitizeHtml(safeMd);
  const html = marked.parse(presanitized, { async: false }) as string;
  const linked = linkify(html);
  const shortened = shortenUrlAnchorText(linked);
  return sanitizeHtml(shortened);
}
