/**
 * Carousel HTML renderer — portfolio-matched design system.
 *
 * Matches the portfolio's visual language exactly:
 *   - Clean, editorial, minimal — no decorative blobs or heavy gradients
 *   - Typography-driven hierarchy (Bricolage Grotesque / Hanken Grotesk / JetBrains Mono)
 *   - Slate neutral palette with brand-600 (#2c3ee5) as single accent
 *   - Card styles: white + slate-200 border (light), slate-900 + slate-800 border (dark)
 *   - WCAG AA contrast: slate-900 on white, white on slate-900
 *   - Rounded-2xl (16px) corners, subtle shadows
 *   - Brand mark on every slide
 */

import type { ContentSpec, ContentSlide, FunnelStage, SlideKind } from './content-spec';
import { BRAND, FONTS } from './brand';

const N = BRAND.colors.neutral;
const B = BRAND.colors.brand;

type FunnelColors = { accent: string; tint: string; deep: string; label: string };

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// === SHARED ELEMENTS ===

function progressBar(index: number, total: number, dark: boolean): string {
  const track = dark ? 'rgba(255,255,255,0.1)' : N[200];
  const pct = Math.round((index / total) * 100);
  return `<div style="position:absolute;top:0;left:0;right:0;height:4px;background:${track};z-index:2;">
    <div style="height:100%;width:${pct}%;background:${B[600]};"></div>
  </div>`;
}

function brandMark(dark: boolean): string {
  const fg = dark ? N[300] : N[600];
  return `<div style="position:absolute;top:48px;left:56px;display:flex;align-items:center;gap:12px;z-index:3;">
    <svg viewBox="0 0 36 36" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="bm${dark ? 'd' : 'l'}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${B[600]}"/>
        <stop offset="100%" stop-color="${B[500]}"/>
      </linearGradient></defs>
      <rect width="36" height="36" rx="8" fill="url(#bm${dark ? 'd' : 'l'})"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="${FONTS.display}" font-weight="800" font-size="16">PJ</text>
    </svg>
    <span style="font-family:${FONTS.mono};font-size:11px;color:${fg};letter-spacing:0.16em;text-transform:uppercase;font-weight:600;">Pranith Jain</span>
  </div>`;
}

function slideIndicator(index: number, total: number, dark: boolean): string {
  const fg = dark ? N[600] : N[400];
  const active = dark ? N[300] : N[800];
  return `<div style="position:absolute;bottom:48px;right:56px;display:flex;align-items:center;gap:14px;z-index:3;">
    <div style="display:flex;gap:5px;">
      ${Array.from({ length: total }, (_, i) => `<div style="width:6px;height:6px;border-radius:50%;background:${i === index - 1 ? active : fg};"></div>`).join('')}
    </div>
    <span style="font-family:${FONTS.mono};font-size:12px;color:${dark ? N[500] : N[400]};font-weight:600;letter-spacing:0.06em;">${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
  </div>`;
}

// === LAYOUTS ===

function renderHook(slide: ContentSlide, index: number, total: number, accent: string, funnel: FunnelColors): string {
  return `
  <div class="slide" style="
    width:1080px;height:1350px;
    background:${N[900]};
    color:${N.white};
    position:relative;overflow:hidden;
    display:flex;flex-direction:column;justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, true)}
    ${brandMark(true)}
    <div style="position:relative;z-index:2;max-width:880px;">
      <h1 style="font-family:${FONTS.display};font-size:104px;font-weight:800;
        line-height:0.95;margin:0 0 36px 0;color:${N.white};letter-spacing:-4px;
        max-width:920px;">
        ${escapeHTML(slide.headline)}
      </h1>
      ${slide.body ? `<p style="font-family:${FONTS.body};font-size:28px;line-height:1.45;color:${N[300]};margin:0;max-width:760px;font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
    </div>
    ${slideIndicator(index, total, true)}
  </div>`;
}

function renderStat(slide: ContentSlide, index: number, total: number, accent: string, funnel: FunnelColors): string {
  return `
  <div class="slide" style="
    width:1080px;height:1350px;
    background:${N.white};
    color:${N[900]};
    position:relative;overflow:hidden;
    display:flex;flex-direction:column;justify-content:center;align-items:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, false)}
    ${brandMark(false)}
    <div style="position:relative;z-index:2;text-align:center;max-width:880px;">
      <div style="font-family:${FONTS.display};font-size:320px;font-weight:800;
        line-height:0.85;margin:0 0 32px 0;color:${B[600]};letter-spacing:-14px;">
        ${escapeHTML(slide.stat!.value)}
      </div>
      <p style="font-family:${FONTS.body};font-size:32px;line-height:1.4;color:${N[600]};margin:0;max-width:760px;font-weight:500;">
        ${escapeHTML(slide.stat!.label)}
      </p>
    </div>
    ${slideIndicator(index, total, false)}
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
    width:1080px;height:1350px;
    background:${N.white};
    color:${N[900]};
    position:relative;overflow:hidden;
    display:flex;flex-direction:column;justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, false)}
    ${brandMark(false)}
    <div style="position:relative;z-index:2;max-width:880px;">
      <h2 style="font-family:${FONTS.display};font-size:64px;font-weight:800;
        line-height:1.0;margin:0 0 48px 0;color:${N[900]};letter-spacing:-2.5px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      <div style="display:flex;flex-direction:column;gap:16px;">
        ${bullets
          .map(
            (b, i) => `
          <div style="display:flex;align-items:flex-start;gap:24px;padding:20px 24px;background:${N[50]};border:1px solid ${N[200]};border-radius:16px;">
            <div style="flex-shrink:0;width:44px;height:44px;border-radius:10px;background:${B[600]};display:flex;align-items:center;justify-content:center;font-family:${FONTS.mono};font-size:16px;font-weight:700;color:${N.white};">
              ${String(i + 1).padStart(2, '0')}
            </div>
            <p style="font-family:${FONTS.body};font-size:24px;line-height:1.4;color:${N[700]};margin:6px 0 0 0;font-weight:500;flex:1;">
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
    width:1080px;height:1350px;
    background:${N.white};
    color:${N[900]};
    position:relative;overflow:hidden;
    display:flex;flex-direction:column;justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, false)}
    ${brandMark(false)}
    <div style="position:relative;z-index:2;max-width:880px;width:100%;">
      <h2 style="font-family:${FONTS.display};font-size:56px;font-weight:800;
        line-height:1.05;margin:0 0 48px 0;color:${N[900]};letter-spacing:-2px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        ${bullets
          .map(
            (b, i) => `
          <div style="padding:28px 24px;background:${N[50]};border:1px solid ${N[200]};border-radius:16px;position:relative;overflow:hidden;">
            <div style="font-family:${FONTS.mono};font-size:13px;color:${B[600]};text-transform:uppercase;letter-spacing:0.18em;font-weight:700;margin:0 0 12px 0;">
              STEP ${String(i + 1).padStart(2, '0')}
            </div>
            <p style="font-family:${FONTS.body};font-size:21px;line-height:1.45;color:${N[700]};margin:0;font-weight:500;">
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

function renderQuote(slide: ContentSlide, index: number, total: number, accent: string, funnel: FunnelColors): string {
  return `
  <div class="slide" style="
    width:1080px;height:1350px;
    background:${N[900]};
    color:${N.white};
    position:relative;overflow:hidden;
    display:flex;flex-direction:column;justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, true)}
    ${brandMark(true)}
    <div style="position:relative;z-index:2;max-width:880px;">
      <div style="font-family:${FONTS.display};font-size:200px;line-height:0.4;color:${B[600]};opacity:0.3;margin-bottom:20px;">"</div>
      <p style="font-family:${FONTS.display};font-size:56px;line-height:1.2;color:${N.white};margin:0 0 40px 0;font-weight:600;letter-spacing:-1.5px;">
        ${escapeHTML(slide.body ?? slide.headline)}
      </p>
      ${
        slide.body && slide.headline
          ? `
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="width:48px;height:2px;background:${B[600]};"></div>
          <span style="font-family:${FONTS.mono};font-size:14px;color:${N[400]};letter-spacing:0.16em;text-transform:uppercase;font-weight:600;">${escapeHTML(slide.headline)}</span>
        </div>
      `
          : ''
      }
    </div>
    ${slideIndicator(index, total, true)}
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
    width:1080px;height:1350px;
    background:${N.white};
    color:${N[900]};
    position:relative;overflow:hidden;
    display:flex;flex-direction:column;justify-content:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${progressBar(index, total, false)}
    ${brandMark(false)}
    <div style="position:relative;z-index:2;max-width:880px;">
      <h2 style="font-family:${FONTS.display};font-size:72px;font-weight:800;
        line-height:1.0;margin:0 0 40px 0;color:${N[900]};letter-spacing:-3px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      ${slide.body ? `<p style="font-family:${FONTS.body};font-size:30px;line-height:1.5;color:${N[600]};margin:0;max-width:820px;font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
    </div>
    ${slideIndicator(index, total, false)}
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
    width:1080px;height:1350px;
    background:${N[900]};
    color:${N.white};
    position:relative;overflow:hidden;
    display:flex;flex-direction:column;justify-content:center;align-items:center;
    padding:120px 96px;
    box-sizing:border-box;
    page-break-after:always;
    text-align:center;
  ">
    ${progressBar(index, total, true)}
    ${brandMark(true)}
    <div style="position:relative;z-index:2;max-width:880px;">
      <h2 style="font-family:${FONTS.display};font-size:88px;font-weight:800;
        line-height:1.0;margin:0 0 40px 0;color:${N.white};letter-spacing:-3px;
        max-width:880px;">
        ${escapeHTML(slide.headline)}
      </h2>
      ${slide.body ? `<p style="font-family:${FONTS.body};font-size:26px;line-height:1.45;color:${N[300]};margin:0 0 48px 0;max-width:760px;font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
      <div style="display:inline-flex;align-items:center;gap:12px;padding:22px 36px;background:${B[600]};color:${N.white};border-radius:10px;font-family:${FONTS.body};font-size:20px;font-weight:700;">
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
  const funnel = BRAND.funnel[spec.funnel];
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
      background: ${N[100]};
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 80px;
      padding: 80px 24px;
    }
    .slide {
      box-shadow: 0 32px 80px rgba(15, 23, 42, 0.12), 0 12px 32px rgba(15, 23, 42, 0.06);
      border-radius: 16px;
    }
    @media print {
      body { background: white; padding: 0; gap: 0; }
      .slide { box-shadow: none; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div style="text-align:center;max-width:920px;margin:0 auto 8px;">
    <h1 style="font-family:${FONTS.display};font-size:36px;font-weight:800;
      color:${N[900]};margin:0;letter-spacing:-1.2px;
      max-width:880px;margin-left:auto;margin-right:auto;line-height:1.15;
      overflow-wrap:break-word;word-wrap:break-word;hyphens:auto;">
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
  const funnel = BRAND.funnel[spec.funnel];
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
      min-height:100vh; background:${N[100]}; padding:48px;
    }
  </style>
</head>
<body>
  ${slideHTML}
</body>
</html>`;
}
