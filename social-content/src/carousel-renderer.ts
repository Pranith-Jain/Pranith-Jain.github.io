/**
 * Carousel HTML renderer — produces a self-contained HTML file that
 * renders each slide as a full-bleed card. Open in any browser, then
 * screenshot or use Playwright to export as PNG/PDF.
 *
 * Brand-aligned: uses Bricolage Grotesque + Hanken Grotesk + JetBrains
 * Mono (loaded from Google Fonts), brand color palette, severity scale,
 * and funnel-specific accent colors.
 */

import { BRAND } from './brand';
import type { ContentSpec, ContentSlide } from './content-spec';

function slideColors(spec: ContentSpec, slide: ContentSlide): { bg: string; fg: string; accent: string } {
  const funnel = BRAND.funnel[spec.funnel];
  const bg = slide.bg ?? (slide.isCTA ? funnel.accent : BRAND.colors.neutral.white);
  const fg = slide.color ?? (slide.isCTA ? BRAND.colors.neutral.white : BRAND.colors.neutral[900]);
  const accent = slide.isCTA ? BRAND.colors.neutral.white : funnel.accent;
  return { bg, fg, accent };
}

function renderSlide(spec: ContentSpec, slide: ContentSlide, slideWidth: number, slideHeight: number): string {
  const { bg, fg, accent } = slideColors(spec, slide);
  const isHook = slide.index === 1;
  const isCTA = slide.isCTA === true;

  let contentHTML = '';

  if (slide.stat) {
    contentHTML += `
      <div style="text-align:center; padding:40px 0;">
        <div style="font-size:84px; font-weight:800; font-family:${BRAND.fonts.display}; color:${accent}; line-height:1;">
          ${escapeHTML(slide.stat.value)}
        </div>
        <div style="font-size:22px; font-weight:500; font-family:${BRAND.fonts.body}; color:${fg}; margin-top:16px; opacity:0.8;">
          ${escapeHTML(slide.stat.label)}
        </div>
      </div>`;
  }

  if (slide.bullets && slide.bullets.length > 0) {
    contentHTML += `<ul style="list-style:none; padding:0; margin:24px 0 0;">`;
    for (const bullet of slide.bullets) {
      contentHTML += `
        <li style="display:flex; align-items:flex-start; gap:12px; margin-bottom:18px; font-size:20px; font-family:${BRAND.fonts.body}; line-height:1.5;">
          <span style="display:inline-block; width:8px; height:8px; min-width:8px; border-radius:50%; background:${accent}; margin-top:9px;"></span>
          <span>${escapeHTML(bullet)}</span>
        </li>`;
    }
    contentHTML += `</ul>`;
  } else if (slide.body && !slide.stat) {
    contentHTML += `
      <p style="font-size:${isHook ? '22px' : '20px'}; font-family:${BRAND.fonts.body}; line-height:1.6; color:${fg}; opacity:0.85; margin:20px 0 0;">
        ${escapeHTML(slide.body)}
      </p>`;
  }

  if (slide.visual && slide.visual !== 'none') {
    contentHTML += `
      <div style="text-align:center; margin-top:24px; font-size:48px; opacity:0.7;">
        ${escapeHTML(slide.visual)}
      </div>`;
  }

  const funnelBadge = `
    <div style="position:absolute; top:24px; right:24px; font-size:11px; font-family:${BRAND.fonts.mono};
      text-transform:uppercase; letter-spacing:0.15em; padding:4px 10px; border-radius:4px;
      background:${isCTA ? 'rgba(255,255,255,0.2)' : accent}15; color:${isCTA ? fg : accent};
      border:1px solid ${isCTA ? 'rgba(255,255,255,0.3)' : accent}30;">
      ${BRAND.funnel[spec.funnel].label}
    </div>`;

  const slideNum = `
    <div style="position:absolute; bottom:20px; right:24px; font-size:11px; font-family:${BRAND.fonts.mono};
      color:${isCTA ? 'rgba(255,255,255,0.5)' : BRAND.colors.neutral[400]};">
      ${slide.index}/${spec.slides.length}
    </div>`;

  const watermark = isCTA
    ? ''
    : `
    <div style="position:absolute; bottom:20px; left:24px; font-size:10px; font-family:${BRAND.fonts.mono};
      color:${isCTA ? 'rgba(255,255,255,0.4)' : BRAND.colors.neutral[300]}; letter-spacing:0.05em;">
      @pranithjain
    </div>`;

  return `
  <div class="slide" style="
    width:${slideWidth}px; height:${slideHeight}px;
    background:${bg}; color:${fg};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:48px 40px 56px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${funnelBadge}
    <h2 style="font-size:${isHook ? '36px' : '28px'}; font-weight:800; font-family:${BRAND.fonts.display};
      line-height:1.2; margin:0; color:${fg};">
      ${escapeHTML(slide.headline)}
    </h2>
    ${contentHTML}
    ${slideNum}
    ${watermark}
  </div>`;
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderCarouselHTML(spec: ContentSpec): string {
  const width = 1080;
  const height = 1350;
  const slidesHTML = spec.slides.map((s) => renderSlide(spec, s, width, height)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(spec.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: ${BRAND.fonts.body};
      background: ${BRAND.colors.neutral[100]};
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      padding: 32px 16px;
    }
    .slide {
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    @media print {
      body { background: white; padding: 0; gap: 0; }
      .slide { border-radius: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <h1 style="font-family:${BRAND.fonts.display}; font-size:20px; font-weight:600;
    color:${BRAND.colors.neutral[500]}; margin-bottom:8px; text-align:center;">
    ${escapeHTML(spec.title)} — ${spec.slides.length} slides
  </h1>
  <p style="font-family:${BRAND.fonts.mono}; font-size:11px; color:${BRAND.colors.neutral[400]};
    margin-bottom:16px; text-align:center;">
    ${spec.funnel.toUpperCase()} · ${spec.platform} · ${spec.format} · ${spec.hook}
  </p>
  ${slidesHTML}
</body>
</html>`;
}

/**
 * Render a single slide as standalone HTML — useful for screenshot tools
 * that need a single-page render.
 */
export function renderSingleSlideHTML(spec: ContentSpec, slideIndex: number): string {
  const slide = spec.slides[slideIndex];
  if (!slide) throw new Error(`Slide ${slideIndex} not found (spec has ${spec.slides.length} slides)`);
  const width = 1080;
  const height = 1350;
  const slideHTML = renderSlide(spec, slide, width, height);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Slide ${slide.index} — ${escapeHTML(spec.title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>* { margin:0; padding:0; box-sizing:border-box; }</style>
</head>
<body style="display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f1f5f9;">
  ${slideHTML}
</body>
</html>`;
}
