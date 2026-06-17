/**
 * Smoke tests for the Security Investigator SVG dashboard renderer.
 * Run via: npx vitest run worker/lib/si-svg-renderer.test.ts
 *
 * Each test exercises exactly one widget type by building a minimal
 * manifest and asserting the renderer emits the expected SVG fragments
 * (e.g. axis labels, legend text, row content). Covers all 14 widget
 * types — the goal is "does the renderer accept this shape and emit
 * something sensible", not "does the layout pixel-match the upstream
 * reference".
 */
import { describe, it, expect } from 'vitest';
import { renderDashboard } from './si-svg-renderer';

const palette = {
  primary: '#58a6ff',
  secondary: '#a371f7',
  accent: '#d2a8ff',
  danger: '#f85149',
  warning: '#d29922',
  success: '#3fb950',
  text: '#e6edf3',
  background: '#0d1117',
};

const baseCanvas = { width: 1400, height: 900, background: '#0d1117', padding: 24 };

describe('renderDashboard — full widget coverage', () => {
  it('title-banner: emits title + subtitle text', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [{ type: 'title-banner', name: 'header', title: 'Threat Pulse 2026-06-13', subtitle: 'Daily scan' }],
      },
      {}
    );
    expect(svg).toContain('<svg');
    expect(svg).toContain('Threat Pulse 2026-06-13');
    expect(svg).toContain('Daily scan');
  });

  it('kpi-card: renders the value', () => {
    const svg = renderDashboard(
      { canvas: baseCanvas, palette, widgets: [{ type: 'kpi-card', name: 'k1', label: 'Open Incidents', value: 12 }] },
      {}
    );
    expect(svg).toMatch(/Open Incidents/);
    expect(svg).toMatch(/>\s*12\s*</);
  });

  it('delta-kpi-card: renders value + delta', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'delta-kpi-card',
            name: 'k1',
            label: 'New IOCs',
            value: 47,
            delta: -3,
            comparison_period: 'vs. yesterday',
          },
        ],
      },
      {}
    );
    expect(svg).toMatch(/New IOCs/);
    expect(svg).toMatch(/47/);
  });

  it('score-card: renders 0-100 score', () => {
    const svg = renderDashboard(
      { canvas: baseCanvas, palette, widgets: [{ type: 'score-card', name: 's1', label: 'Risk Score', value: 78 }] },
      {}
    );
    expect(svg).toMatch(/Risk Score/);
    expect(svg).toMatch(/78/);
  });

  it('donut-chart: renders the segment legend with each label', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'donut-chart',
            name: 'd1',
            segments: [
              { label: 'Critical', value: 3 },
              { label: 'High', value: 7 },
              { label: 'Medium', value: 12 },
            ],
          },
        ],
      },
      {}
    );
    expect(svg).toContain('Critical (3)');
    expect(svg).toContain('High (7)');
    expect(svg).toContain('Medium (12)');
    // The donut chart uses circles (stroke-dasharray), not <path>.
    expect(svg).toContain('<circle');
  });

  it('stacked-bar-chart: renders category labels', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'stacked-bar-chart',
            name: 'b1',
            categories: [
              {
                label: 'Cloud',
                values: [
                  { label: 'Critical', value: 4 },
                  { label: 'High', value: 8 },
                ],
              },
              {
                label: 'Identity',
                values: [
                  { label: 'Critical', value: 1 },
                  { label: 'High', value: 3 },
                ],
              },
            ],
          },
        ],
      },
      {}
    );
    expect(svg).toContain('Cloud');
    expect(svg).toContain('Identity');
    expect(svg).toContain('<rect');
  });

  it('horizontal-bar-chart: renders row labels', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'horizontal-bar-chart',
            name: 'h1',
            bars: [
              { label: 'URLhaus', value: 47 },
              { label: 'ThreatFox', value: 31 },
            ],
          },
        ],
      },
      {}
    );
    expect(svg).toContain('URLhaus');
    expect(svg).toContain('ThreatFox');
  });

  it('line-chart: renders the time series polyline', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'line-chart',
            name: 'l1',
            points: [
              { x: '2026-06-12', y: 10 },
              { x: '2026-06-13', y: 22 },
            ],
          },
        ],
      },
      {}
    );
    expect(svg).toContain('<polyline');
    // Peak/low markers from renderLineChart.
    expect(svg).toMatch(/22/);
  });

  it('waterfall-chart: renders step labels', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'waterfall-chart',
            name: 'w1',
            steps: [
              { label: 'Start', value: 100 },
              { label: 'Detections', value: 12 },
              { label: 'Mitigated', value: -5 },
              { label: 'End', value: 107 },
            ],
          },
        ],
      },
      {}
    );
    expect(svg).toContain('Start');
    expect(svg).toContain('End');
    expect(svg).toContain('Detections');
  });

  it('sparkline: renders a label + line element', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [{ type: 'sparkline', name: 'sp1', label: 'Trend', values: [1, 3, 2, 5, 4, 6, 8] }],
      },
      {}
    );
    expect(svg).toMatch(/Trend/);
    expect(svg).toContain('<polyline');
  });

  it('progress-bar: renders the label', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [{ type: 'progress-bar', name: 'p1', label: 'Coverage', value: 78, max: 100, sublabel: '78%' }],
      },
      {}
    );
    expect(svg).toMatch(/Coverage/);
  });

  it('table-widget: renders column headers + row cells', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'table-widget',
            name: 't1',
            columns: [
              { key: 'value', label: 'Indicator' },
              { key: 'count', label: 'Reports' },
            ],
            rows: [
              { value: '203.0.113.42', count: 12 },
              { value: '198.51.100.10', count: 5 },
            ],
          },
        ],
      },
      {}
    );
    // Headers are uppercased per renderTableWidget.
    expect(svg).toContain('INDICATOR');
    expect(svg).toContain('REPORTS');
    expect(svg).toContain('203.0.113.42');
    expect(svg).toContain('198.51.100.10');
  });

  it('recommendation-cards: renders card titles', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'recommendation-cards',
            name: 'r1',
            recommendations: [
              { title: 'Enable MFA', description: 'Roll out phishing-resistant MFA to 12 admin accounts.' },
            ],
          },
        ],
      },
      {}
    );
    expect(svg).toMatch(/Enable MFA/);
  });

  it('assessment-banner: renders the assessment text', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'assessment-banner',
            name: 'a1',
            title: 'Verdict',
            assessment: 'Elevated',
            description: 'Sustained AiTM activity against finance staff.',
          },
        ],
      },
      {}
    );
    expect(svg).toMatch(/Elevated/);
  });

  it('coverage-matrix: renders row + column labels', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          {
            type: 'coverage-matrix',
            name: 'c1',
            field: [
              {
                column: 'Email',
                items: [
                  { name: 'T1566 Phishing', status: 'covered' },
                  { name: 'T1078', status: 'partial' },
                ],
              },
              {
                column: 'Identity',
                items: [
                  { name: 'T1566 Phishing', status: 'partial' },
                  { name: 'T1078', status: 'covered' },
                ],
              },
              {
                column: 'Endpoint',
                items: [
                  { name: 'T1566 Phishing', status: 'uncovered' },
                  { name: 'T1078', status: 'partial' },
                ],
              },
            ],
          },
        ],
      },
      {}
    );
    expect(svg).toContain('Email');
    expect(svg).toContain('T1566 Phishing');
  });

  it('unknown widget type falls back to a dashed warning panel', () => {
    const svg = renderDashboard(
      { canvas: baseCanvas, palette, widgets: [{ type: 'not-a-real-widget', name: 'x', label: '?' }] },
      {}
    );
    expect(svg).toMatch(/unsupported/i);
    expect(svg).toContain('stroke-dasharray');
  });

  it('combined manifest with 3 widgets renders them all', () => {
    const svg = renderDashboard(
      {
        canvas: baseCanvas,
        palette,
        widgets: [
          { type: 'title-banner', name: 'h', title: 'Combined Report', subtitle: 'multi-widget' },
          { type: 'kpi-card', name: 'k1', label: 'Incidents', value: 8 },
          {
            type: 'donut-chart',
            name: 'd',
            segments: [
              { label: 'High', value: 5 },
              { label: 'Med', value: 3 },
            ],
          },
        ],
      },
      {}
    );
    expect(svg).toContain('Combined Report');
    expect(svg).toContain('Incidents');
    expect(svg).toContain('High (5)');
  });
});

describe('renderDashboard — XSS / DoS hardening', () => {
  it('palette color injection cannot break out of a fill="…" attribute', () => {
    const svg = renderDashboard(
      {
        canvas: { width: 400, height: 200 },
        palette: { card_bg: '#000"><script>alert(document.domain)</script><rect fill="#000' },
        widgets: [{ type: 'kpi-card', name: 'k', value: '1', label: 'x' }],
      },
      {}
    );
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('alert(document.domain)');
    // The malicious value is dropped and the trusted default is used instead.
    expect(svg).toContain('#161b22');
  });

  it('per-widget color injection (donut segment) is neutralized', () => {
    const svg = renderDashboard(
      {
        canvas: { width: 400, height: 300 },
        widgets: [
          {
            type: 'donut-chart',
            name: 'd',
            segments: [{ label: 'A', value: 1, color: 'red"/><script>alert(1)</script>' }],
          },
        ],
      },
      {}
    );
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('alert(1)');
  });

  it('legitimate colors (hex / rgb / named) still pass through', () => {
    const svg = renderDashboard(
      {
        canvas: { width: 400, height: 300 },
        widgets: [
          {
            type: 'donut-chart',
            name: 'd',
            segments: [
              { label: 'A', value: 1, color: '#ff8800' },
              { label: 'B', value: 1, color: 'rgb(10, 20, 30)' },
              { label: 'C', value: 1, color: 'tomato' },
            ],
          },
        ],
      },
      {}
    );
    expect(svg).toContain('#ff8800');
    expect(svg).toContain('rgb(10, 20, 30)');
    expect(svg).toContain('tomato');
  });

  it('clamps absurd canvas dimensions (denial-of-wallet guard)', () => {
    const svg = renderDashboard(
      {
        canvas: { width: 10, height: 5_000_000 },
        widgets: [{ type: 'kpi-card', name: 'k', value: '1', label: 'x' }],
      },
      {}
    );
    // viewBox / height must be clamped to the 4000px ceiling, never 5,000,000.
    expect(svg).not.toContain('5000000');
    expect(svg).toMatch(/height="4000"|viewBox="0 0 \d+ 4000"/);
  });

  it('caps widget count to bound output size', () => {
    const widgets = Array.from({ length: 200 }, (_, i) => ({
      type: 'kpi-card',
      name: `k${i}`,
      value: String(i),
      label: `L${i}`,
    }));
    const svg = renderDashboard({ canvas: { width: 1400, height: 900 }, widgets }, {});
    // Only the first 60 widgets are rendered.
    expect(svg).toContain('>L0<');
    expect(svg).not.toContain('>L120<');
  });
});
