import { marked } from 'marked';

const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;
const SHA256 = /\b[a-f0-9]{64}\b/gi;
const SHA1 = /\b[a-f0-9]{40}\b/gi;
const MD5 = /\b[a-f0-9]{32}\b/gi;

function linkify(html: string): string {
  const parts = html.split(/(<code[^>]*>[\s\S]*?<\/code>)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      // encodeURIComponent the query value: the hex/IP regexes can't emit
      // attribute-breaking chars today, but this keeps the scraped→HTML
      // path correct if a looser IOC pattern is ever added here.
      const link = (m: string) => `<a class="ioc-link" href="/dfir/ioc-check?q=${encodeURIComponent(m)}">${m}</a>`;
      return part.replace(SHA256, link).replace(SHA1, link).replace(MD5, link).replace(IPV4, link);
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

export function renderMarkdown(md: string): string {
  // Strip dangerous tags from the markdown source first: marked treats lines
  // beginning with raw HTML as a single block and won't render inline markdown
  // inside them, so post-render stripping alone would discard surrounding text.
  const presanitized = sanitizeHtml(md);
  const html = marked.parse(presanitized, { async: false }) as string;
  const linked = linkify(html);
  return sanitizeHtml(linked);
}
