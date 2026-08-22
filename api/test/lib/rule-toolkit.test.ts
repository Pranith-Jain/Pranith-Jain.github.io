import { describe, it, expect } from 'vitest'
import {
  validateYaraRule,
  validateSigmaRule,
  convertSigmaToSplunk,
  convertSigmaToKql,
  validateOsquerySql,
  validateSuricataRule,
} from '../../src/lib/rule-toolkit'

const PSEXEC_YAML = `title: PsExec Service Execution
id: 5a105398-c63d-4d0c-b2ff-a3b0a51d3b79
status: test
description: Detects PsExec service execution
logsource:
  product: windows
  service: process_creation
detection:
  sel_image:
    Image|endswith: '\\psexec.exe'
  sel_cmd:
    CommandLine|contains: '-accepteula'
  condition: sel_image and sel_cmd
tags:
  - attack.execution
  - attack.t1569.002
level: high
`

// ── YARA ───────────────────────────────────────────────────────────────────

describe('validateYaraRule', () => {
  it('passes valid multi-rule source with correct rule count', () => {
    const src = `
rule Hello : trojan {
  meta:
    author = "test"
  strings:
    $a = "hello"
    $b = { 4D 5A ?? 90 }
  condition:
    $a and $b
}
rule World {
  strings:
    $x = /evil\\.exe/
  condition:
    $x
}
`
    const r = validateYaraRule(src)
    expect(r.valid).toBe(true)
    expect(r.rules).toBe(2)
    expect(r.errors).toHaveLength(0)
  })

  it('catches unbalanced closing brace', () => {
    const src = `rule Bad { strings: $a = "hi" condition: $a } }`
    const r = validateYaraRule(src)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /unbalanced/i.test(e.message))).toBe(true)
  })

  it('catches unclosed brace at EOF', () => {
    const src = `rule Bad { strings: $a = "hi" condition: $a`
    const r = validateYaraRule(src)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /unclosed/i.test(e.message) || /brace/i.test(e.message))).toBe(true)
  })

  it('catches undefined string ref and warns on unused def', () => {
    const src = `
rule Bad {
  strings:
    $a = "hi"
    $unused = "x"
  condition:
    $a and $missing
}
`
    const r = validateYaraRule(src)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /\$missing/.test(e.message))).toBe(true)
    expect(r.warnings.some((w) => /\$unused/.test(w.message))).toBe(true)
  })

  it('handles wildcard $a* refs correctly (valid when prefix matches)', () => {
    const src = `
rule WithWildcard {
  strings:
    $a1 = "foo"
    $a2 = "bar"
  condition:
    1 of ($a*)
}
`
    const r = validateYaraRule(src)
    expect(r.valid).toBe(true)
  })

  it('flags malformed hex token', () => {
    const src = `
rule HexBad {
  strings:
    $h = { ZZ 12 }
  condition:
    $h
}
`
    const r = validateYaraRule(src)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /hex-string/.test(e.message))).toBe(true)
  })

  it('reports missing rule declaration', () => {
    const r = validateYaraRule('just some text without a rule header')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /no.*rule/i.test(e.message))).toBe(true)
  })

  it('catches duplicate rule names', () => {
    const src = `rule Dup { strings: $a="h" condition: $a } rule Dup { strings: $a="h" condition: $a }`
    const r = validateYaraRule(src)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /duplicate/i.test(e.message))).toBe(true)
  })
})

// ── Sigma validation ────────────────────────────────────────────────────────

describe('validateSigmaRule', () => {
  it('passes minimal valid rule with warnings for optional fields', () => {
    const yaml = `title: Test Rule
logsource:
  category: process_creation
  product: windows
detection:
  sel:
    CommandLine|contains: evil
  condition: sel
`
    const r = validateSigmaRule(yaml)
    expect(r.valid).toBe(true)
    expect(r.rule?.title).toBe('Test Rule')
  })

  it('fails when detection or condition missing', () => {
    const noCond = `title: T\nlogsource:\n  category: process_creation\ndetection:\n  sel:\n    Image: foo\n`
    expect(validateSigmaRule(noCond).valid).toBe(false)
    const noDetection = `title: T\nlogsource:\n  category: process_creation\n`
    expect(validateSigmaRule(noDetection).valid).toBe(false)
  })

  it('warns on unknown condition identifier', () => {
    const yaml = `title: T\nlogsource:\n  category: process_creation\ndetection:\n  sel: { Image: foo }\n  condition: sel and phantom`
    const r = validateSigmaRule(yaml)
    expect(r.warnings.some((w) => /phantom/.test(w.message))).toBe(true)
  })

  it('warns when id is not a UUID', () => {
    const yaml = `title: T\nid: not-a-uuid\nlogsource:\n  category: process_creation\ndetection:\n  sel: { a: b }\n  condition: sel`
    const r = validateSigmaRule(yaml)
    expect(r.warnings.some((w) => /UUID/i.test(w.message))).toBe(true)
  })

  it('passes realistic PsExec rule clean', () => {
    const r = validateSigmaRule(PSEXEC_YAML)
    expect(r.valid).toBe(true)
    expect(r.warnings.filter((w) => /unknown selection/.test(w.message))).toHaveLength(0)
  })
})

// ── Sigma conversion ────────────────────────────────────────────────────────

describe('Sigma → SPL / KQL conversion', () => {
  it('converts PsExec selections joined by AND with correct operator forms (SPL)', () => {
    const r = convertSigmaToSplunk(PSEXEC_YAML)
    expect(r.ok).toBe(true)
    expect(r.query).toContain('Image="*\\psexec.exe"')
    expect(r.query).toContain('CommandLine="*-accepteula*"')
    expect(r.query).toContain('AND')
  })

  it('converts PsExec rule to KQL with contains/endswith operators', () => {
    const r = convertSigmaToKql(PSEXEC_YAML)
    expect(r.ok).toBe(true)
    expect(r.query).toContain('contains "-accepteula"')
    expect(r.query).toContain('endswith')
  })

  it('applies fieldNameMap', () => {
    const r = convertSigmaToSplunk(PSEXEC_YAML, { CommandLine: 'ProcessCommandLine' })
    expect(r.query).toContain('ProcessCommandLine')
    // ProcessCommandLine contains 'CommandLine="' as substring — check word-boundary
    expect(r.query).not.toMatch(/(?<![A-Za-z])CommandLine="/)
  })

  it('handles |contains multi-value lists as OR groups', () => {
    const yaml = `title: T\nlogsource:\n  category: process_creation\ndetection:\n  sel:\n    Image|contains:\n      - mimikatz\n      - pypykatz\n  condition: sel\n`
    const r = convertSigmaToSplunk(yaml)
    expect(r.ok).toBe(true)
    expect(r.query).toContain('mimikatz')
    expect(r.query).toContain('pypykatz')
    expect(r.query).toContain('OR')
  })

  it('expands 1 of selection* correctly', () => {
    const yaml = `title: T\nlogsource:\n  category: process_creation\ndetection:\n  sel_a:\n    a: 1\n  sel_b:\n    b: 2\n  condition: 1 of sel_*\n`
    const r = convertSigmaToSplunk(yaml)
    expect(r.ok).toBe(true)
    expect(r.query).toContain('OR')
  })
})

// ── osquery ─────────────────────────────────────────────────────────────────

describe('validateOsquerySql', () => {
  it('rejects UPDATE', () => {
    const r = validateOsquerySql('UPDATE users SET x=1')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /forbidden|read-only/i.test(e.message))).toBe(true)
  })

  it('accepts SELECT with known tables and WHERE', () => {
    const r = validateOsquerySql('SELECT pid, name FROM processes WHERE pid = 1')
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
    expect(r.tables).toContain('processes')
  })

  it('warns on unknown table instead of error', () => {
    const r = validateOsquerySql('SELECT * FROM nonexistent_table')
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => /nonexistent_table/.test(w.message))).toBe(true)
  })

  it('rejects multi-statement', () => {
    const r = validateOsquerySql('SELECT * FROM processes; SELECT * FROM users')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /multiple statements/i.test(e.message))).toBe(true)
  })

  it('warns on high-volume table without WHERE', () => {
    const r = validateOsquerySql('SELECT * FROM process_events')
    expect(r.warnings.some((w) => /high-volume.*WHERE/i.test(w.message))).toBe(true)
  })

  it('requires SELECT/WITH start', () => {
    const r = validateOsquerySql('DELETE FROM processes')
    expect(r.errors.some((e) => /SELECT|WITH/i.test(e.message))).toBe(true)
  })
})

// ── Suricata ────────────────────────────────────────────────────────────────

describe('validateSuricataRule', () => {
  const GOOD = `alert tcp $HOME_NET any -> $EXTERNAL_NET 443 (msg:"TLS SNI test"; content:"evil.com"; tls.sni; sid:1000001; rev:1;)`

  it('accepts well-formed alert tcp rule', () => {
    const r = validateSuricataRule(GOOD)
    expect(r.valid).toBe(true)
    expect(r.parsed?.sid).toBe(1000001)
    expect(r.parsed?.msg).toBe('TLS SNI test')
  })

  it('rejects bad action', () => {
    const r = validateSuricataRule(`banana tcp any any -> any any (msg:"x"; sid:1000001; rev:1;)`)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /action/i.test(e.message))).toBe(true)
  })

  it('warns on sid < 1000000', () => {
    const r = validateSuricataRule(`alert tcp any any -> any any (msg:"x"; sid:1000; rev:1;)`)
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => /sid 1000.*1000000/.test(w.message))).toBe(true)
  })

  it('catches unbalanced quotes', () => {
    const r = validateSuricataRule(`alert tcp any any -> any any (msg:"unclosed; sid:1000001; rev:1;)`)
    expect(r.errors.some((e) => /unbalanced.*quote/i.test(e.message))).toBe(true)
  })

  it('flags header with wrong arity', () => {
    const r = validateSuricataRule(`alert tcp any`)
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => /header requires 7/i.test(e.message))).toBe(true)
  })
})
