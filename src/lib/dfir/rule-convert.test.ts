import { describe, it, expect } from 'vitest';
import { convertRule } from './rule-convert';

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
    const r = convertRule('just some prose with no structure', 'kql', 'sigma');
    expect(r.ok).toBe(false);
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
