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
const DANGEROUS_URL_ATTRS =
  /(\s(?:href|src|srcset|action|formaction|xlink:href)\s*=\s*)(?:"\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^"]*"|'\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^']*'|(?:javascript|vbscript|data:text\/html)[^\s>]+)/gi;
// Inline style attributes enable CSS-based exfiltration / phishing overlays.
// Generated post content never legitimately needs them.
const STYLE_ATTRS = /\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

function sanitizeHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, '')
    .replace(EVENT_HANDLER_ATTRS, '')
    .replace(STYLE_ATTRS, '')
    .replace(DANGEROUS_URL_ATTRS, '$1"#"');
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
