import { BRAND } from './brand-tokens';
import type { ContentSlide, SlideKind } from './slide-spec';

export interface RenderCtx {
  index: number;
  total: number;
  /** Accent override (e.g. threat severity). Defaults to TOFU brand accent. */
  accent?: string;
}

const W = 1080;
const H = 1350;
const DISPLAY = 'Bricolage Grotesque';
const BODY = 'Hanken Grotesk';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Greedy word-wrap into at most `maxLines` lines of ~`perLine` chars. */
function wrap(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const rest = words.slice(lines.join(' ').split(/\s+/).length).join(' ');
    if (rest) lines[maxLines - 1] = lines[maxLines - 1]!.replace(/\s*$/, '') + '…';
  }
  return lines;
}

function deriveKind(slide: ContentSlide, ctx: RenderCtx): SlideKind {
  if (slide.kind) return slide.kind;
  if (ctx.index === 0) return 'hook';
  if (ctx.index === ctx.total - 1) return 'cta';
  if (slide.stat) return 'stat';
  if (slide.bullets?.length) return 'list';
  return 'content';
}

function textLines(lines: string[], x: number, y: number, lh: number, attrs: string): string {
  return lines.map((ln, i) => `<text x="${x}" y="${y + i * lh}" ${attrs}>${esc(ln)}</text>`).join('');
}

/** Render one carousel slide (1080×1350) as an SVG string. Pure. */
export function renderCarouselSlideSvg(slide: ContentSlide, ctx: RenderCtx): string {
  const kind = deriveKind(slide, ctx);
  const accent = ctx.accent ?? BRAND.funnel.tofu.accent;
  const dark = BRAND.colors.neutral[950];
  const light = BRAND.colors.neutral[50];
  const ink = BRAND.colors.neutral[900];
  const isDark = kind === 'hook' || kind === 'cta';
  const bg = isDark ? dark : light;
  const fg = isDark ? '#ffffff' : ink;

  const pad = 96;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
  // Accent side bar (brand signature element).
  parts.push(`<rect x="0" y="0" width="16" height="${H}" fill="${accent}"/>`);

  // Headline.
  const headSize = kind === 'hook' ? 92 : 64;
  const headLines = wrap(slide.headline, kind === 'hook' ? 25 : 24, kind === 'hook' ? 5 : 4);
  const headY = kind === 'hook' ? 360 : 240;
  parts.push(
    textLines(
      headLines,
      pad,
      headY,
      headSize * 1.12,
      `font-family="${DISPLAY}" font-size="${headSize}" font-weight="700" fill="${fg}"`
    )
  );

  // Stat.
  if (kind === 'stat' && slide.stat) {
    parts.push(
      `<text x="${pad}" y="760" font-family="${DISPLAY}" font-size="220" font-weight="700" fill="${accent}">${esc(slide.stat.value)}</text>`
    );
    parts.push(
      `<text x="${pad}" y="840" font-family="${BODY}" font-size="40" fill="${fg}">${esc(slide.stat.label)}</text>`
    );
  }

  // Bullets / body.
  let cursorY = headY + headLines.length * headSize * 1.12 + 64;
  if (slide.bullets?.length) {
    for (const b of slide.bullets.slice(0, 5)) {
      const bl = wrap(b, 40, 2);
      parts.push(`<circle cx="${pad + 8}" cy="${cursorY - 14}" r="8" fill="${accent}"/>`);
      parts.push(textLines(bl, pad + 40, cursorY, 52, `font-family="${BODY}" font-size="40" fill="${fg}"`));
      cursorY += bl.length * 52 + 28;
    }
  } else if (slide.body && kind !== 'hook') {
    const bl = wrap(slide.body, 44, 6);
    parts.push(textLines(bl, pad, cursorY, 56, `font-family="${BODY}" font-size="42" fill="${fg}"`));
  }

  // Pager (not on the cover/hook slide).
  if (kind !== 'hook') {
    parts.push(
      `<text x="${W - pad}" y="${H - 72}" text-anchor="end" font-family="${BODY}" font-size="32" fill="${isDark ? '#ffffff' : BRAND.colors.neutral[400]}">${ctx.index + 1} / ${ctx.total}</text>`
    );
  }

  // Brand mark / URL on hook + cta.
  if (isDark) {
    parts.push(
      `<text x="${pad}" y="${H - 72}" font-family="${BODY}" font-size="34" font-weight="700" fill="${accent}">pranithjain.qzz.io</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}
