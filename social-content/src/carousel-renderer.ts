/**
 * Carousel HTML renderer — restraint-first design system v3.
 *
 * Inspired by FranciscoMoretti/carousel-generator (3 slide types) and the
 * Carouselli principle: "Restraint in design amplifies the data."
 *
 * 3 base kinds: hook (slide 1) | content (body) | cta (last)
 * 4 content variants auto-detected: stat | list | framework | quote
 *
 * Visual treatment per layout:
 *   - hook:     dark gradient + corner accents + eyebrow pill + progress bar
 *   - stat:     tinted gradient bg + dot pattern + corner accent + eyebrow pill
 *   - list:     white + side accent bar + tinted number cards with left border
 *   - framework: tinted top-fade + grid pattern + step cards with top accent
 *   - quote:    dark gradient + corner accent + giant quote mark
 *   - content:  white + corner accent (subtle, bottom-left)
 *   - cta:      brand gradient + 2 corner accents + eyebrow pill + CTA button
 */

import type { ContentSpec, ContentSlide, FunnelStage, SlideKind } from './content-spec';
import { BRAND } from './brand';

const FONTS = BRAND.fonts;

const C = {
  brand: { 400: '#6d8bf7', 500: '#435ef1', 600: '#2c3ee5', 700: '#232ebf', 800: '#21299b' },
  slate: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  white: '#ffffff',
};

const FUNNEL: Record<FunnelStage, { accent: string; tint: string; deep: string; label: string }> = {
  tofu: { accent: C.brand[600], tint: '#eef1ff', deep: '#d6dffd', label: 'TOFU' },
  mofu: { accent: '#0ea5e9', tint: '#e0f4ff', deep: '#b8e5ff', label: 'MOFU' },
  bofu: { accent: '#10b981', tint: '#e6fbf3', deep: '#c4f3df', label: 'BOFU' },
};

type FunnelColors = (typeof FUNNEL)['tofu'];

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// === CHROME & DECORATION ===

function progressBar(index: number, total: number, dark: boolean, accent: string): string {
  const trackColor = dark ? 'rgba(255,255,255,0.1)' : `${accent}1a`;
  const pct = Math.round((index / total) * 100);
  return `
    <div style="position:absolute; top:0; left:0; right:0; height:6px; background:${trackColor}; z-index:2;">
      <div style="height:100%; width:${pct}%; background:${accent};"></div>
    </div>
  `;
}

function cornerAccent(accent: string, position: 'tr' | 'bl'): string {
  if (position === 'tr') {
    return `<div style="position:absolute; top:-180px; right:-180px; width:480px; height:480px; border-radius:50%; background:radial-gradient(circle, ${accent}30 0%, transparent 65%); pointer-events:none; z-index:1;"></div>`;
  }
  return `<div style="position:absolute; bottom:-160px; left:-160px; width:400px; height:400px; border-radius:50%; background:radial-gradient(circle, ${accent}24 0%, transparent 65%); pointer-events:none; z-index:1;"></div>`;
}

function dotPattern(opacity = 0.06, color = '#0f172a'): string {
  return `<div style="position:absolute; inset:0; opacity:${opacity}; background-image:radial-gradient(${color} 1.4px, transparent 1.4px); background-size:32px 32px; pointer-events:none; z-index:1;"></div>`;
}

function gridPattern(opacity = 0.04, color = '#94a3b8'): string {
  return `<div style="position:absolute; inset:0; opacity:${opacity}; background-image:linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px); background-size:64px 64px; pointer-events:none; z-index:1;"></div>`;
}

function sideAccentBar(accent: string, side: 'left' | 'right'): string {
  return `<div style="position:absolute; top:120px; bottom:120px; ${side}:0; width:8px; background:linear-gradient(to bottom, ${accent}, ${accent}00); z-index:2;"></div>`;
}

function brandMark(dark: boolean, accent: string): string {
  const fg = dark ? 'rgba(255,255,255,0.85)' : C.slate[800];
  return `
    <div style="position:absolute; top:52px; left:56px; display:flex; align-items:center; gap:14px; z-index:3;">
      <svg viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bm" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${accent}"/>
            <stop offset="100%" stop-color="${accent}cc"/>
          </linearGradient>
        </defs>
        <path d="M20 2 L36 8 L36 20 Q36 30 20 38 Q4 30 4 20 L4 8 Z" fill="url(#bm)"/>
        <text x="20" y="22" dominant-baseline="central" text-anchor="middle" fill="white" font-family="${FONTS.display}" font-weight="800" font-size="15" letter-spacing="-0.5">PJ</text>
      </svg>
      <span style="font-family:${FONTS.display}; font-size:18px; color:${fg}; letter-spacing:-0.3px; font-weight:700;">Pranith Jain</span>
    </div>
  `;
}

function slideIndicator(index: number, total: number, dark: boolean, accent: string): string {
  const fg = dark ? 'rgba(255,255,255,0.5)' : C.slate[400];
  const active = dark ? C.white : accent;
  return `
    <div style="position:absolute; bottom:48px; right:56px; display:flex; align-items:center; gap:14px; z-index:3;">
      <div style="display:flex; gap:5px;">
        ${Array.from(
          { length: total },
          (_, i) =>
            `<div style="width:6px; height:6px; border-radius:50%; background:${i === index - 1 ? active : fg};"></div>`
        ).join('')}
      </div>
      <span style="font-family:${FONTS.mono}; font-size:12px; color:${dark ? 'rgba(255,255,255,0.6)' : C.slate[400]}; font-weight:600; letter-spacing:0.06em;">${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
    </div>
  `;
}

function eyebrowPill(text: string, accent: string, dark: boolean, tint: string): string {
  const bg = dark ? 'rgba(255,255,255,0.08)' : tint !== C.white ? tint : C.white;
  const border = dark ? 'rgba(255,255,255,0.15)' : `${accent}30`;
  const textColor = dark ? 'rgba(255,255,255,0.8)' : accent;
  return `
    <div style="display:inline-flex; align-items:center; gap:8px; padding:6px 14px; background:${bg}; border:1px solid ${border}; border-radius:20px; margin-bottom:32px;">
      <div style="width:6px; height:6px; border-radius:50%; background:${dark ? accent : accent};"></div>
      <span style="font-family:${FONTS.mono}; font-size:11px; color:${textColor}; letter-spacing:0.2em; text-transform:uppercase; font-weight:700;">${escapeHTML(text)}</span>
    </div>
  `;
}

// === LAYOUTS ===

function renderHook(slide: ContentSlide, index: number, total: number, accent: string, funnel: FunnelColors): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:linear-gradient(160deg, ${C.slate[950]} 0%, ${C.slate[900]} 40%, ${funnel.deep}55 100%);
    color:${C.white};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, true, accent)}
    ${cornerAccent(accent, 'tr')}
    ${cornerAccent(funnel.accent, 'bl')}
    ${brandMark(true, accent)}
    <div style="position:relative; z-index:2; max-width:880px;">
      ${eyebrowPill(funnel.label, accent, true, C.slate[900])}
      <h1 style="font-family:${FONTS.display}; font-size:104px; font-weight:800;
        line-height:0.95; margin:0 0 36px 0; color:${C.white}; letter-spacing:-4px;
        max-width:920px;">
        ${escapeHTML(slide.headline)}
      </h1>
      ${slide.body ? `<p style="font-family:${FONTS.body}; font-size:28px; line-height:1.45; color:rgba(255,255,255,0.75); margin:0; max-width:760px; font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
    </div>
    ${slideIndicator(index, total, true, accent)}
  </div>`;
}

function renderStat(slide: ContentSlide, index: number, total: number, accent: string, funnel: FunnelColors): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:linear-gradient(165deg, ${funnel.tint} 0%, ${C.white} 50%, ${funnel.tint} 100%);
    color:${C.slate[900]};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center; align-items:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, false, accent)}
    ${dotPattern(0.05)}
    ${cornerAccent(accent, 'tr')}
    <div style="position:relative; z-index:2; text-align:center; max-width:880px;">
      ${eyebrowPill('KEY STATISTIC', accent, false, C.white)}
      <div style="font-family:${FONTS.display}; font-size:320px; font-weight:800;
        line-height:0.85; margin:0 0 32px 0; color:${accent}; letter-spacing:-14px;">
        ${escapeHTML(slide.stat!.value)}
      </div>
      <p style="font-family:${FONTS.body}; font-size:32px; line-height:1.4; color:${C.slate[700]}; margin:0; max-width:760px; font-weight:500;">
        ${escapeHTML(slide.stat!.label)}
      </p>
    </div>
    ${slideIndicator(index, total, false, accent)}
  </div>`;
}

function renderList(
  slide: ContentSlide,
  index: number,
  total: number,
  accent: string,
  funnel: FunnelColors,
  bullets: string[]
): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:${C.white};
    color:${C.slate[900]};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, false, accent)}
    ${sideAccentBar(accent, 'left')}
    <div style="position:relative; z-index:2; max-width:880px; margin-left:48px;">
      ${eyebrowPill(`${bullets.length} POINTS`, accent, false, funnel.tint)}
      <h2 style="font-family:${FONTS.display}; font-size:64px; font-weight:800;
        line-height:1.0; margin:0 0 48px 0; color:${C.slate[900]}; letter-spacing:-2.5px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      <div style="display:flex; flex-direction:column; gap:20px;">
        ${bullets
          .map(
            (b, i) => `
          <div style="display:flex; align-items:flex-start; gap:24px; padding:20px 24px; background:${funnel.tint}80; border-radius:14px; border-left:4px solid ${accent};">
            <div style="flex-shrink:0; width:44px; height:44px; border-radius:10px; background:${accent}; display:flex; align-items:center; justify-content:center; font-family:${FONTS.mono}; font-size:16px; font-weight:700; color:${C.white};">
              ${String(i + 1).padStart(2, '0')}
            </div>
            <p style="font-family:${FONTS.body}; font-size:24px; line-height:1.4; color:${C.slate[800]}; margin:6px 0 0 0; font-weight:500; flex:1;">
              ${escapeHTML(b)}
            </p>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
    ${slideIndicator(index, total, false, accent)}
  </div>`;
}

function renderFramework(
  slide: ContentSlide,
  index: number,
  total: number,
  accent: string,
  funnel: FunnelColors,
  bullets: string[]
): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:linear-gradient(180deg, ${funnel.tint} 0%, ${C.white} 100%);
    color:${C.slate[900]};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, false, accent)}
    ${gridPattern(0.03, accent)}
    <div style="position:relative; z-index:2; max-width:880px; width:100%;">
      ${eyebrowPill(`${bullets.length}-STEP FRAMEWORK`, accent, false, C.white)}
      <h2 style="font-family:${FONTS.display}; font-size:56px; font-weight:800;
        line-height:1.05; margin:0 0 48px 0; color:${C.slate[900]}; letter-spacing:-2px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:18px;">
        ${bullets
          .map(
            (b, i) => `
          <div style="padding:28px 24px; background:${C.white}; border:1px solid ${C.slate[200]}; border-radius:16px; box-shadow:0 2px 8px ${C.slate[200]}; position:relative; overflow:hidden;">
            <div style="position:absolute; top:0; left:0; right:0; height:4px; background:${accent};"></div>
            <div style="font-family:${FONTS.mono}; font-size:13px; color:${accent}; text-transform:uppercase; letter-spacing:0.18em; font-weight:700; margin:12px 0 12px 0;">
              STEP ${String(i + 1).padStart(2, '0')}
            </div>
            <p style="font-family:${FONTS.body}; font-size:21px; line-height:1.45; color:${C.slate[800]}; margin:0; font-weight:500;">
              ${escapeHTML(b)}
            </p>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
    ${slideIndicator(index, total, false, accent)}
  </div>`;
}

function renderQuote(slide: ContentSlide, index: number, total: number, accent: string, funnel: FunnelColors): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:linear-gradient(160deg, ${C.slate[950]} 0%, ${C.slate[900]} 50%, ${funnel.deep}66 100%);
    color:${C.white};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, true, accent)}
    ${cornerAccent(accent, 'tr')}
    ${brandMark(true, accent)}
    <div style="position:relative; z-index:2; max-width:880px;">
      <div style="font-family:${FONTS.display}; font-size:200px; line-height:0.4; color:${accent}; opacity:0.4; margin-bottom:20px;">"</div>
      <p style="font-family:${FONTS.display}; font-size:56px; line-height:1.2; color:${C.white}; margin:0 0 40px 0; font-weight:600; letter-spacing:-1.5px;">
        ${escapeHTML(slide.body ?? slide.headline)}
      </p>
      ${
        slide.body && slide.headline
          ? `
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:48px; height:2px; background:${accent};"></div>
          <span style="font-family:${FONTS.mono}; font-size:14px; color:rgba(255,255,255,0.8); letter-spacing:0.16em; text-transform:uppercase; font-weight:600;">${escapeHTML(slide.headline)}</span>
        </div>
      `
          : ''
      }
    </div>
    ${slideIndicator(index, total, true, accent)}
  </div>`;
}

function renderContent(
  slide: ContentSlide,
  index: number,
  total: number,
  accent: string,
  funnel: FunnelColors
): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:${C.white};
    color:${C.slate[900]};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, false, accent)}
    ${cornerAccent(accent, 'bl')}
    <div style="position:relative; z-index:2; max-width:880px;">
      <h2 style="font-family:${FONTS.display}; font-size:72px; font-weight:800;
        line-height:1.0; margin:0 0 40px 0; color:${C.slate[900]}; letter-spacing:-3px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      ${slide.body ? `<p style="font-family:${FONTS.body}; font-size:30px; line-height:1.5; color:${C.slate[700]}; margin:0; max-width:820px; font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
    </div>
    ${slideIndicator(index, total, false, accent)}
  </div>`;
}

function renderCTA(
  spec: ContentSpec,
  slide: ContentSlide,
  index: number,
  total: number,
  accent: string,
  funnel: FunnelColors
): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:linear-gradient(160deg, ${accent} 0%, ${funnel.deep}88 50%, ${C.slate[950]} 100%);
    color:${C.white};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center; align-items:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
    text-align:center;
  ">
    ${progressBar(index, total, true, accent)}
    ${cornerAccent(accent, 'tr')}
    ${cornerAccent(funnel.accent, 'bl')}
    ${brandMark(true, accent)}
    <div style="position:relative; z-index:2; max-width:880px;">
      ${eyebrowPill('YOUR NEXT STEP', C.white, true, C.slate[900])}
      <h2 style="font-family:${FONTS.display}; font-size:88px; font-weight:800;
        line-height:1.0; margin:0 0 40px 0; color:${C.white}; letter-spacing:-3px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      ${slide.body ? `<p style="font-family:${FONTS.body}; font-size:26px; line-height:1.45; color:rgba(255,255,255,0.85); margin:0 0 48px 0; max-width:760px; font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
      <div style="display:inline-flex; align-items:center; gap:12px; padding:22px 36px; background:${C.white}; color:${C.slate[900]}; border-radius:100px; font-family:${FONTS.body}; font-size:20px; font-weight:700; box-shadow:0 12px 32px rgba(0,0,0,0.2);">
        ${escapeHTML(spec.cta)}
        <span style="font-size:22px;">→</span>
      </div>
    </div>
    ${slideIndicator(index, total, true, accent)}
  </div>`;
}

// === LAYOUT DETECTION ===

function detectKind(slide: ContentSlide, index: number, total: number): SlideKind {
  if (slide.kind) return slide.kind;
  if (slide.isCTA) return 'cta';
  if (index === 1) return 'hook';
  if (slide.stat) return 'stat';
  if (slide.bullets) {
    if (slide.bullets.length === 4 || slide.bullets.length === 6) return 'framework';
    return 'list';
  }
  if (slide.body && slide.body.length > 100) return 'quote';
  return 'content';
}

// === TOP-LEVEL RENDERER ===

export function renderCarouselHTML(spec: ContentSpec): string {
  const funnel = FUNNEL[spec.funnel];
  const accent = funnel.accent;

  const slidesHTML = spec.slides
    .map((slide, i) => {
      const kind = detectKind(slide, i + 1, spec.slides.length);
      const index = i + 1;
      const total = spec.slides.length;

      switch (kind) {
        case 'hook':
          return renderHook(slide, index, total, accent, funnel);
        case 'stat':
          return renderStat(slide, index, total, accent, funnel);
        case 'list':
          return renderList(slide, index, total, accent, funnel, slide.bullets!);
        case 'framework':
          return renderFramework(slide, index, total, accent, funnel, slide.bullets!);
        case 'quote':
          return renderQuote(slide, index, total, accent, funnel);
        case 'cta':
          return renderCTA(spec, slide, index, total, accent, funnel);
        default:
          return renderContent(slide, index, total, accent, funnel);
      }
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(spec.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: ${FONTS.body};
      background: ${C.slate[100]};
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 80px;
      padding: 80px 24px;
    }
    .slide {
      box-shadow: 0 32px 80px rgba(15, 23, 42, 0.12), 0 12px 32px rgba(15, 23, 42, 0.06);
    }
    @media print {
      body { background: white; padding: 0; gap: 0; }
      .slide { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div style="text-align:center; max-width:920px; margin:0 auto 8px;">
    <h1 style="font-family:${FONTS.display}; font-size:36px; font-weight:800;
      color:${C.slate[900]}; margin:0; letter-spacing:-1.2px;
      max-width:880px; margin-left:auto; margin-right:auto; line-height:1.15;
      overflow-wrap:break-word; word-wrap:break-word; hyphens:auto;">
      ${escapeHTML(spec.title)}
    </h1>
  </div>
  ${slidesHTML}
</body>
</html>`;
}

export function renderSingleSlideHTML(spec: ContentSpec, slideIndex: number): string {
  const slide = spec.slides[slideIndex];
  if (!slide) throw new Error(`Slide ${slideIndex} not found (spec has ${spec.slides.length} slides)`);
  const funnel = FUNNEL[spec.funnel];
  const accent = funnel.accent;
  const index = slideIndex + 1;
  const total = spec.slides.length;
  const kind = detectKind(slide, index, total);

  let slideHTML: string;
  switch (kind) {
    case 'hook':
      slideHTML = renderHook(slide, index, total, accent, funnel);
      break;
    case 'stat':
      slideHTML = renderStat(slide, index, total, accent, funnel);
      break;
    case 'list':
      slideHTML = renderList(slide, index, total, accent, funnel, slide.bullets!);
      break;
    case 'framework':
      slideHTML = renderFramework(slide, index, total, accent, funnel, slide.bullets!);
      break;
    case 'quote':
      slideHTML = renderQuote(slide, index, total, accent, funnel);
      break;
    case 'cta':
      slideHTML = renderCTA(spec, slide, index, total, accent, funnel);
      break;
    default:
      slideHTML = renderContent(slide, index, total, accent, funnel);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Slide ${index} — ${escapeHTML(spec.title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;700;800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      display:flex; justify-content:center; align-items:center;
      min-height:100vh; background:${C.slate[100]}; padding:48px;
    }
  </style>
</head>
<body>
  ${slideHTML}
</body>
</html>`;
}
