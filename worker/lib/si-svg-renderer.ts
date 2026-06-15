/**
 * Server-side SVG dashboard renderer.
 *
 * Renders the upstream svg-dashboard skill's widget types to a self-
 * contained <svg> string. Supports 14 widget types — the full set
 * declared in the 14 svg-widgets.yaml files shipped by upstream.
 *
 * Supported widget types:
 *   - title-banner
 *   - kpi-card
 *   - delta-kpi-card
 *   - score-card
 *   - donut-chart
 *   - stacked-bar-chart
 *   - horizontal-bar-chart
 *   - line-chart
 *   - waterfall-chart
 *   - sparkline
 *   - progress-bar
 *   - table-widget
 *   - recommendation-cards
 *   - assessment-banner
 *   - coverage-matrix
 *
 * The renderer takes the parsed YAML manifest as input. (The MCP tool
 * si_render_svg_dashboard already returns the raw YAML; the HTTP route
 * /api/v1/si/render accepts a {manifest, data} body and parses the YAML
 * for the caller.)
 *
 * For PNG output of the rendered dashboard, see worker/lib/si-svg-png.ts
 * and the /api/v1/si/render?format=png route.
 */

export interface RenderPalette {
  primary?: string;
  secondary?: string;
  accent?: string;
  danger?: string;
  success?: string;
  warning?: string;
  muted?: string;
  card_bg?: string;
  card_border?: string;
  text_primary?: string;
  text_secondary?: string;
  grid_line?: string;
  bar_label?: string;
  background?: string;
}

export interface RenderManifest {
  canvas?: { width?: number; height?: number; background?: string; padding?: number; row_gap?: number; col_gap?: number; font_family?: string };
  palette?: RenderPalette;
  widgets?: Array<Record<string, unknown>>;
}

export interface RenderData {
  /** Map of widget name → data object (matching the widget's `data` shape). */
  [widgetName: string]: unknown;
}

const DEFAULT_PALETTE: Required<RenderPalette> = {
  primary: '#409AE1',
  secondary: '#b4a0ff',
  accent: '#FFC83D',
  danger: '#EF6950',
  success: '#40C5AF',
  warning: '#ff8c00',
  muted: '#b2b2b2',
  card_bg: '#161b22',
  card_border: '#30363d',
  text_primary: '#e6edf3',
  text_secondary: '#b2b2b2',
  grid_line: '#30363d',
  bar_label: '#ffffff',
  background: '#0d1117',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v == null ? fallback : String(v);
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// ─── Widget renderers ─────────────────────────────────────────────

function renderTitleBanner(w: Record<string, unknown>, palette: Required<RenderPalette>, width: number): string {
  const title = asString(w.title, '');
  const subtitle = asString(w.subtitle, '');
  const x = width / 2;
  const titleSize = asNumber(w.title_size, 28);
  const subtitleSize = asNumber(w.subtitle_size, 14);
  return `
  <g class="title-banner">
    <text x="${x}" y="40" text-anchor="middle" font-size="${titleSize}" font-weight="700" fill="${palette.text_primary}">${esc(title)}</text>
    <text x="${x}" y="${40 + titleSize * 0.7}" text-anchor="middle" font-size="${subtitleSize}" fill="${palette.text_secondary}">${esc(subtitle)}</text>
    <line x1="${x - 80}" y1="${40 + titleSize * 0.85}" x2="${x + 80}" y2="${40 + titleSize * 0.85}" stroke="${palette.primary}" stroke-width="3"/>
  </g>`;
}

function renderKpiCard(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  const value = asString((w as { value?: unknown }).value ?? (w.data as { value?: unknown } | undefined)?.value, '–');
  const label = asString((w as { label?: unknown }).label ?? (w.data as { label?: unknown } | undefined)?.label, '');
  const unit = asString((w as { unit?: unknown }).unit ?? (w.data as { unit?: unknown } | undefined)?.unit, '');
  const highlight = asString(w.highlight_color, palette.primary);
  const valueSize = asNumber(w.value_size, 36);
  return `
  <g class="kpi-card" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    <text x="${w_px / 2}" y="${h_px / 2 + valueSize * 0.35}" text-anchor="middle" font-size="${valueSize}" font-weight="700" fill="${highlight}">${esc(value)}${esc(unit)}</text>
    <text x="${w_px / 2}" y="${h_px - 18}" text-anchor="middle" font-size="12" fill="${palette.text_secondary}">${esc(label)}</text>
  </g>`;
}

function renderScoreCard(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  const score = asNumber((w as { value?: unknown }).value ?? (w.data as { score?: unknown } | undefined)?.score, 0);
  const label = asString((w as { label?: unknown }).label ?? (w.data as { label?: unknown } | undefined)?.label, '');
  const ranges = (w.ranges as Array<{ max: number; color?: string; label: string }> | undefined) ?? [];
  // Pick the range whose max is >= score; default to last.
  let color = palette.text_primary;
  for (const r of ranges) {
    if (score <= r.max) { color = r.color ?? palette.text_primary; break; }
  }
  return `
  <g class="score-card" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    <text x="${w_px / 2}" y="28" text-anchor="middle" font-size="14" font-weight="700" fill="${palette.text_primary}">${esc(label)}</text>
    <text x="${w_px / 2}" y="78" text-anchor="middle" font-size="44" font-weight="700" fill="${color}">${score}</text>
    <text x="${w_px / 2 + score.toString().length * 14}" y="78" font-size="18" fill="${palette.text_secondary}">/100</text>
    <text x="${w_px / 2}" y="${h_px - 16}" text-anchor="middle" font-size="14" font-weight="700" fill="${color}">${esc(ranges.find((r) => score <= r.max)?.label ?? '')}</text>
  </g>`;
}

function renderDonutChart(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  const segments = (w.segments as Array<{ label: string; value: number; color?: string }> | undefined)
    ?? (w.data as unknown as { segments?: Array<{ label: string; value: number; color?: string }> } | undefined)?.segments
    ?? [];
  if (segments.length === 0) return '';
  const total = (segments as Array<{ value: number }>).reduce((sum: number, s: { value: number }) => sum + s.value, 0);
  if (total <= 0) return '';
  const radius = 70;
  const cx = 90, cy = h_px / 2;
  const circumference = 2 * Math.PI * radius;
  const colors = [palette.primary, palette.secondary, palette.accent, palette.success, palette.warning, palette.danger];
  let offset = 0;
  const arcs: string[] = [];
  segments.forEach((seg, i) => {
    const arcLen = (seg.value / total) * circumference;
    const dashArray = `${arcLen}, ${circumference - arcLen}`;
    const dashOffset = circumference - offset;
    const color = seg.color ?? colors[i % colors.length];
    arcs.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="20" stroke-dasharray="${dashArray}" stroke-dashoffset="${dashOffset}" transform="rotate(-90, ${cx}, ${cy})"><title>${esc(seg.label)}: ${seg.value} (${((seg.value / total) * 100).toFixed(1)}%)</title></circle>`);
    offset += arcLen;
  });
  const legendX = 200;
  const legendLines: string[] = segments.map((seg: { label: string; value: number; color?: string }, i: number) => {
    const color = seg.color ?? colors[i % colors.length];
    return `<rect x="${legendX}" y="${cy - segments.length * 10 + i * 22}" width="14" height="14" fill="${color}" rx="2"/>` +
           `<text x="${legendX + 22}" y="${cy - segments.length * 10 + i * 22 + 11}" font-size="12" fill="${palette.text_primary}">${esc(seg.label)} (${seg.value})</text>`;
  });
  return `
  <g class="donut-chart" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    ${arcs.join('\n    ')}
    ${w.show_center_total !== false ? `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="22" font-weight="700" fill="${palette.text_primary}">${total}</text>` : ''}
    ${legendLines.join('\n    ')}
  </g>`;
}

function renderStackedBarChart(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  type Cat = { label: string; values: Array<{ label: string; value: number; color?: string }> };
  const categories: Cat[] = (w.categories as Cat[] | undefined)
    ?? ((w.data as { categories?: Cat[] } | undefined)?.categories ?? []);
  if (categories.length === 0) return '';
  const colors = [palette.primary, palette.secondary, palette.accent, palette.success, palette.warning, palette.danger];
  const maxTotal = Math.max(...(categories as Array<{ values: Array<{ value: number }> }>).map((c) => c.values.reduce((sum: number, v: { value: number }) => sum + v.value, 0)), 1);
  const padding = 30;
  const barWidth = (w_px - padding * 2) / categories.length * 0.7;
  const barGap = (w_px - padding * 2) / categories.length * 0.3;
  const chartH = h_px - padding * 2;
  const bars: string[] = [];
  categories.forEach((cat, i) => {
    const x0 = padding + i * (barWidth + barGap);
    let cumY = padding + chartH;
    cat.values.forEach((v: { label: string; value: number; color?: string }, j: number) => {
      const segH = (v.value / maxTotal) * chartH;
      cumY -= segH;
      const color = v.color ?? colors[j % colors.length];
      bars.push(`<rect x="${x0}" y="${cumY}" width="${barWidth}" height="${segH}" fill="${color}"><title>${esc(cat.label)} → ${esc(v.label)}: ${v.value}</title></rect>`);
    });
    bars.push(`<text x="${x0 + barWidth / 2}" y="${padding + chartH + 18}" text-anchor="middle" font-size="11" fill="${palette.text_secondary}">${esc(cat.label)}</text>`);
    const total = cat.values.reduce((s: number, v: { value: number }) => s + v.value, 0);
    if (w.show_totals !== false) {
      bars.push(`<text x="${x0 + barWidth / 2}" y="${padding + chartH - (total / maxTotal) * chartH - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${palette.text_primary}">${total}</text>`);
    }
  });
  return `
  <g class="stacked-bar-chart" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    ${bars.join('\n    ')}
  </g>`;
}

function renderTableWidget(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  type Col = { key: string; label: string; width?: number; align?: 'left' | 'right' | 'center' };
  const columns: Col[] = (w.columns as Col[] | undefined) ?? [];
  const rows: Record<string, unknown>[] = (w.rows as Record<string, unknown>[] | undefined) ?? [];
  if (columns.length === 0 || rows.length === 0) return '';
  const padding = 16;
  const headerH = 28;
  const rowH = 22;
  const colW = (w_px - padding * 2) / columns.length;
  const lines: string[] = [];
  // Header
  columns.forEach((col, i) => {
    const cx = padding + i * colW + 8;
    lines.push(`<text x="${cx}" y="${padding + 18}" font-size="12" font-weight="700" fill="${palette.text_secondary}">${esc(col.label.toUpperCase())}</text>`);
  });
  // Header underline
  lines.push(`<line x1="${padding}" y1="${padding + headerH}" x2="${w_px - padding}" y2="${padding + headerH}" stroke="${palette.card_border}" stroke-width="1"/>`);
  // Rows
  rows.forEach((row: Record<string, unknown>, ri: number) => {
    const y0 = padding + headerH + 8 + ri * rowH;
    if (ri % 2 === 1) {
      lines.push(`<rect x="${padding}" y="${y0 - 14}" width="${w_px - padding * 2}" height="${rowH}" fill="${palette.card_bg}" opacity="0.5"/>`);
    }
    columns.forEach((col, i) => {
      const cx = padding + i * colW + 8;
      const val = row[col.key];
      const text = val == null ? '' : String(val);
      lines.push(`<text x="${cx}" y="${y0}" font-size="12" fill="${palette.text_primary}">${esc(text)}</text>`);
    });
  });
  return `
  <g class="table-widget" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    ${lines.join('\n    ')}
  </g>`;
}

// ─── Top-level layout + dispatch ──────────────────────────────────

type WidgetRenderer = (w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number) => string;
const RENDERERS: Record<string, WidgetRenderer> = {
  'kpi-card': renderKpiCard,
  'delta-kpi-card': renderDeltaKpiCard,
  'score-card': renderScoreCard,
  'donut-chart': renderDonutChart,
  'stacked-bar-chart': renderStackedBarChart,
  'horizontal-bar-chart': renderHorizontalBarChart,
  'line-chart': renderLineChart,
  'waterfall-chart': renderWaterfallChart,
  'sparkline': renderSparkline,
  'progress-bar': renderProgressBar,
  'table-widget': renderTableWidget,
  'recommendation-cards': renderRecommendationCards,
  'assessment-banner': renderAssessmentBanner,
  'coverage-matrix': renderCoverageMatrix,
};

export function renderDashboard(manifest: RenderManifest, data: RenderData = {}): string {
  const canvas = manifest.canvas ?? {};
  const W = canvas.width ?? 1400;
  const H = canvas.height ?? 900;
  const pad = canvas.padding ?? 40;
  const rowGap = canvas.row_gap ?? 20;
  const colGap = canvas.col_gap ?? 24;
  const fontFamily = canvas.font_family ?? 'Segoe UI, Roboto, sans-serif';
  const palette: Required<RenderPalette> = { ...DEFAULT_PALETTE, ...(manifest.palette ?? {}), background: canvas.background ?? DEFAULT_PALETTE.background };

  const widgets = manifest.widgets ?? [];
  // 2-column grid layout. Widgets with type=full-width span both columns.
  const cellW = (W - pad * 2 - colGap) / 2;
  const cursorY = pad;
  const rowBuf: Array<{ widget: Record<string, unknown>; x: number; y: number; w: number; h: number }> = [];

  const placeWidget = (w: Record<string, unknown>, w_px: number, h_px: number, x: number, y: number) => {
    const renderer = RENDERERS[asString(w.type, '')];
    if (!renderer) {
      // Unsupported — drop a "use the manifest directly" stub.
      return `<g class="unsupported" transform="translate(${x}, ${y})"><rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.warning}" stroke-dasharray="4 4"/><text x="${w_px / 2}" y="${h_px / 2}" text-anchor="middle" font-size="12" fill="${palette.warning}">Widget "${esc(asString(w.type, '?'))}" not yet server-renderable. Use si_render_svg_dashboard for the raw manifest.</text></g>`;
    }
    // Merge `data` field with the global `data` map (per-name lookup).
    const wd = (data as Record<string, unknown>)[asString(w.name, '')];
    if (wd) {
      w = { ...w, data: { ...(w.data ?? {}), ...wd } };
    }
    return renderer(w, palette, x, y, w_px, h_px);
  };

  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<!-- Generated by si-svg-renderer.ts (Worker edge) — based on SCStelz/security-investigator svg-dashboard skill -->`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${esc(fontFamily)}">`);
  out.push(`<rect width="${W}" height="${H}" fill="${palette.background}"/>`);

  // Title banner gets its own row at the top if present.
  const titleW = widgets.find((w) => w.type === 'title-banner');
  if (titleW) {
    out.push(renderTitleBanner(titleW, palette, W));
  }

  let cy = pad + (titleW ? 80 : 0);
  let cx = pad;
  for (let i = (titleW ? 1 : 0); i < widgets.length; i++) {
    const w = widgets[i];
    if (!w) continue;
    const wtype = asString(w.type, '');
    if (wtype === 'title-banner') continue; // already handled
    const h = asNumber(w.height, 180);
    const isFull = wtype === 'title-banner' || w.full_width === true;
    const placeW = isFull ? W - pad * 2 : cellW;
    const placeX = isFull ? pad : cx;
    out.push(placeWidget(w, placeW, h, placeX, cy));
    if (isFull) {
      cy += h + rowGap;
      cx = pad;
    } else if (cx + colGap + cellW + pad > W) {
      cy += h + rowGap;
      cx = pad;
    } else {
      cx += cellW + colGap;
    }
  }
  out.push('</svg>');
  return out.join('\n');
}

// ─── Round 4: 8 more widget types ───────────────────────────────────

function renderDeltaKpiCard(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  const value = asString((w as { value?: unknown }).value ?? (w.data as { value?: unknown } | undefined)?.value, '–');
  const label = asString((w as { label?: unknown }).label ?? (w.data as { label?: unknown } | undefined)?.label, '');
  const delta = asNumber((w as { delta?: unknown }).delta ?? (w.data as { delta?: unknown } | undefined)?.delta, 0);
  const unit = asString(w.unit ?? '', '');
  const period = asString(w.comparison_period ?? 'vs prior', 'vs prior');
  const invert = w.invert_color === true;
  const favorable = invert ? delta < 0 : delta > 0;
  const deltaColor = favorable ? palette.success : palette.danger;
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '–';
  const valueSize = asNumber(w.value_size, 36);
  return `
  <g class="delta-kpi-card" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    <text x="${w_px / 2}" y="${h_px / 2 - 6}" text-anchor="middle" font-size="${valueSize}" font-weight="700" fill="${palette.primary}">${esc(value)}${esc(unit)}</text>
    <text x="${w_px / 2}" y="${h_px / 2 + 28}" text-anchor="middle" font-size="14" font-weight="700" fill="${deltaColor}">${arrow} ${Math.abs(delta)}%</text>
    <text x="${w_px / 2}" y="${h_px - 18}" text-anchor="middle" font-size="12" fill="${palette.text_secondary}">${esc(label)} · ${esc(period)}</text>
  </g>`;
}

function renderSparkline(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  const values = (w.values as number[] | undefined) ?? (w.data as { values?: number[] } | undefined)?.values ?? [];
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padX = 8, padY = 12;
  const stepX = (w_px - padX * 2) / (values.length - 1);
  const points = values.map((v, i) => `${padX + i * stepX},${padY + (1 - (v - min) / range) * (h_px - padY * 2)}`).join(' ');
  const lastColor = values[values.length - 1]! >= values[0]! ? palette.success : palette.danger;
  const fillColor = w.line_color ? asString(w.line_color, palette.primary) : lastColor;
  const label = asString(w.label, '');
  const final = asString(w.final_value ?? values[values.length - 1], '');
  return `
  <g class="sparkline" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    <text x="${padX}" y="18" font-size="11" fill="${palette.text_secondary}">${esc(label)}</text>
    <text x="${w_px - padX}" y="18" text-anchor="end" font-size="13" font-weight="700" fill="${fillColor}">${esc(final)}</text>
    <polyline points="${points}" fill="none" stroke="${fillColor}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${padX + (values.length - 1) * stepX}" cy="${padY + (1 - (values[values.length - 1]! - min) / range) * (h_px - padY * 2)}" r="3" fill="${fillColor}"/>
  </g>`;
}

function renderProgressBar(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  const value = asNumber(w.value ?? (w.data as { value?: number } | undefined)?.value, 0);
  const max = asNumber(w.max ?? 100, 100);
  const label = asString(w.label, '');
  const sublabel = asString(w.sublabel, '');
  const color = asString(w.color, palette.primary);
  const pct = Math.min(value / max, 1);
  const barH = 18;
  const padX = 16, padY = 18;
  const barW = w_px - padX * 2;
  return `
  <g class="progress-bar" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    <text x="${padX}" y="${padY + 12}" font-size="13" font-weight="700" fill="${palette.text_primary}">${esc(label)}</text>
    <text x="${w_px - padX}" y="${padY + 12}" text-anchor="end" font-size="12" fill="${palette.text_secondary}">${value} / ${max}</text>
    <rect x="${padX}" y="${padY + 22}" width="${barW}" height="${barH}" rx="9" fill="${palette.grid_line}"/>
    <rect x="${padX}" y="${padY + 22}" width="${barW * pct}" height="${barH}" rx="9" fill="${color}"/>
    ${sublabel ? `<text x="${padX}" y="${padY + 22 + barH + 14}" font-size="10" fill="${palette.text_secondary}">${esc(sublabel)}</text>` : ''}
  </g>`;
}

function renderHorizontalBarChart(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  type Bar = { label: string; value: number; color?: string; suffix?: string; tier?: string };
  const bars = (w.bars as Bar[] | undefined) ?? (w.data as { bars?: Bar[] } | undefined)?.bars ?? [];
  if (bars.length === 0) return '';
  const sorted = [...bars].sort((a, b) => b.value - a.value);
  const max = Math.max(...sorted.map((b) => b.value), 1);
  const padX = 16, padY = 16;
  const labelW = 100;
  const valueW = 60;
  const barAreaW = w_px - padX * 2 - labelW - valueW;
  const rowH = Math.min(28, (h_px - padY * 2) / sorted.length);
  const colors = [palette.primary, palette.secondary, palette.accent, palette.warning, palette.danger];
  const lines: string[] = [];
  sorted.forEach((bar, i) => {
    const y0 = padY + i * rowH;
    const color = bar.color ?? colors[i % colors.length]!;
    const barW = (bar.value / max) * barAreaW;
    lines.push(`<text x="${padX}" y="${y0 + rowH * 0.7}" font-size="12" fill="${palette.text_primary}">${esc(bar.label)}</text>`);
    if (bar.tier) {
      const tierColors: Record<string, string> = { tier_1: palette.success, tier_2: palette.warning, tier_3: palette.danger };
      const tc = tierColors[bar.tier] ?? palette.muted;
      lines.push(`<rect x="${padX + 90}" y="${y0 + rowH * 0.25}" width="20" height="${rowH * 0.5}" rx="3" fill="${tc}"/>`);
    }
    lines.push(`<rect x="${padX + labelW}" y="${y0 + rowH * 0.3}" width="${barW}" height="${rowH * 0.4}" fill="${color}" rx="2"/>`);
    const valueX = padX + labelW + barAreaW + 6;
    lines.push(`<text x="${valueX}" y="${y0 + rowH * 0.7}" font-size="12" font-weight="700" fill="${bar.value === 0 ? palette.danger : palette.text_primary}">${bar.value}${esc(bar.suffix ?? '')}</text>`);
  });
  return `
  <g class="horizontal-bar-chart" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    ${lines.join('\n    ')}
  </g>`;
}

function renderLineChart(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  type Pt = { x: string; y: number };
  const points = (w.points as Pt[] | undefined) ?? (w.data as { points?: Pt[] } | undefined)?.points ?? [];
  if (points.length < 2) return '';
  const values = points.map((p) => p.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padX = 36, padY = 24;
  const innerW = w_px - padX * 2;
  const innerH = h_px - padY * 2;
  const stepX = innerW / (points.length - 1);
  // Grid lines (5 horizontal)
  const grid: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const gy = padY + (i / 4) * innerH;
    const gv = max - (i / 4) * range;
    grid.push(`<line x1="${padX}" y1="${gy}" x2="${w_px - padX}" y2="${gy}" stroke="${palette.grid_line}" stroke-width="0.5" stroke-dasharray="2 4"/>`);
    grid.push(`<text x="${padX - 6}" y="${gy + 4}" text-anchor="end" font-size="9" fill="${palette.text_secondary}">${gv.toFixed(0)}</text>`);
  }
  // Peak/low/avg markers
  let peakIdx = 0, lowIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > values[peakIdx]!) peakIdx = i;
    if (values[i]! < values[lowIdx]!) lowIdx = i;
  }
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const polyline = points.map((p, i) => `${padX + i * stepX},${padY + (1 - (p.y - min) / range) * innerH}`).join(' ');
  const autoColor = points[points.length - 1]!.y >= points[0]!.y ? palette.success : palette.danger;
  const lineColor = asString(w.line_color, autoColor);
  const avgY = padY + (1 - (avg - min) / range) * innerH;
  return `
  <g class="line-chart" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    ${grid.join('\n    ')}
    <line x1="${padX}" y1="${avgY}" x2="${w_px - padX}" y2="${avgY}" stroke="${palette.muted}" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="${w_px - padX + 4}" y="${avgY + 4}" font-size="9" fill="${palette.muted}">avg</text>
    <polyline points="${polyline}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linejoin="round"/>
    <text x="${padX + peakIdx * stepX}" y="${padY + (1 - (values[peakIdx]! - min) / range) * innerH - 6}" text-anchor="middle" font-size="12" fill="${palette.success}">▲ ${values[peakIdx]}</text>
    <text x="${padX + lowIdx * stepX}" y="${padY + (1 - (values[lowIdx]! - min) / range) * innerH + 14}" text-anchor="middle" font-size="12" fill="${palette.danger}">▼ ${values[lowIdx]}</text>
  </g>`;
}

function renderWaterfallChart(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  type Wf = { label: string; value: number };
  const steps = (w.steps as Wf[] | undefined) ?? (w.data as { steps?: Wf[] } | undefined)?.steps ?? [];
  if (steps.length === 0) return '';
  // Compute running totals.
  let running = 0;
  const computed = steps.map((s) => {
    const start = running;
    running += s.value;
    return { ...s, start, end: running, isTotal: false };
  });
  const minV = Math.min(...computed.map((c) => Math.min(c.start, c.end)), 0);
  const maxV = Math.max(...computed.map((c) => Math.max(c.start, c.end)), 1);
  const range = maxV - minV || 1;
  const padX = 16, padY = 24;
  const innerH = h_px - padY * 2 - 16;
  const barW = (w_px - padX * 2) / computed.length * 0.7;
  const barGap = (w_px - padX * 2) / computed.length * 0.3;
  const bars: string[] = [];
  computed.forEach((c, i) => {
    const x0 = padX + i * (barW + barGap);
    const yTop = padY + (1 - (Math.max(c.start, c.end) - minV) / range) * innerH;
    const yBot = padY + (1 - (Math.min(c.start, c.end) - minV) / range) * innerH;
    const color = c.value >= 0 ? palette.success : palette.danger;
    bars.push(`<rect x="${x0}" y="${yTop}" width="${barW}" height="${yBot - yTop}" fill="${color}" opacity="0.85"><title>${esc(c.label)}: ${c.value >= 0 ? '+' : ''}${c.value}</title></rect>`);
    bars.push(`<text x="${x0 + barW / 2}" y="${padY + innerH + 14}" text-anchor="middle" font-size="10" fill="${palette.text_secondary}">${esc(c.label)}</text>`);
    bars.push(`<text x="${x0 + barW / 2}" y="${yTop - 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${color}">${c.value >= 0 ? '+' : ''}${c.value}</text>`);
    if (i < computed.length - 1) {
      const next = computed[i + 1]!;
      const connY = padY + (1 - (next.start - minV) / range) * innerH;
      bars.push(`<line x1="${x0 + barW}" y1="${connY}" x2="${x0 + barW + barGap}" y2="${connY}" stroke="${palette.muted}" stroke-width="1" stroke-dasharray="2 2"/>`);
    }
  });
  return `
  <g class="waterfall-chart" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    ${bars.join('\n    ')}
  </g>`;
}

function renderRecommendationCards(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  type Rec = { title: string; description: string; priority?: 'low' | 'medium' | 'high' | 'critical'; impact?: string };
  const recs = (w.recommendations as Rec[] | undefined) ?? (w.data as { recommendations?: Rec[] } | undefined)?.recommendations ?? [];
  if (recs.length === 0) return '';
  const cardColors: Record<string, string> = { low: palette.muted, medium: palette.warning, high: palette.warning, critical: palette.danger };
  const padX = 12, padY = 12, gap = 10;
  const cardW = (w_px - padX * 2 - gap * (recs.length - 1)) / recs.length;
  const cardH = h_px - padY * 2;
  const cards = recs.map((r, i) => {
    const cx = padX + i * (cardW + gap);
    const color = cardColors[r.priority ?? 'medium'] ?? palette.warning;
    return `<g transform="translate(${cx}, ${padY})">
      <rect width="${cardW}" height="${cardH}" rx="8" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
      <rect width="4" height="${cardH}" rx="2" fill="${color}"/>
      <text x="14" y="20" font-size="13" font-weight="700" fill="${palette.text_primary}">${esc(r.title)}</text>
      <foreignObject x="14" y="26" width="${cardW - 20}" height="${cardH - 40}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:11px;color:${palette.text_secondary};line-height:1.4">${esc(r.description)}</div>
      </foreignObject>
      ${r.impact ? `<text x="14" y="${cardH - 8}" font-size="10" fill="${color}">→ ${esc(r.impact)}</text>` : ''}
    </g>`;
  });
  return `
  <g class="recommendation-cards" transform="translate(${x}, ${y})">
    ${cards.join('\n    ')}
  </g>`;
}

function renderAssessmentBanner(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  const title = asString(w.title, 'Assessment');
  const main = asString(w.assessment ?? w.description, '');
  const risks = (w.key_risks as string[] | undefined) ?? [];
  const strengths = (w.strengths as string[] | undefined) ?? [];
  const color = asString(w.color, palette.warning);
  const padX = 20, padY = 16;
  return `
  <g class="assessment-banner" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="8" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    <rect width="6" height="${h_px}" rx="3" fill="${color}"/>
    <text x="${padX + 4}" y="${padY + 18}" font-size="16" font-weight="700" fill="${palette.text_primary}">${esc(title)}</text>
    <text x="${padX + 4}" y="${padY + 42}" font-size="13" fill="${palette.text_secondary}">${esc(main)}</text>
    ${risks.length > 0 ? `<text x="${padX + 4}" y="${padY + 70}" font-size="11" font-weight="700" fill="${palette.danger}">⚠ Key risks</text>` +
      risks.map((r, i) => `<text x="${padX + 4}" y="${padY + 88 + i * 14}" font-size="11" fill="${palette.danger}">• ${esc(r)}</text>`).join('') : ''}
    ${strengths.length > 0 ? `<text x="${padX + 4 + 280}" y="${padY + 70}" font-size="11" font-weight="700" fill="${palette.success}">✓ Strengths</text>` +
      strengths.map((s, i) => `<text x="${padX + 4 + 280}" y="${padY + 88 + i * 14}" font-size="11" fill="${palette.success}">• ${esc(s)}</text>`).join('') : ''}
  </g>`;
}

function renderCoverageMatrix(w: Record<string, unknown>, palette: Required<RenderPalette>, x: number, y: number, w_px: number, h_px: number): string {
  type Col = { column: string; items: Array<{ name: string; status: string }> };
  const cols = (w.field as Col[] | undefined) ?? (w.data as { field?: Col[] } | undefined)?.field ?? [];
  if (cols.length === 0) return '';
  const statusColors = (w.status_colors as Record<string, string> | undefined) ?? { covered: palette.success, partial: palette.warning, uncovered: palette.muted };
  const cellSize = asNumber(w.cell_size, 12);
  const cellGap = asNumber(w.cell_gap, 2);
  const colGap = asNumber(w.col_gap, 6);
  const sortOrder = (w.sort_order as string[] | undefined) ?? Object.keys(statusColors);
  // Per the spec: sort cells within each column by status priority (covered first).
  const sortedCols = cols.map((c) => ({
    ...c,
    items: [...c.items].sort((a, b) => {
      const ai = sortOrder.indexOf(a.status);
      const bi = sortOrder.indexOf(b.status);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }),
  }));
  const maxRows = Math.max(...sortedCols.map((c) => c.items.length), 1);
  const colW = cellSize + cellGap;
  const totalW = cols.length * colW + (cols.length - 1) * colGap;
  const startX = (w_px - totalW) / 2;
  const headerH = 60;
  const cells: string[] = [];
  sortedCols.forEach((c, ci) => {
    const cx0 = startX + ci * (colW + colGap);
    // Rotated header
    cells.push(`<text x="${cx0 + cellSize / 2}" y="${headerH}" font-size="10" fill="${palette.text_primary}" transform="rotate(-45, ${cx0 + cellSize / 2}, ${headerH})" text-anchor="end">${esc(c.column)}</text>`);
    c.items.forEach((it, ri) => {
      const cy = headerH + 10 + ri * (cellSize + cellGap);
      const color = statusColors[it.status] ?? palette.muted;
      cells.push(`<rect x="${cx0}" y="${cy}" width="${cellSize}" height="${cellSize}" fill="${color}" rx="1"><title>${esc(it.name)}: ${esc(it.status)}</title></rect>`);
    });
    // Footer count
    if (w.show_col_footer !== false) {
      const covered = c.items.filter((i) => i.status === 'covered' || i.status === sortOrder[0]).length;
      cells.push(`<text x="${cx0 + cellSize / 2}" y="${headerH + 10 + maxRows * (cellSize + cellGap) + 10}" text-anchor="middle" font-size="9" fill="${palette.text_secondary}">${covered}/${c.items.length}</text>`);
    }
  });
  // Legend
  const legendY = h_px - 16;
  const legendItems = Object.entries(statusColors).map(([status, color], i) => {
    const lx = 16 + i * 120;
    return `<rect x="${lx}" y="${legendY - 8}" width="10" height="10" fill="${color}" rx="1"/><text x="${lx + 14}" y="${legendY}" font-size="10" fill="${palette.text_primary}">${esc(status)}</text>`;
  });
  return `
  <g class="coverage-matrix" transform="translate(${x}, ${y})">
    <rect width="${w_px}" height="${h_px}" rx="12" fill="${palette.card_bg}" stroke="${palette.card_border}" stroke-width="1"/>
    ${cells.join('\n    ')}
    ${legendItems.join('\n    ')}
  </g>`;
}

// Register all 8 new types in the dispatch table.
Object.assign(RENDERERS, {
  'delta-kpi-card': renderDeltaKpiCard,
  'sparkline': renderSparkline,
  'progress-bar': renderProgressBar,
  'horizontal-bar-chart': renderHorizontalBarChart,
  'line-chart': renderLineChart,
  'waterfall-chart': renderWaterfallChart,
  'recommendation-cards': renderRecommendationCards,
  'assessment-banner': renderAssessmentBanner,
  'coverage-matrix': renderCoverageMatrix,
});
