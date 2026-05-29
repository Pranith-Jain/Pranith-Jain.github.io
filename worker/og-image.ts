/**
 * Dynamic OG image generator for blog posts and briefings.
 *
 * Generates SVG-based social preview images at the edge in <5ms.
 * SVG is natively supported as og:image by Twitter, Facebook, LinkedIn,
 * Slack, Discord, and Telegram. No rasterisation needed — the SVG IS
 * the image.
 *
 * Route: /api/v1/og-image/:type/:slug
 *   - type: 'blog' | 'briefing'
 *   - slug: the post/briefing slug
 *
 * Returns: image/svg+xml with Cache-Control for 24h.
 */

const WIDTH = 1200;
const HEIGHT = 630;

/** Escape XML special chars for safe SVG text embedding. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Truncate text to fit roughly within maxWidth pixels at a given fontSize. */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1).trimEnd() + '…';
}

/** Split a long title into two lines at the nearest word boundary. */
function wrapTitle(title: string, maxCharsPerLine: number): string[] {
  if (title.length <= maxCharsPerLine) return [title];
  const words = title.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxCharsPerLine && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3); // Max 3 lines
}

interface OgImageData {
  title: string;
  subtitle: string;
  type: 'blog' | 'briefing' | 'research' | 'default';
  date?: string;
  tags?: string[];
}

/**
 * Generate an SVG OG image.
 *
 * Design: dark gradient background matching the site's brand, bold title,
 * subtitle, type badge, and a subtle grid pattern for visual depth.
 */
export function generateOgSvg(data: OgImageData): string {
  const { title, subtitle, type, date, tags } = data;

  // Brand colors by type
  const accentMap: Record<string, { primary: string; secondary: string; badge: string }> = {
    blog: { primary: '#6366f1', secondary: '#818cf8', badge: '#4f46e5' },
    briefing: { primary: '#f43f5e', secondary: '#fb7185', badge: '#e11d48' },
    research: { primary: '#0ea5e9', secondary: '#38bdf8', badge: '#0284c7' },
    default: { primary: '#2c3ee5', secondary: '#435ef1', badge: '#1e3aaf' },
  };
  const accent = accentMap[type] ?? accentMap.default;

  // Type label
  const typeLabel: Record<string, string> = {
    blog: 'BLOG POST',
    briefing: 'THREAT BRIEFING',
    research: 'RESEARCH',
    default: 'PRANITH JAIN',
  };

  // Wrap title
  const titleLines = wrapTitle(truncate(title, 80), 38);
  const titleY = titleLines.length === 1 ? 280 : titleLines.length === 2 ? 250 : 230;

  // Build title tspans
  const titleTspans = titleLines
    .map((line, i) => `<tspan x="80" dy="${i === 0 ? 0 : 68}">${esc(line)}</tspan>`)
    .join('\n          ');

  // Tags
  const tagElements = (tags ?? [])
    .slice(0, 4)
    .map(
      (tag, i) =>
        `<rect x="${80 + i * 160}" y="470" rx="14" ry="14" width="148" height="28" fill="${accent.badge}" opacity="0.3"/>
       <text x="${154 + i * 160}" y="490" text-anchor="middle" fill="${accent.secondary}" font-family="monospace" font-size="13" font-weight="500">${esc(truncate(tag, 18))}</text>`
    )
    .join('\n      ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <!-- Accent glow -->
    <radialGradient id="glow" cx="85%" cy="20%" r="50%">
      <stop offset="0%" stop-color="${accent.primary}" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="${accent.primary}" stop-opacity="0"/>
    </radialGradient>
    <!-- Grid pattern -->
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${accent.primary}" stroke-opacity="0.06" stroke-width="0.5"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="6" height="${HEIGHT}" fill="${accent.primary}"/>

  <!-- Type badge -->
  <rect x="80" y="140" rx="4" ry="4" width="${typeLabel[type]?.length ? typeLabel[type].length * 13.5 + 24 : 120}" height="36" fill="${accent.badge}"/>
  <text x="92" y="165" fill="white" font-family="'SF Mono', 'Fira Code', 'Cascadia Code', monospace" font-size="16" font-weight="700" letter-spacing="2">${esc(typeLabel[type] ?? 'PRANITH JAIN')}</text>

  <!-- Title -->
  <text fill="white" font-family="'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif" font-size="56" font-weight="800" line-height="1.15">
    <tspan x="80" y="${titleY}">${esc(titleLines[0] ?? '')}</tspan>
          ${titleTspans.replace(`<tspan x="80" dy="0">`, '')}
  </text>

  <!-- Subtitle / excerpt -->
  <text fill="#94a3b8" font-family="'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif" font-size="24" font-weight="400">
    <tspan x="80" y="${titleY + titleLines.length * 68 + 30}">${esc(truncate(subtitle, 90))}</tspan>
  </text>

  <!-- Tags -->
  ${tagElements}

  <!-- Bottom bar -->
  <rect x="0" y="580" width="${WIDTH}" height="50" fill="#0f172a" opacity="0.6"/>
  <line x1="0" y1="580" x2="${WIDTH}" y2="580" stroke="${accent.primary}" stroke-opacity="0.3" stroke-width="1"/>

  <!-- Author / site -->
  <text x="80" y="612" fill="#64748b" font-family="'SF Mono', 'Fira Code', monospace" font-size="16" font-weight="500">
    pranithjain.qzz.io${date ? ` · ${esc(date)}` : ''}
  </text>

  <!-- Logo mark -->
  <rect x="1060" y="588" rx="6" ry="6" width="36" height="36" fill="${accent.primary}"/>
  <text x="1078" y="614" text-anchor="middle" fill="white" font-family="'Inter', system-ui, sans-serif" font-size="16" font-weight="800">PJ</text>
  <text x="1108" y="612" fill="#64748b" font-family="'SF Mono', 'Fira Code', monospace" font-size="14" font-weight="500">Threat Intel</text>
</svg>`;
}

export interface OgImageInput {
  type: 'blog' | 'briefing' | 'research';
  slug: string;
  title: string;
  subtitle: string;
  date?: string;
  tags?: string[];
}

/**
 * Generate an OG image SVG response with proper caching headers.
 */
export function ogImageResponse(data: OgImageData, status = 200): Response {
  const svg = generateOgSvg(data);
  return new Response(svg, {
    status,
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, s-maxage=86400',
      'cdn-cache-control': 'public, max-age=604800',
    },
  });
}
