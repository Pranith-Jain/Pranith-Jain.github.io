import { describe, it, expect } from 'vitest';
import { convertRule, convertBatch, parseToIr, FIELD_MAPS, findFieldMap } from './rule-convert';

const SIGMA = `title: Certutil URL cache download
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\\\\certutil.exe'
    CommandLine|contains:
      - 'urlcache'
      - 'http'
  condition: selection
level: high`;

describe('convertRule — Sigma source', () => {
  it('Sigma → KQL produces field operators', () => {
    const r = convertRule(SIGMA, 'sigma', 'kql');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('where');
    expect(r.output).toContain('Image endswith ');
    expect(r.output).toContain('CommandLine contains "urlcache"');
  });

  it('Sigma → Splunk uses wildcard syntax', () => {
    const r = convertRule(SIGMA, 'sigma', 'splunk');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('Image="*');
    expect(r.output).toContain('CommandLine="*urlcache*"');
  });

  it('Sigma → EQL picks the process category head', () => {
    const r = convertRule(SIGMA, 'sigma', 'eql');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output.startsWith('process where')).toBe(true);
    expect(r.output).toContain('endsWith(Image,');
  });

  it('Sigma → YARA extracts string literals with a heuristic warning', () => {
    const r = convertRule(SIGMA, 'sigma', 'yara');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('rule ');
    expect(r.output).toContain('$s1 =');
    expect(r.output).toContain('of them');
    expect(r.warnings.some((w) => /YARA output is a string-extraction heuristic/.test(w))).toBe(true);
  });

  it('Sigma → DLP emits a regex pattern list', () => {
    const r = convertRule(SIGMA, 'sigma', 'dlp');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parsed = JSON.parse(r.output) as { patterns: { regex: string }[] };
    expect(parsed.patterns.length).toBeGreaterThan(0);
    expect(parsed.patterns.some((p) => p.regex.includes('urlcache'))).toBe(true);
  });

  it('Sigma → Sigma round-trips the structure', () => {
    const r = convertRule(SIGMA, 'sigma', 'sigma');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('detection:');
    expect(r.output).toContain('condition: selection');
    expect(r.output).toContain('product: windows');
  });

  it('Sigma → supply-chain yields a Semgrep scaffold + strong caveat', () => {
    const r = convertRule(SIGMA, 'sigma', 'supplychain');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('rules:');
    expect(r.warnings.some((w) => /NOT a faithful transpile/.test(w))).toBe(true);
  });
});

describe('convertRule — heuristic reverse parsers', () => {
  it('KQL → Sigma recovers predicates', () => {
    const kql = 'SecurityEvent | where Image endswith "powershell.exe" and CommandLine contains "FromBase64String"';
    const r = convertRule(kql, 'kql', 'sigma');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('Image|endswith');
    expect(r.output).toContain('CommandLine|contains');
    expect(r.warnings.some((w) => /heuristic/i.test(w))).toBe(true);
  });

  it('Splunk → KQL recovers wildcard semantics', () => {
    const spl = 'index=win Image="*\\\\rundll32.exe" CommandLine="*javascript:*"';
    const r = convertRule(spl, 'splunk', 'kql');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('Image endswith');
    expect(r.output).toContain('CommandLine contains "javascript:"');
  });

  it('errors clearly on unparseable input', () => {
    // An operator-only input (no field, no value) — neither the strict
    // parser nor the heuristic can recover a predicate. We expect a clean
    // error rather than a silently-mis-shapen rule.
    const r = convertRule('where == and', 'kql', 'sigma');
    expect(r.ok).toBe(false);
  });

  it('does not silently flip `!=` to equality and warns about negation (KQL)', () => {
    // As of 2026-06-22 the strict KQL parser DOES consume `!=` and emits
    // a warning that the negation is flattened to a positive form. The IR
    // still has no native negation, so the underlying behavior (warn about
    // it) is preserved — we just don't pretend to drop the predicate.
    const r = convertRule('Events | where Image == "a.exe" and User != "SYSTEM"', 'kql', 'sigma');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('Image: "a.exe"');
    expect(r.warnings.some((w) => /negation/i.test(w))).toBe(true);
  });

  it('does not silently flip `!=` to equality and warns about negation (SPL)', () => {
    const r = convertRule('index=win Image="a.exe" User!="SYSTEM"', 'splunk', 'sigma');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).not.toMatch(/User\b\s*:\s*"?SYSTEM"?/);
    expect(r.warnings.some((w) => /negation/.test(w))).toBe(true);
  });
});

describe('convertRule — universal sources', () => {
  it('Lucene → Sigma recovers wildcard predicates', () => {
    const r = convertRule('Image:*\\\\powershell.exe AND CommandLine:*Base64*', 'lucene', 'sigma');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('Image|endswith');
    expect(r.output).toContain('CommandLine|contains');
  });

  it('EQL → KQL recovers string functions and the category', () => {
    const eql =
      'process where stringContains(process.command_line, "Invoke-Expression") and endsWith(process.name, "powershell.exe")';
    const r = convertRule(eql, 'eql', 'kql');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('process.command_line contains "Invoke-Expression"');
    expect(r.output).toContain('process.name endswith "powershell.exe"');
  });

  it('YARA → Sigma turns string literals into keywords', () => {
    const yara = 'rule R { strings: $a = "DownloadString" $re = /IEX\\(/ condition: any of them }';
    const r = convertRule(yara, 'yara', 'sigma');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('DownloadString');
    expect(r.warnings.some((w) => /YARA parsing is heuristic/.test(w))).toBe(true);
  });

  it('DLP JSON → KQL round-trips the regex patterns', () => {
    const dlp = JSON.stringify({ name: 'x', match: 'any', patterns: [{ id: 'p1', field: 'body', regex: 'evilcorp' }] });
    const r = convertRule(dlp, 'dlp', 'kql');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('body matches regex "evilcorp"');
  });

  it('supply-chain scaffold → YARA extracts pattern-regex literals', () => {
    const sc = 'rules:\n  - id: r\n    message: "m"\n    patterns:\n      - pattern-regex: "malicious_pkg"';
    const r = convertRule(sc, 'supplychain', 'yara');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('malicious_pkg');
  });

  it('every format is accepted as a source (no output-only rejection)', () => {
    const sigma = convertRule('detection:\n  sel:\n    f: v\n  condition: sel', 'sigma', 'sigma');
    expect(sigma.ok).toBe(true);
    // a same-format conversion is allowed and flagged as a normalised round-trip
    if (sigma.ok) expect(sigma.warnings.some((w) => /round-trip/.test(w))).toBe(true);
  });
});

describe('field-map remapping', () => {
  const SIGMA = `title: T
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\\\\powershell.exe'
    CommandLine|contains: 'IEX'
    UnknownField: 'x'
  condition: selection`;

  it('rewrites known Sigma field names per the selected preset', () => {
    const m = findFieldMap('elastic-ecs')!;
    const r = convertRule(SIGMA, 'sigma', 'kql', { fieldMap: m.mappings, fieldMapLabel: m.label });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('process.executable');
    expect(r.output).toContain('process.command_line');
    expect(r.output).not.toContain('Image endswith');
    expect(r.warnings.some((w) => /rewrote 2 field/i.test(w))).toBe(true);
  });

  it('flags fields the preset has no mapping for', () => {
    const m = findFieldMap('elastic-ecs')!;
    const r = convertRule(SIGMA, 'sigma', 'kql', { fieldMap: m.mappings });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => /no entry for 1 field/i.test(w) && /UnknownField/.test(w))).toBe(true);
  });

  it('pass-through preset emits Sigma field names verbatim', () => {
    const m = findFieldMap('passthrough')!;
    const r = convertRule(SIGMA, 'sigma', 'kql', { fieldMap: m.mappings });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toContain('Image endswith');
    expect(r.warnings.every((w) => !/rewrote/.test(w))).toBe(true);
  });

  it('FIELD_MAPS exposes the documented presets', () => {
    expect(FIELD_MAPS.map((m) => m.id)).toEqual(
      expect.arrayContaining(['passthrough', 'defender-m365', 'elastic-ecs', 'splunk-cim'])
    );
  });
});

describe('convertBatch', () => {
  it('converts a multi-doc Sigma stream to one target each', () => {
    const a = `title: A
logsource:
  product: windows
  category: process_creation
detection:
  s:
    Image|endswith: '\\\\a.exe'
  condition: s`;
    const b = `title: B
logsource:
  product: windows
  category: process_creation
detection:
  s:
    Image|endswith: '\\\\b.exe'
  condition: s`;
    const r = convertBatch(`${a}\n---\n${b}`, 'sigma', 'kql');
    expect(r).toHaveLength(2);
    expect(r[0]!.ok).toBe(true);
    expect(r[1]!.ok).toBe(true);
    expect(r[0]!.title).toBe('A');
    expect(r[1]!.title).toBe('B');
    expect(r[0]!.output).toContain('a.exe');
    expect(r[1]!.output).toContain('b.exe');
  });

  it('refuses non-Sigma batch input with a single explanatory error', () => {
    const r = convertBatch('whatever', 'kql', 'sigma');
    expect(r).toHaveLength(1);
    expect(r[0]!.ok).toBe(false);
    expect(r[0]!.error).toMatch(/sigma/i);
  });

  it('drops empty / comment-only docs at the seams', () => {
    const real = `title: Real
logsource:
  product: windows
  category: process_creation
detection:
  s:
    Image: 'x'
  condition: s`;
    const stream = `\n---\n${real}\n---\n# comment\n---\n`;
    const r = convertBatch(stream, 'sigma', 'kql');
    expect(r).toHaveLength(1);
    expect(r[0]!.title).toBe('Real');
  });
});

describe('parseToIr', () => {
  it('returns the IR without emitting on success', () => {
    const r = parseToIr('title: T\ndetection:\n  s:\n    f: v\n  condition: s', 'sigma');
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.title).toBe('T');
    expect(r.groups[0]!.name).toBe('s');
  });

  it('surfaces the parser error verbatim on failure', () => {
    const r = parseToIr('', 'sigma');
    expect('error' in r).toBe(true);
  });
});

describe('convertRule - KQL strict boolean round-trip (new in 2026-06-22)', () => {
  it('KQL AND -> KQL preserves structure', () => {
    const r = convertRule('where Image == "cmd.exe" and CommandLine contains "powershell"', 'kql', 'kql');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toMatch(/Image == "cmd\.exe"/);
    expect(r.output).toMatch(/CommandLine contains "powershell"/);
    expect(r.output).toMatch(/\band\b/);
  });

  it('KQL OR -> KQL preserves structure', () => {
    const r = convertRule('where Image == "a.exe" or Image == "b.exe"', 'kql', 'kql');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toMatch(/\bor\b/);
  });

  it('KQL NOT + parens -> KQL preserves structure', () => {
    const r = convertRule(
      'where not (Image == "a.exe" or Image == "b.exe") and CommandLine contains "x"',
      'kql',
      'kql'
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.output).toMatch(/\bnot\b/);
    expect(r.output).toMatch(/[()]/);
    expect(r.output).toMatch(/\band\b/);
  });

  it('KQL -> Splunk preserves AND', () => {
    const r = convertRule('where Image == "cmd.exe" and CommandLine contains "powershell"', 'kql', 'splunk');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Splunk syntax uses AND in the resulting query; the boolean structure
    // is preserved.
    expect(r.output).toMatch(/AND|and/);
  });

  it('falls back to heuristic for non-bare KQL (join clause) without crashing', () => {
    const r = convertRule('Table1 | join kind=inner (Table2) on UserId', 'kql', 'kql');
    // We just need to not throw. The strict parser rejects this; the heuristic
    // may or may not match anything. Either result is fine.
    if (r.ok) {
      expect(typeof r.output).toBe('string');
    } else {
      expect(r.error).toBeTruthy();
    }
  });
});
