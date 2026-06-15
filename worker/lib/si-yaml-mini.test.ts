/**
 * Tests for the Security Investigator minimal YAML parser.
 * Run via: npx vitest run worker/lib/si-yaml-mini.test.ts
 *
 * The parser file is shared between api/ and worker/ via a re-import
 * (the api/ one is the source, the worker tests it to leverage the
 * root vitest config that already includes worker/).
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error - first line is a JSDoc comment; the parser file uses
// non-null assertions on indexed access (intentional TS relaxation).
import { parseMiniYaml, MiniYamlError } from '../../api/src/lib/si-yaml-mini';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('parseMiniYaml', () => {
  it('parses a top-level key:value', () => {
    expect(parseMiniYaml('title: hello\nwidth: 1400\n')).toEqual({ title: 'hello', width: 1400 });
  });

  it('parses nested objects with 2-space indent', () => {
    const yaml = `
canvas:
  width: 1400
  height: 900
palette:
  primary: "#58a6ff"
`;
    expect(parseMiniYaml(yaml)).toEqual({
      canvas: { width: 1400, height: 900 },
      palette: { primary: '#58a6ff' },
    });
  });

  it('parses lists with - prefix', () => {
    const yaml = `
widgets:
  - type: kpi-card
    name: k1
    label: Incidents
  - type: donut
    name: d1
`;
    const out = parseMiniYaml(yaml) as { widgets: Array<Record<string, string>> };
    expect(out.widgets).toHaveLength(2);
    expect(out.widgets[0]).toEqual({ type: 'kpi-card', name: 'k1', label: 'Incidents' });
  });

  it('handles block-literal `|` scalar at tail of manifest', () => {
    const yaml = `
canvas:
  width: 1400
  height: 900
data_sources:
  report_file: "temp/threat_pulse_*.md"
  field_mapping_notes: |
    # Row 1 - Title
    workspace_name: "config.json -> azure_mcp.workspace_name"
    scan_timestamp: "Report header -> timestamp"
    lookback_period: "Report header -> lookback (default 7d)"
`;
    const out = parseMiniYaml(yaml) as {
      canvas: { width: number };
      data_sources: { report_file: string; field_mapping_notes: string };
    };
    expect(out.canvas.width).toBe(1400);
    expect(out.data_sources.report_file).toBe('temp/threat_pulse_*.md');
    expect(out.data_sources.field_mapping_notes).toContain('workspace_name');
    expect(out.data_sources.field_mapping_notes).toContain('lookback_period');
  });

  it('handles block-folded `>` scalar', () => {
    const yaml = `
note: >
  line one
  line two
  line three
`;
    const out = parseMiniYaml(yaml) as { note: string };
    expect(out.note).toContain('line one');
    expect(out.note).toContain('line three');
  });

  it('parses the full threat-pulse svgWidgetsYaml without errors', () => {
    const path = join(process.cwd(), 'public/data/si/skills/threat-pulse.json');
    const skill = JSON.parse(readFileSync(path, 'utf-8')) as { svgWidgetsYaml?: string };
    expect(skill.svgWidgetsYaml).toBeDefined();
    // The upstream manifest uses a `rows:` layout (each row having its own
    // `widgets:` array). The parser must handle it without throwing.
    const out = parseMiniYaml(skill.svgWidgetsYaml!) as {
      canvas: { width: number };
      rows: Array<{ widgets: Array<{ type: string }> }>;
    };
    expect(out.canvas.width).toBe(1400);
    // Sum the widgets across all rows to make sure they survived parsing.
    const totalWidgets = (out.rows ?? []).reduce((sum, r) => sum + (r.widgets ?? []).length, 0);
    expect(totalWidgets).toBeGreaterThan(5);
  });

  it('throws MiniYamlError on truly malformed input', () => {
    expect(() => parseMiniYaml('  bad-indent: oops\n')).toThrow(MiniYamlError);
  });
});
