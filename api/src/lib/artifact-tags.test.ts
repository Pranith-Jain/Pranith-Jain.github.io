import { describe, it, expect } from 'vitest';
import { classifyArtifact, artifactType, highRiskTags } from './artifact-tags';

describe('artifactType', () => {
  it('detects directories by trailing slash', () => {
    expect(artifactType('.git/')).toBe('DIR');
    expect(artifactType('Loot/')).toBe('DIR');
  });

  it('maps extensions to coarse types', () => {
    expect(artifactType('arsenal.py')).toBe('PY');
    expect(artifactType('server.log')).toBe('LOG');
    expect(artifactType('auth_exploitation_queue.json')).toBe('JSON');
    expect(artifactType('SharpHound.exe')).toBe('EXE');
    expect(artifactType('meterpreter.dll')).toBe('DLL');
    expect(artifactType('privesc.zip')).toBe('ZIP');
    expect(artifactType('report.md')).toBe('MD');
  });

  it('falls back to FILE for unknown/extensionless names', () => {
    expect(artifactType('.bash_history')).toBe('FILE');
    expect(artifactType('README')).toBe('FILE');
    expect(artifactType('')).toBe('FILE');
  });
});

describe('classifyArtifact', () => {
  it('flags a .git directory as git-exposure', () => {
    expect(classifyArtifact('.git/')).toContain('git-exposure');
  });

  it('flags shell history files', () => {
    expect(classifyArtifact('.bash_history')).toContain('history');
    expect(classifyArtifact('.lesshst')).toContain('history');
  });

  it('flags C2 tooling', () => {
    expect(classifyArtifact('meterpreter.dll')).toContain('c2');
    expect(classifyArtifact('Empire-usage.zip')).toContain('c2');
  });

  it('flags AD tooling', () => {
    expect(classifyArtifact('SharpHound.exe')).toContain('active-directory');
  });

  it('flags exploit artifacts', () => {
    expect(classifyArtifact('privesc.zip')).toContain('exploit');
    expect(classifyArtifact('CVE-2024-1709.py')).toContain('exploit');
  });

  it('flags MITM tooling', () => {
    expect(classifyArtifact('Inveigh.exe')).toContain('mitm');
  });

  it('flags scanner/tunnel directories', () => {
    expect(classifyArtifact('.BurpSuite/')).toContain('scanner');
    expect(classifyArtifact('.ngrok/')).toContain('tunnel');
  });

  it('uses the leak-type hint', () => {
    expect(classifyArtifact('data', 'mongodb-open')).toContain('database');
    expect(classifyArtifact('x', 'git-config-exposure')).toContain('git-exposure');
  });

  it('returns ordered, de-duplicated tags (high-risk first)', () => {
    const tags = classifyArtifact('mimikatz.exe');
    // active-directory comes before source-code in TAG_ORDER
    expect(tags.indexOf('active-directory')).toBeLessThan(tags.length);
    // no duplicates
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('returns empty for benign names', () => {
    expect(classifyArtifact('index.html')).toEqual([]);
  });
});

describe('highRiskTags', () => {
  it('keeps only high-signal tags', () => {
    expect(highRiskTags(['scanner', 'c2', 'archive', 'git-exposure'])).toEqual(['c2', 'git-exposure']);
  });
});
