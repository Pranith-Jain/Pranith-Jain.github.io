/**
 * Carousel HTML renderer — produces visually rich infographic-style
 * carousels matching the pranithjain.qzz.io brand identity.
 *
 * Design system:
 * - Alternating slide layouts (hero / stat / list / framework / quote / cta)
 * - Decorative shapes (corner accents, gradient orbs, accent bars)
 * - Icon/glyph system via `visual` field (e.g., "shield", "key", "alert")
 * - Funnel-tinted background variants for visual rhythm
 * - Eyebrow labels above headlines for scannability
 */

import type { ContentSpec, ContentSlide, FunnelStage, SlideLayout } from './content-spec';
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
  severity: { critical: '#e11d48', high: '#f43f5e', medium: '#f59e0b', low: '#10b981', info: '#0ea5e9' },
  white: '#ffffff',
};

const FUNNEL_BG: Record<FunnelStage, { tint: string; accent: string; label: string }> = {
  tofu: { tint: '#eef1ff', accent: C.brand[600], label: 'TOFU' },
  mofu: { tint: '#e0f4ff', accent: C.severity.info, label: 'MOFU' },
  bofu: { tint: '#e6fbf3', accent: C.severity.low, label: 'BOFU' },
};

const ICONS: Record<string, string> = {
  shield: '🛡',
  key: '🔑',
  lock: '🔒',
  alert: '⚠',
  warning: '⚠',
  fire: '🔥',
  bolt: '⚡',
  zap: '⚡',
  eye: '👁',
  bug: '🐛',
  virus: '🦠',
  sword: '⚔',
  target: '◎',
  crosshair: '◎',
  check: '✓',
  x: '✕',
  chart: '📊',
  graph: '📈',
  brain: '🧠',
  network: '🕸',
  server: '🖥',
  cloud: '☁',
  code: '⌨',
  terminal: '⌨',
  user: '👤',
  users: '👥',
  mail: '✉',
  phone: '☎',
  link: '🔗',
  search: '🔍',
  gear: '⚙',
  flag: '⚑',
  crown: '♛',
  rocket: '🚀',
  money: '💰',
  briefcase: '💼',
  star: '★',
  dot: '•',
  arrow: '→',
  none: '',
};

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function resolveIcon(name?: string): string {
  if (!name) return '';
  return ICONS[name.toLowerCase()] ?? name;
}

// === DECORATIVE ELEMENTS ===

function noiseOverlay(opacity = 0.04): string {
  return `<div style="position:absolute; inset:0; opacity:${opacity}; background-image:url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E'); pointer-events:none;"></div>`;
}

function gradientBlobs(accent: string): string {
  return `
    <div style="position:absolute; top:-120px; right:-120px; width:480px; height:480px; border-radius:50%; background:radial-gradient(circle, ${accent}28 0%, transparent 70%); pointer-events:none;"></div>
    <div style="position:absolute; bottom:-100px; left:-100px; width:380px; height:380px; border-radius:50%; background:radial-gradient(circle, ${accent}1a 0%, transparent 70%); pointer-events:none;"></div>
  `;
}

function gridPattern(): string {
  return `<div style="position:absolute; inset:0; opacity:0.05; background-image:linear-gradient(${C.slate[400]} 1px, transparent 1px), linear-gradient(90deg, ${C.slate[400]} 1px, transparent 1px); background-size:48px 48px; pointer-events:none;"></div>`;
}

function dotPattern(): string {
  return `<div style="position:absolute; inset:0; opacity:0.08; background-image:radial-gradient(${C.slate[500]} 1.2px, transparent 1.2px); background-size:24px 24px; pointer-events:none;"></div>`;
}

function topAccentBar(accent: string): string {
  return `<div style="position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(to right, ${accent}99, ${accent}, ${accent}cc); z-index:2;"></div>`;
}

function bottomAccentBar(accent: string): string {
  return `<div style="position:absolute; bottom:0; left:0; right:0; height:4px; background:linear-gradient(to right, ${accent}99, ${accent}, ${accent}cc); z-index:2;"></div>`;
}

// Decorative corner shape (large outlined circle in top-right)
function cornerShape(accent: string, position: 'tr' | 'bl' | 'br' = 'tr'): string {
  const styles = {
    tr: 'top:-60px; right:-60px;',
    bl: 'bottom:-80px; left:-80px;',
    br: 'bottom:-80px; right:-80px;',
  };
  return `<div style="position:absolute; ${styles[position]} width:240px; height:240px; border-radius:50%; border:2px dashed ${accent}30; pointer-events:none;"></div>`;
}

// Decorative vertical accent bar on the left
function leftAccentBar(accent: string): string {
  return `<div style="position:absolute; top:80px; bottom:80px; left:32px; width:4px; background:linear-gradient(to bottom, ${accent}, ${accent}00); border-radius:2px; z-index:2;"></div>`;
}

// Big number watermark in the background
function bigWatermark(text: string, color: string): string {
  return `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:520px; font-weight:800; font-family:${FONTS.display}; color:${color}; opacity:0.04; line-height:1; pointer-events:none; letter-spacing:-20px; z-index:1;">${escapeHTML(text)}</div>`;
}

// === CHROME (brand mark, slide pill) ===

function brandMark(dark: boolean): string {
  const fg = dark ? C.slate[200] : C.slate[700];
  return `
    <div style="position:absolute; top:32px; left:36px; display:flex; align-items:center; gap:10px; z-index:3;">
      <svg viewBox="0 0 36 36" width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${C.brand[600]}"/>
            <stop offset="100%" stop-color="${C.brand[500]}"/>
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="9" fill="url(#bg)"/>
        <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="${FONTS.display}" font-weight="800" font-size="14">PJ</text>
      </svg>
      <span style="font-family:${FONTS.mono}; font-size:11px; color:${fg}; letter-spacing:0.14em; font-weight:600;">PRANITHJAIN</span>
    </div>
  `;
}

function slidePill(index: number, total: number, dark: boolean): string {
  return `
    <div style="position:absolute; bottom:32px; right:36px; display:flex; align-items:center; gap:10px; padding:8px 14px; background:${dark ? 'rgba(255,255,255,0.08)' : 'white'}; border:1px solid ${dark ? 'rgba(255,255,255,0.15)' : C.slate[200]}; border-radius:24px; backdrop-filter:blur(8px); z-index:3; box-shadow:${dark ? 'none' : `0 2px 8px ${C.slate[200]}`};">
      <div style="display:flex; gap:4px;">
        ${Array.from({ length: total }, (_, i) => `<div style="width:5px; height:5px; border-radius:50%; background:${i === index - 1 ? C.brand[500] : dark ? 'rgba(255,255,255,0.2)' : C.slate[300]}; transition:background 0.2s;"></div>`).join('')}
      </div>
      <span style="font-family:${FONTS.mono}; font-size:11px; color:${dark ? C.slate[200] : C.slate[500]}; font-weight:600; letter-spacing:0.05em;">${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
    </div>
  `;
}

function handleWatermark(dark: boolean): string {
  const fg = dark ? C.slate[400] : C.slate[500];
  return `<div style="position:absolute; bottom:32px; left:36px; font-family:${FONTS.mono}; font-size:10px; color:${fg}; letter-spacing:0.12em; font-weight:500; z-index:3; opacity:0.7;">@pranithjain</div>`;
}

// === LAYOUT VARIANTS ===

function renderHeroLayout(slide: ContentSlide, accent: string): string {
  const fg = C.white;
  const muted = C.slate[300];
  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:40px; text-align:center; padding:0 60px;">
      ${
        slide.eyebrow
          ? `<div style="display:inline-flex; align-items:center; gap:10px; padding:8px 20px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:24px;">
        <div style="width:6px; height:6px; border-radius:50%; background:${accent}; box-shadow:0 0 12px ${accent};"></div>
        <span style="font-family:${FONTS.mono}; font-size:11px; color:${muted}; letter-spacing:0.2em; text-transform:uppercase; font-weight:600;">${escapeHTML(slide.eyebrow)}</span>
      </div>`
          : ''
      }
      ${slide.visual ? `<div style="font-size:88px; line-height:1; opacity:0.95;">${resolveIcon(slide.visual)}</div>` : ''}
      <h2 style="font-size:72px; font-weight:800; font-family:${FONTS.display}; line-height:0.95; margin:0; color:${fg}; letter-spacing:-3px; max-width:90%;">
        ${escapeHTML(slide.headline)}
      </h2>
      ${slide.body ? `<p style="font-size:24px; font-family:${FONTS.body}; line-height:1.5; color:${muted}; margin:0; max-width:80%; font-weight:400;">${escapeHTML(slide.body)}</p>` : ''}
    </div>
  `;
}

function renderStatLayout(slide: ContentSlide, accent: string, dark: boolean): string {
  const fg = dark ? C.white : C.slate[900];
  const muted = dark ? C.slate[300] : C.slate[500];
  const cardBg = dark ? 'rgba(255,255,255,0.04)' : C.white;
  const cardBorder = dark ? 'rgba(255,255,255,0.1)' : C.slate[200];

  return `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:48px;">
      ${
        slide.eyebrow
          ? `<div style="display:inline-flex; align-items:center; gap:10px; padding:8px 20px; background:${cardBg}; border:1px solid ${cardBorder}; border-radius:24px;">
        <div style="width:6px; height:6px; border-radius:50%; background:${accent};"></div>
        <span style="font-family:${FONTS.mono}; font-size:11px; color:${muted}; letter-spacing:0.2em; text-transform:uppercase; font-weight:600;">${escapeHTML(slide.eyebrow)}</span>
      </div>`
          : ''
      }
      <div style="position:relative; text-align:center;">
        <div style="font-size:200px; font-weight:800; font-family:${FONTS.display}; color:${accent}; line-height:0.85; letter-spacing:-8px; text-shadow:0 0 80px ${accent}40;">
          ${escapeHTML(slide.stat!.value)}
        </div>
        <div style="font-size:26px; font-weight:500; font-family:${FONTS.body}; color:${muted}; margin-top:24px; max-width:80%; margin-left:auto; margin-right:auto; line-height:1.5;">
          ${escapeHTML(slide.stat!.label)}
        </div>
      </div>
      <div style="display:flex; align-items:flex-end; gap:6px; padding:18px 24px; background:${cardBg}; border:1px solid ${cardBorder}; border-radius:16px;">
        ${[14, 22, 10, 28, 18, 34, 22, 38, 28, 22, 44, 32, 26, 50, 38, 30, 56, 42, 36, 60]
          .map(
            (h, i) =>
              `<div style="width:10px; height:${h}px; background:linear-gradient(to top, ${accent}cc, ${accent}); border-radius:2px; opacity:${0.3 + (i / 20) * 0.7};"></div>`
          )
          .join('')}
      </div>
    </div>
  `;
}

function renderListLayout(slide: ContentSlide, accent: string, dark: boolean): string {
  const fg = dark ? C.white : C.slate[900];
  const muted = dark ? C.slate[300] : C.slate[500];
  const cardBg = dark ? 'rgba(255,255,255,0.05)' : C.white;
  const cardBorder = dark ? 'rgba(255,255,255,0.1)' : C.slate[200];
  const cardShadow = dark ? 'none' : `0 1px 3px ${C.slate[200]}`;
  const bullets = slide.bullets ?? [];

  return `<div style="display:flex; flex-direction:column; gap:14px; width:100%;">${bullets
    .map(
      (b, i) => `
      <div style="display:flex; align-items:center; gap:20px; padding:18px 22px; background:${cardBg}; border:1px solid ${cardBorder}; border-radius:14px; box-shadow:${cardShadow};">
        <div style="display:flex; align-items:center; justify-content:center; width:36px; height:36px; min-width:36px; border-radius:10px; background:${accent}; color:white; font-family:${FONTS.mono}; font-size:14px; font-weight:700;">
          ${String(i + 1).padStart(2, '0')}
        </div>
        <div style="flex:1; font-size:20px; font-family:${FONTS.body}; line-height:1.4; color:${fg}; font-weight:500;">
          ${escapeHTML(b)}
        </div>
      </div>
    `
    )
    .join('')}</div>`;
}

function renderFrameworkLayout(slide: ContentSlide, accent: string, dark: boolean): string {
  const fg = dark ? C.white : C.slate[900];
  const muted = dark ? C.slate[300] : C.slate[500];
  const cardBg = dark ? 'rgba(255,255,255,0.05)' : C.white;
  const cardBorder = dark ? 'rgba(255,255,255,0.1)' : C.slate[200];
  const cardShadow = dark ? 'none' : `0 1px 3px ${C.slate[200]}`;
  const bullets = slide.bullets ?? [];

  return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; width:100%;">${bullets
    .map(
      (b, i) => `
      <div style="padding:24px 22px; background:${cardBg}; border:1px solid ${cardBorder}; border-radius:16px; box-shadow:${cardShadow}; display:flex; flex-direction:column; gap:12px; position:relative; overflow:hidden;">
        <div style="position:absolute; top:0; left:0; width:40px; height:4px; background:${accent}; border-radius:0 2px 2px 0;"></div>
        <div style="font-family:${FONTS.mono}; font-size:11px; color:${accent}; text-transform:uppercase; letter-spacing:0.18em; font-weight:700; margin-top:8px;">
          STEP ${String(i + 1).padStart(2, '0')}
        </div>
        <div style="font-size:17px; font-family:${FONTS.body}; line-height:1.45; color:${fg}; font-weight:500;">
          ${escapeHTML(b)}
        </div>
      </div>
    `
    )
    .join('')}</div>`;
}

function renderComparisonLayout(slide: ContentSlide, accent: string, dark: boolean): string {
  const fg = dark ? C.white : C.slate[900];
  const muted = dark ? C.slate[300] : C.slate[500];
  const cardBg = dark ? 'rgba(255,255,255,0.05)' : C.white;
  const cardBorder = dark ? 'rgba(255,255,255,0.1)' : C.slate[200];
  const bullets = slide.bullets ?? [];
  const half = Math.ceil(bullets.length / 2);
  const left = bullets.slice(0, half);
  const right = bullets.slice(half);

  return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:20px; width:100%;">
    <div style="display:flex; flex-direction:column; gap:10px; padding:20px; background:${cardBg}; border:1px solid ${cardBorder}; border-radius:16px;">
      <div style="font-family:${FONTS.mono}; font-size:10px; color:${C.severity.critical}; text-transform:uppercase; letter-spacing:0.18em; font-weight:700; margin-bottom:6px;">Before</div>
      ${left.map((b) => `<div style="font-size:16px; font-family:${FONTS.body}; line-height:1.4; color:${muted}; padding:6px 0;">${escapeHTML(b)}</div>`).join('')}
    </div>
    <div style="display:flex; flex-direction:column; gap:10px; padding:20px; background:${cardBg}; border:2px solid ${accent}40; border-radius:16px;">
      <div style="font-family:${FONTS.mono}; font-size:10px; color:${accent}; text-transform:uppercase; letter-spacing:0.18em; font-weight:700; margin-bottom:6px;">After</div>
      ${right.map((b) => `<div style="font-size:16px; font-family:${FONTS.body}; line-height:1.4; color:${fg}; padding:6px 0; font-weight:500;">${escapeHTML(b)}</div>`).join('')}
    </div>
  </div>`;
}

function renderQuoteLayout(slide: ContentSlide, accent: string, dark: boolean): string {
  const fg = dark ? C.white : C.slate[900];
  const muted = dark ? C.slate[300] : C.slate[500];
  return `
    <div style="display:flex; flex-direction:column; justify-content:center; height:100%; padding:0 40px; position:relative;">
      <div style="font-size:160px; line-height:0.5; color:${accent}; font-family:${FONTS.display}; font-weight:800; margin-bottom:24px;">"</div>
      <p style="font-size:32px; font-family:${FONTS.display}; line-height:1.3; color:${fg}; margin:0; font-weight:600; letter-spacing:-0.5px;">
        ${escapeHTML(slide.body ?? slide.headline)}
      </p>
      ${slide.headline && slide.body ? `<div style="font-family:${FONTS.mono}; font-size:13px; color:${muted}; margin-top:24px; letter-spacing:0.1em; text-transform:uppercase;">— ${escapeHTML(slide.headline)}</div>` : ''}
    </div>
  `;
}

function renderBodyLayout(slide: ContentSlide, accent: string, dark: boolean): string {
  const fg = dark ? C.white : C.slate[900];
  const muted = dark ? C.slate[300] : C.slate[500];
  if (slide.body) {
    return `<p style="font-size:24px; font-family:${FONTS.body}; line-height:1.65; color:${muted}; max-width:95%; margin:0;">${escapeHTML(slide.body)}</p>`;
  }
  return '';
}

// === LAYOUT DETECTION ===

function detectLayout(slide: ContentSlide, slideIndex: number, total: number): SlideLayout {
  if (slide.layout && slide.layout !== 'auto') return slide.layout;
  if (slide.isCTA) return 'cta';
  if (slideIndex === 1 && !slide.stat) return 'hero';
  if (slide.stat) return 'stat';
  if (slide.bullets) {
    if (slide.bullets.length === 4) return 'framework';
    if (slide.bullets.length === 6) return 'framework';
    return 'list';
  }
  if (slide.body && slide.body.length > 80) return 'quote';
  return 'auto';
}

// === SLIDE RENDERER ===

function renderSlide(spec: ContentSpec, slide: ContentSlide, slideWidth: number, slideHeight: number): string {
  const isHook = slide.index === 1;
  const isCTA = slide.isCTA === true;
  const funnel = FUNNEL_BG[spec.funnel];
  const accent = slide.accent ?? funnel.accent;
  const layout = detectLayout(slide, slide.index, spec.slides.length);

  // Background and text color logic
  let bg: string;
  let fg: string;
  let muted: string;
  let isDark: boolean;

  if (slide.bg) {
    bg = slide.bg;
    isDark = true;
    fg = slide.color ?? C.white;
    muted = C.slate[300];
  } else if (isHook || isCTA || layout === 'stat') {
    if (layout === 'stat' && !isHook && !isCTA) {
      bg = C.white;
      isDark = false;
      fg = C.slate[900];
      muted = C.slate[500];
    } else {
      bg = `linear-gradient(135deg, ${C.slate[950]} 0%, ${C.slate[900]} 40%, ${accent}cc 100%)`;
      isDark = true;
      fg = C.white;
      muted = C.slate[300];
    }
  } else {
    bg = funnel.tint;
    isDark = false;
    fg = C.slate[900];
    muted = C.slate[600];
  }

  // Body content per layout
  let contentHTML: string;
  switch (layout) {
    case 'hero':
      contentHTML = renderHeroLayout({ ...slide, accent }, accent);
      break;
    case 'stat':
      contentHTML = renderStatLayout({ ...slide, accent }, accent, isDark);
      break;
    case 'list':
      contentHTML = renderListLayout({ ...slide, accent }, accent, isDark);
      break;
    case 'framework':
      contentHTML = renderFrameworkLayout({ ...slide, accent }, accent, isDark);
      break;
    case 'comparison':
      contentHTML = renderComparisonLayout({ ...slide, accent }, accent, isDark);
      break;
    case 'quote':
      contentHTML = renderQuoteLayout({ ...slide, accent }, accent, isDark);
      break;
    case 'cta':
      contentHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:36px; text-align:center; padding:0 60px;">
          ${slide.eyebrow ? `<div style="font-family:${FONTS.mono}; font-size:13px; color:${C.brand[400]}; letter-spacing:0.2em; text-transform:uppercase; font-weight:700;">${escapeHTML(slide.eyebrow)}</div>` : ''}
          <h2 style="font-size:64px; font-weight:800; font-family:${FONTS.display}; line-height:1; margin:0; color:white; letter-spacing:-2px; max-width:90%;">
            ${escapeHTML(slide.headline)}
          </h2>
          ${slide.body ? `<p style="font-size:24px; font-family:${FONTS.body}; line-height:1.5; color:${C.slate[200]}; margin:0; max-width:80%;">${escapeHTML(slide.body)}</p>` : ''}
          <div style="display:inline-flex; align-items:center; gap:12px; padding:18px 32px; background:white; color:${C.slate[900]}; border-radius:32px; font-family:${FONTS.body}; font-size:18px; font-weight:700; letter-spacing:0.02em;">
            ${slide.visual ? `<span style="font-size:22px;">${resolveIcon(slide.visual)}</span>` : ''}
            ${escapeHTML(spec.cta)}
          </div>
        </div>
      `;
      break;
    default:
      contentHTML = renderBodyLayout(slide, accent, isDark);
  }

  // Headline (skip for stat layout, hero, cta — those embed it)
  const skipHeadline = layout === 'stat' || layout === 'hero' || layout === 'cta' || layout === 'quote';
  const headlineHTML = skipHeadline
    ? ''
    : `
    <div style="display:flex; flex-direction:column; gap:14px; margin-bottom:28px;">
      ${
        slide.eyebrow
          ? `<div style="display:inline-flex; align-items:center; gap:8px; align-self:flex-start;">
        <div style="width:24px; height:2px; background:${accent};"></div>
        <span style="font-family:${FONTS.mono}; font-size:11px; color:${accent}; letter-spacing:0.2em; text-transform:uppercase; font-weight:700;">${escapeHTML(slide.eyebrow)}</span>
      </div>`
          : ''
      }
      <h2 style="font-size:${layout === 'comparison' ? '34px' : '44px'}; font-weight:800; font-family:${FONTS.display};
        line-height:1.05; margin:0; color:${fg}; letter-spacing:-1.5px; max-width:95%;">
        ${escapeHTML(slide.headline)}
      </h2>
    </div>
  `;

  // Watermark (subtle big text behind content)
  const watermarkHTML = slide.headline ? bigWatermark(slide.headline.split(' ')[0]!, isDark ? C.white : accent) : '';

  return `
  <div class="slide" style="
    width:${slideWidth}px; height:${slideHeight}px;
    background:${bg};
    color:${fg};
    position:relative; overflow:hidden;
    display:flex; flex-direction:column; justify-content:center;
    padding:100px 80px 100px;
    box-sizing:border-box;
    page-break-after:always;
  ">
    ${topAccentBar(accent)}
    ${isDark ? noiseOverlay(0.04) : ''}
    ${isDark ? gradientBlobs(accent) : ''}
    ${isDark ? '' : gridPattern()}
    ${cornerShape(accent, isHook ? 'tr' : 'bl')}
    ${isDark ? '' : leftAccentBar(accent)}
    ${watermarkHTML}
    ${brandMark(isDark)}
    ${headlineHTML}
    <div style="position:relative; z-index:2;">${contentHTML}</div>
    ${handleWatermark(isDark)}
    ${slidePill(slide.index, spec.slides.length, isDark)}
    ${isCTA ? bottomAccentBar(accent) : ''}
  </div>`;
}

// === TOP-LEVEL RENDERER ===

export function renderCarouselHTML(spec: ContentSpec): string {
  const width = 1080;
  const height = 1350;
  const slidesHTML = spec.slides.map((s) => renderSlide(spec, s, width, height)).join('\n');
  const funnel = FUNNEL_BG[spec.funnel];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(spec.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: ${FONTS.body};
      background: ${C.slate[100]};
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 64px;
      padding: 64px 24px;
    }
    .slide {
      border-radius: 28px;
      box-shadow: 0 24px 64px rgba(15, 23, 42, 0.15), 0 8px 24px rgba(15, 23, 42, 0.08);
    }
    @media print {
      body { background: white; padding: 0; gap: 0; }
      .slide { border-radius: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div style="text-align:center; margin-bottom:8px; max-width:1080px;">
    <h1 style="font-family:${FONTS.display}; font-size:30px; font-weight:800;
      color:${C.slate[900]}; margin-bottom:8px; letter-spacing:-1px;
      max-width:880px; margin-left:auto; margin-right:auto; line-height:1.15;
      overflow-wrap:break-word; word-wrap:break-word; hyphens:auto;">
      ${escapeHTML(spec.title)}
    </h1>
    <div style="font-family:${FONTS.mono}; font-size:11px; color:${funnel.accent};
      letter-spacing:0.2em; text-transform:uppercase; font-weight:700; margin-bottom:20px;">
      ${funnel.label} · ${spec.platform} · ${spec.format}
    </div>
    <div style="display:inline-flex; align-items:center; gap:14px; padding:10px 22px; background:white; border-radius:14px; box-shadow:0 4px 16px rgba(15, 23, 42, 0.04); border:1px solid ${C.slate[200]};">
      <div style="display:flex; align-items:center; gap:8px;">
        <div style="width:8px; height:8px; border-radius:50%; background:${funnel.accent}; box-shadow:0 0 10px ${funnel.accent}80;"></div>
        <span style="font-family:${FONTS.mono}; font-size:11px; color:${funnel.accent}; font-weight:700; text-transform:uppercase; letter-spacing:0.15em;">
          ${spec.hook}
        </span>
      </div>
      <div style="width:1px; height:18px; background:${C.slate[200]};"></div>
      <span style="font-family:${FONTS.mono}; font-size:11px; color:${C.slate[500]};">
        ${spec.slides.length} slides
      </span>
      <div style="width:1px; height:18px; background:${C.slate[200]};"></div>
      <span style="font-family:${FONTS.mono}; font-size:11px; color:${C.slate[500]};">
        ${spec.persona}
      </span>
    </div>
  </div>
  ${slidesHTML}
</body>
</html>`;
}

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
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      display:flex;
      justify-content:center;
      align-items:center;
      min-height:100vh;
      background:${C.slate[100]};
      padding:48px;
    }
  </style>
</head>
<body>
  ${slideHTML}
</body>
</html>`;
}
