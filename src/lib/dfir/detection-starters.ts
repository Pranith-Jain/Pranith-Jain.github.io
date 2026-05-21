import type { DetectionRule } from './detection-engine';

/**
 * Curated starter library for the Detection Lab. Each entry is a
 * production-quality pattern — the kind of rule that earns a place in a
 * real detection pack rather than the 3 illustrative samples the lab
 * shipped with originally.
 *
 * Adding a starter? Keep these invariants:
 *  - The rule MUST compile and evaluate without error (the lab parses
 *    and shows a red warning if any field is malformed).
 *  - Every starter declares a MITRE ATT&CK `technique` and `tactic` so
 *    the analyst can pivot to the matrix.
 *  - `references` link to the authoritative source for the logic — a
 *    vendor advisory, a research blog, or the ATT&CK technique page.
 *  - The `description` reads as one sentence telling the analyst what
 *    the rule catches AND what it intentionally doesn't.
 *
 * Order matters — top-of-list = most useful day-one rules.
 */

interface DetectionStarter {
  /** Bucket label shown above the picker. */
  group:
    | 'Command & Control'
    | 'Ransomware'
    | 'Infostealer'
    | 'Phishing'
    | 'Cross-feed consensus'
    | 'Suppression patterns';
  rule: DetectionRule;
}

export const STARTERS: DetectionStarter[] = [
  // ─── Command & Control ────────────────────────────────────────────────
  {
    group: 'Command & Control',
    rule: {
      id: 'cobalt-strike-c2',
      name: 'Cobalt Strike C2 beacon',
      severity: 'high',
      description:
        "Indicators flagged as Cobalt Strike infrastructure by any feed. Fires on a single hit because false positives are rare — the string 'cobalt strike' rarely appears in benign feed context.",
      match: { contextRegex: 'cobalt[ -]?strike|\\bcs\\s*beacon|cobalt-?strike|teamserver' },
      minMatches: 1,
      technique: 'T1071.001',
      tactic: 'Command and Control',
      references: ['https://attack.mitre.org/techniques/T1071/001/', 'https://www.cobaltstrike.com'],
    },
  },
  {
    group: 'Command & Control',
    rule: {
      id: 'sliver-c2',
      name: 'Sliver C2 infrastructure',
      severity: 'high',
      description:
        'Sliver (BishopFox) implant infrastructure. Increasingly common in Cobalt Strike alternative deployments by both red teams and adversaries.',
      match: { contextRegex: '\\bsliver\\b|bishop\\s*fox|sliver-?c2' },
      minMatches: 1,
      technique: 'T1071.001',
      tactic: 'Command and Control',
      references: ['https://github.com/BishopFox/sliver', 'https://attack.mitre.org/techniques/T1071/001/'],
    },
  },
  {
    group: 'Command & Control',
    rule: {
      id: 'c2-tracker-shodan',
      name: 'C2-Tracker (Shodan-detected)',
      severity: 'high',
      description:
        'Live C2 server IPs published by MontySecurity C2-Tracker via Shodan signatures. High specificity, low FP — covers Cobalt Strike, Sliver, Metasploit, Havoc, Brute Ratel, and similar.',
      match: { source: 'c2-intel' },
      minMatches: 1,
      technique: 'T1071',
      tactic: 'Command and Control',
      references: ['https://github.com/montysecurity/C2-Tracker'],
    },
  },

  // ─── Ransomware ───────────────────────────────────────────────────────
  {
    group: 'Ransomware',
    rule: {
      id: 'active-ransomware-family',
      name: 'Active ransomware-family hash',
      severity: 'critical',
      description:
        'Sample hash tagged to one of the currently-active ransomware operations. The family list is curated; add or remove names as the threat landscape shifts.',
      match: {
        kind: 'hash',
        contextRegex:
          'lockbit|black\\s*cat|alphv|akira|cl0p|royal|bianlian|play|qilin|medusa|rhysida|interlock|fog|nova\\b',
      },
      minMatches: 1,
      technique: 'T1486',
      tactic: 'Impact',
      references: ['https://attack.mitre.org/techniques/T1486/', 'https://www.ransomware.live'],
    },
  },
  {
    group: 'Ransomware',
    rule: {
      id: 'leak-site-activity',
      name: 'Ransomware leak-site claim',
      severity: 'medium',
      description:
        'Indicator surfaced through one of the ransomware leak-site aggregators. Not actionable in isolation — useful as a pivot to identify a campaign before sample IOCs are public.',
      match: { contextRegex: 'ransomlook|leak-?site|ransomware\\.live|ransom\\s*claim' },
      minMatches: 1,
      technique: 'T1657',
      tactic: 'Impact',
      references: ['https://attack.mitre.org/techniques/T1657/'],
    },
  },

  // ─── Infostealer ──────────────────────────────────────────────────────
  {
    group: 'Infostealer',
    rule: {
      id: 'stealer-family-tag',
      name: 'Infostealer family in context',
      severity: 'high',
      description:
        'Any indicator whose context names a known infostealer family. The Lumma/Vidar/Stealc/Redline ecosystem dominates current commodity infections.',
      match: {
        contextRegex: 'redline|vidar|lumma(?:c2)?|stealc|raccoon|rhadamanthys|amadey|metastealer|risepro|stealer',
      },
      minMatches: 1,
      technique: 'T1555',
      tactic: 'Credential Access',
      references: ['https://attack.mitre.org/techniques/T1555/', 'https://abuse.ch/threatfox/'],
    },
  },

  // ─── Phishing ─────────────────────────────────────────────────────────
  {
    group: 'Phishing',
    rule: {
      id: 'phishing-kit-url',
      name: 'Phishing kit URL',
      severity: 'medium',
      description:
        'URL feed with phishing-kit / credential-harvest context. Lower confidence than C2 indicators — many one-shot kits, rate of recycled infrastructure is low.',
      match: {
        kind: 'url',
        contextRegex: 'phish(?:ing)?|fake\\s*login|credential[- ]harvest|kit|brand[- ]impersonation',
      },
      minMatches: 1,
      technique: 'T1566.002',
      tactic: 'Initial Access',
      references: ['https://attack.mitre.org/techniques/T1566/002/', 'https://openphish.com'],
    },
  },
  {
    group: 'Phishing',
    rule: {
      id: 'brand-impersonation-domain',
      name: 'Brand-impersonation domain registration',
      severity: 'medium',
      description:
        'Domain feed with brand-impersonation or typosquat context. Pair with the per-brand watchlist for high-value targets to convert this into actionable alerts.',
      match: {
        kind: 'domain',
        contextRegex: 'impersonat|typosquat|lookalike|homoglyph|spoof',
      },
      minMatches: 1,
      technique: 'T1583.001',
      tactic: 'Resource Development',
      references: ['https://attack.mitre.org/techniques/T1583/001/'],
    },
  },

  // ─── Cross-feed consensus ─────────────────────────────────────────────
  {
    group: 'Cross-feed consensus',
    rule: {
      id: 'consensus-3-sources',
      name: 'Indicator confirmed by 3+ independent feeds',
      severity: 'high',
      description:
        'Same value independently reported by 3 or more distinct sources. Cross-source consensus is the only single-feed signal worth trusting — single-source flags are noise at scale.',
      match: { kind: ['ip', 'domain', 'hash', 'url'] },
      aggregate: { groupBy: 'value', minCount: 3, distinctBy: 'source' },
      technique: 'T1071',
      tactic: 'Command and Control',
      references: ['https://attack.mitre.org/'],
    },
  },
  {
    group: 'Cross-feed consensus',
    rule: {
      id: 'ip-consensus-2',
      name: 'IP in 2+ feeds (broader net)',
      severity: 'medium',
      description:
        'Looser variant of the 3-source rule — useful when one of the feeds is high-confidence enough that a 2nd-source corroboration is sufficient. Tune up to 3+ to silence routine scanners.',
      match: { kind: 'ip' },
      aggregate: { groupBy: 'value', minCount: 2, distinctBy: 'source' },
      technique: 'T1071',
      tactic: 'Command and Control',
      references: ['https://attack.mitre.org/techniques/T1071/'],
    },
  },

  // ─── Suppression patterns (showcase exclude clause) ───────────────────
  {
    group: 'Suppression patterns',
    rule: {
      id: 'ssh-bruteforce-minus-benign-scanners',
      name: 'SSH brute-force scans (minus benign scanners)',
      severity: 'medium',
      description:
        'SSH brute-force IPs from any feed, with known-benign internet-wide scanners (GreyNoise riot, Censys) suppressed. The `exclude` clause is what makes this rule operational instead of a noise machine.',
      match: { kind: 'ip', contextRegex: 'ssh|sshd|brute[- ]?force' },
      exclude: { source: ['greynoise', 'censys-noise'] },
      minMatches: 1,
      technique: 'T1110.001',
      tactic: 'Credential Access',
      references: ['https://attack.mitre.org/techniques/T1110/001/'],
    },
  },
  {
    group: 'Suppression patterns',
    rule: {
      id: 'high-conf-malware-minus-eicar',
      name: 'High-confidence malware hash (minus test files)',
      severity: 'high',
      description:
        'Malware samples from MalwareBazaar / abuse.ch, with EICAR and known-test-file contexts suppressed. Demonstrates the `exclude` clause on context regex — pair `match` and `exclude` to tune signal without weakening the primary predicate.',
      match: { kind: 'hash', source: ['malwarebazaar', 'threatfox'] },
      exclude: { contextRegex: 'eicar|test[- ]?file|benign[- ]?sample' },
      minMatches: 1,
      technique: 'T1204.002',
      tactic: 'Execution',
      references: ['https://attack.mitre.org/techniques/T1204/002/', 'https://bazaar.abuse.ch'],
    },
  },
];

/** Group starters by their `group` field for the picker UI. Preserves the
 *  declaration order within each group. */
export function groupedStarters(): Map<string, DetectionStarter[]> {
  const map = new Map<string, DetectionStarter[]>();
  for (const s of STARTERS) {
    const list = map.get(s.group);
    if (list) list.push(s);
    else map.set(s.group, [s]);
  }
  return map;
}
