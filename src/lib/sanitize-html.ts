/**
 * Centralized HTML sanitization for dangerouslySetInnerHTML usage.
 *
 * Every component that renders user-supplied or upstream-sourced HTML
 * (CVE descriptions, AI output, markdown bodies) MUST use this utility
 * instead of raw `dangerouslySetInnerHTML`. The DOMPurify config is
 * restrictive: no scripts, no event handlers, no javascript: URIs.
 *
 * Usage:
 *   import { sanitizeHtml } from '../../lib/sanitize-html';
 *   const safe = await sanitizeHtml(rawHtml);
 *   <div dangerouslySetInnerHTML={{ __html: safe }} />
 *
 * NOTE: Uses dynamic import for isomorphic-dompurify (lazy-loaded ~80KB).
 * For synchronous contexts, use escapeHtml() instead.
 */

// Default restrictive config — no scripts, no event handlers, no javascript: URIs.
const SANITIZE_CONFIG = {
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|#|\/):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  ADD_ATTR: ['title', 'target', 'rel'],
  ALLOWED_TAGS: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'br',
    'hr',
    'ul',
    'ol',
    'li',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'strike',
    'del',
    'a',
    'code',
    'pre',
    'blockquote',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'span',
    'div',
    'sub',
    'sup',
    'img',
    'figure',
    'figcaption',
    'details',
    'summary',
    'dl',
    'dt',
    'dd',
  ],
};

// Strict config for AI-generated content — no images.
const STRICT_CONFIG = {
  ...SANITIZE_CONFIG,
  ALLOWED_TAGS: SANITIZE_CONFIG.ALLOWED_TAGS.filter((t: string) => t !== 'img' && t !== 'figure' && t !== 'figcaption'),
};

/**
 * Sanitize HTML for general display (markdown bodies, CVE descriptions, etc.).
 * Uses a restrictive config: no scripts, no event handlers, no javascript: URIs.
 *
 * Dynamically imports DOMPurify to avoid bloating the initial bundle.
 */
export async function sanitizeHtml(html: string): Promise<string> {
  const { default: DOMPurify } = await import('isomorphic-dompurify');
  return String(DOMPurify.sanitize(html, SANITIZE_CONFIG));
}

/**
 * Sanitize AI-generated HTML content. Stricter than `sanitizeHtml` —
 * removes images that an LLM might generate via prompt injection.
 */
export async function sanitizeAiHtml(html: string): Promise<string> {
  const { default: DOMPurify } = await import('isomorphic-dompurify');
  return String(DOMPurify.sanitize(html, STRICT_CONFIG));
}

/**
 * Escape HTML entities in plain text. Synchronous — use this BEFORE
 * applying regex-based markdown rendering. Ensures that any HTML in
 * the original text is escaped before transformation.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
