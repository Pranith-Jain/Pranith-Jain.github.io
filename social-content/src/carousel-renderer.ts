/**
 * Carousel HTML renderer — restraint-first design system.
 *
 * Inspired by FranciscoMoretti/carousel-generator (3 slide types) and the
 * Carouselli principle: "Restraint in design amplifies the data."
 *
 * 3 base kinds: hook (slide 1) | content (body) | cta (last)
 * 4 content variants auto-detected: stat | list | framework | quote
 *
 * Chrome budget per slide: 3 elements max
 *   - Slide indicator (bottom-right, all slides)
 *   - Brand mark (top-left, hook + cta + quote only)
 *   - Handle watermark (bottom-left, optional)
 *
 * Body slides have ZERO decoration beyond the slide indicator.
 * No noise, no blobs, no dashed circles, no big watermarks,
 * no top/bottom accent bars, no left accent bars.
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

const FUNNEL: Record<FunnelStage, { accent: string; tint: string; label: string }> = {
  tofu: { accent: C.brand[600], tint: '#eef1ff', label: 'TOFU' },
  mofu: { accent: '#0ea5e9', tint: '#e0f4ff', label: 'MOFU' },
  bofu: { accent: '#10b981', tint: '#e6fbf3', label: 'BOFU' },
};

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// === CHROME (only 3 elements total across the slide) ===

function brandMark(): string {
  return `
    <div style="position:absolute; top:48px; left:56px; display:flex; align-items:center; gap:12px; z-index:3;">
      <svg viewBox="0 0 36 36" width="36" height="36" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bm" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${C.brand[600]}"/>
            <stop offset="100%" stop-color="${C.brand[500]}"/>
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="9" fill="url(#bm)"/>
        <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="${FONTS.display}" font-weight="800" font-size="14">PJ</text>
      </svg>
      <span style="font-family:${FONTS.mono}; font-size:11px; color:rgba(255,255,255,0.7); letter-spacing:0.16em; font-weight:600;">PRANITHJAIN</span>
    </div>
  `;
}

function slideIndicator(index: number, total: number, dark: boolean): string {
  const fg = dark ? 'rgba(255,255,255,0.5)' : C.slate[400];
  const active = dark ? C.white : C.brand[600];
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

// === LAYOUTS ===

function renderHook(slide: ContentSlide, index: number, total: number, accent: string): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:linear-gradient(160deg, ${C.slate[950]} 0%, ${C.slate[900]} 50%, ${accent} 100%);
    color:${C.white};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${brandMark()}
    <div style="position:relative; z-index:2; max-width:880px;">
      <div style="font-family:${FONTS.mono}; font-size:13px; color:rgba(255,255,255,0.5); letter-spacing:0.2em; text-transform:uppercase; font-weight:600; margin-bottom:32px;">
        ${index} / ${total}
      </div>
      <h1 style="font-family:${FONTS.display}; font-size:104px; font-weight:800;
        line-height:0.95; margin:0 0 36px 0; color:${C.white}; letter-spacing:-4px;
        max-width:920px;">
        ${escapeHTML(slide.headline)}
      </h1>
      ${slide.body ? `<p style="font-family:${FONTS.body}; font-size:28px; line-height:1.45; color:rgba(255,255,255,0.75); margin:0; max-width:760px; font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
    </div>
    ${slideIndicator(index, total, true)}
  </div>`;
}

function renderStat(slide: ContentSlide, index: number, total: number, accent: string, dark: boolean): string {
  const bg = dark ? C.slate[950] : C.white;
  const fg = dark ? C.white : C.slate[900];
  const muted = dark ? C.slate[400] : C.slate[500];

  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:${bg};
    color:${fg};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center; align-items:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    <div style="position:relative; z-index:2; text-align:center; max-width:880px;">
      <div style="font-family:${FONTS.display}; font-size:280px; font-weight:800;
        line-height:0.85; margin:0 0 32px 0; color:${accent}; letter-spacing:-12px;">
        ${escapeHTML(slide.stat!.value)}
      </div>
      <p style="font-family:${FONTS.body}; font-size:32px; line-height:1.4; color:${muted}; margin:0; max-width:760px; font-weight:500;">
        ${escapeHTML(slide.stat!.label)}
      </p>
      ${slide.headline ? `<p style="font-family:${FONTS.body}; font-size:18px; line-height:1.5; color:${muted}; margin:48px 0 0 0; opacity:0.7;">${escapeHTML(slide.headline)}</p>` : ''}
    </div>
    ${slideIndicator(index, total, dark)}
  </div>`;
}

function renderList(slide: ContentSlide, index: number, total: number, accent: string, bullets: string[]): string {
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
    <div style="position:relative; z-index:2; max-width:880px;">
      <h2 style="font-family:${FONTS.display}; font-size:64px; font-weight:800;
        line-height:1.0; margin:0 0 56px 0; color:${C.slate[900]}; letter-spacing:-2.5px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      <div style="display:flex; flex-direction:column; gap:24px;">
        ${bullets
          .map(
            (b, i) => `
          <div style="display:flex; align-items:flex-start; gap:28px;">
            <div style="flex-shrink:0; width:48px; height:48px; border-radius:12px; background:${accent}; display:flex; align-items:center; justify-content:center; font-family:${FONTS.mono}; font-size:18px; font-weight:700; color:${C.white};">
              ${String(i + 1).padStart(2, '0')}
            </div>
            <p style="font-family:${FONTS.body}; font-size:28px; line-height:1.4; color:${C.slate[800]}; margin:6px 0 0 0; font-weight:500; flex:1;">
              ${escapeHTML(b)}
            </p>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
    ${slideIndicator(index, total, false)}
  </div>`;
}

function renderFramework(slide: ContentSlide, index: number, total: number, accent: string, bullets: string[]): string {
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
    <div style="position:relative; z-index:2; max-width:880px; width:100%;">
      <h2 style="font-family:${FONTS.display}; font-size:56px; font-weight:800;
        line-height:1.05; margin:0 0 56px 0; color:${C.slate[900]}; letter-spacing:-2px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
        ${bullets
          .map(
            (b, i) => `
          <div style="padding:32px 28px; background:${C.slate[50]}; border-radius:16px;">
            <div style="font-family:${FONTS.mono}; font-size:13px; color:${accent}; text-transform:uppercase; letter-spacing:0.18em; font-weight:700; margin-bottom:14px;">
              STEP ${String(i + 1).padStart(2, '0')}
            </div>
            <p style="font-family:${FONTS.body}; font-size:22px; line-height:1.45; color:${C.slate[800]}; margin:0; font-weight:500;">
              ${escapeHTML(b)}
            </p>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
    ${slideIndicator(index, total, false)}
  </div>`;
}

function renderQuote(slide: ContentSlide, index: number, total: number, accent: string): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:linear-gradient(160deg, ${C.slate[950]} 0%, ${C.slate[900]} 60%, ${accent} 100%);
    color:${C.white};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${brandMark()}
    <div style="position:relative; z-index:2; max-width:880px;">
      <div style="font-family:${FONTS.display}; font-size:180px; line-height:0.4; color:${C.white}; opacity:0.3; margin-bottom:20px;">"</div>
      <p style="font-family:${FONTS.display}; font-size:56px; line-height:1.2; color:${C.white}; margin:0 0 40px 0; font-weight:600; letter-spacing:-1.5px;">
        ${escapeHTML(slide.body ?? slide.headline)}
      </p>
      ${
        slide.body && slide.headline
          ? `
        <div style="display:flex; align-items:center; gap:16px;">
          <div style="width:48px; height:2px; background:${C.white}; opacity:0.5;"></div>
          <span style="font-family:${FONTS.mono}; font-size:14px; color:rgba(255,255,255,0.7); letter-spacing:0.16em; text-transform:uppercase; font-weight:600;">${escapeHTML(slide.headline)}</span>
        </div>
      `
          : ''
      }
    </div>
    ${slideIndicator(index, total, true)}
  </div>`;
}

function renderContent(slide: ContentSlide, index: number, total: number, accent: string): string {
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
    <div style="position:relative; z-index:2; max-width:880px;">
      <h2 style="font-family:${FONTS.display}; font-size:64px; font-weight:800;
        line-height:1.05; margin:0 0 40px 0; color:${C.slate[900]}; letter-spacing:-2.5px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      ${slide.body ? `<p style="font-family:${FONTS.body}; font-size:28px; line-height:1.5; color:${C.slate[600]}; margin:0; max-width:820px; font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
    </div>
    ${slideIndicator(index, total, false)}
  </div>`;
}

function renderCTA(spec: ContentSpec, slide: ContentSlide, index: number, total: number, accent: string): string {
  return `
  <div class="slide" style="
    width:1080px; height:1350px;
    background:linear-gradient(160deg, ${accent} 0%, ${C.brand[800]} 50%, ${C.slate[950]} 100%);
    color:${C.white};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center; align-items:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
    text-align:center;
  ">
    ${brandMark()}
    <div style="position:relative; z-index:2; max-width:880px;">
      <h2 style="font-family:${FONTS.display}; font-size:88px; font-weight:800;
        line-height:1.0; margin:0 0 40px 0; color:${C.white}; letter-spacing:-3px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      ${slide.body ? `<p style="font-family:${FONTS.body}; font-size:26px; line-height:1.45; color:rgba(255,255,255,0.8); margin:0 0 48px 0; max-width:760px; font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
      <div style="display:inline-flex; align-items:center; gap:12px; padding:22px 36px; background:${C.white}; color:${C.slate[900]}; border-radius:100px; font-family:${FONTS.body}; font-size:20px; font-weight:700;">
        ${escapeHTML(spec.cta)}
        <span style="font-size:22px;">→</span>
      </div>
    </div>
    ${slideIndicator(index, total, true)}
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
          return renderHook(slide, index, total, accent);
        case 'stat':
          return renderStat(slide, index, total, accent, false);
        case 'list':
          return renderList(slide, index, total, accent, slide.bullets!);
        case 'framework':
          return renderFramework(slide, index, total, accent, slide.bullets!);
        case 'quote':
          return renderQuote(slide, index, total, accent);
        case 'cta':
          return renderCTA(spec, slide, index, total, accent);
        default:
          return renderContent(slide, index, total, accent);
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
    <div style="font-family:${FONTS.mono}; font-size:12px; color:${accent};
      letter-spacing:0.2em; text-transform:uppercase; font-weight:700; margin-bottom:16px;">
      ${funnel.label} · ${spec.platform} · ${spec.format} · ${spec.hook}
    </div>
    <h1 style="font-family:${FONTS.display}; font-size:32px; font-weight:800;
      color:${C.slate[900]}; margin:0; letter-spacing:-1px;
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
      slideHTML = renderHook(slide, index, total, accent);
      break;
    case 'stat':
      slideHTML = renderStat(slide, index, total, accent, false);
      break;
    case 'list':
      slideHTML = renderList(slide, index, total, accent, slide.bullets!);
      break;
    case 'framework':
      slideHTML = renderFramework(slide, index, total, accent, slide.bullets!);
      break;
    case 'quote':
      slideHTML = renderQuote(slide, index, total, accent);
      break;
    case 'cta':
      slideHTML = renderCTA(spec, slide, index, total, accent);
      break;
    default:
      slideHTML = renderContent(slide, index, total, accent);
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
