import { describe, it, expect } from 'vitest';
import { splitSynthOutput } from '../../src/lib/agent/synthesizer';
const SAMPLE_REPORT = `# Cyber Threat Intelligence Report

\`\`\`report-header
{
  "headline": "Active C2 infrastructure at 1.2.3.4 — block at perimeter and hunt for beaconing",
  "bluf": "Active command-and-control infrastructure was observed at 1.2.3.4; hunt for beaconing in last 24h proxy logs.",
  "key_takeaway": "Unblocked C2 channel risks data exfiltration and lateral movement within the environment.",
  "severity": "critical",
  "posture": "active",
  "confidence": "high",
  "tlp": "AMBER",
  "actor": null,
  "campaign": null,
  "primary_indicator": {"type": "ipv4", "value": "1.2.3.4"},
  "time_to_act": "PT15M"
}
\`\`\`

## 1. Executive Summary

Active command-and-control infrastructure was observed at 1.2.3.4 with high confidence based on 12 independent reputation sources. The IP is hosted on AS12345 (BadNet, US) and is actively beaconing. Immediate blocking is required to prevent data exfiltration and lateral movement within the environment.

### Key Findings

| Decision question | Finding | Confidence | Likelihood |
|---|---|---|---|
| Is 1.2.3.4 actively used for C2? | 1.2.3.4 listed on 12 reputation feeds (composite score 92). | High | n/a (observed) |
| What is the hosting environment? | ASN AS12345 hosts 4 additional malicious IPs. | Moderate | Not assessed |
| What domains are associated? | evil1.com, evil2.com co-hosted on same infrastructure. | Moderate | Not assessed |

## 2. Actor Snapshot

| Field | Value |
|---|---|
| **Public Aliases** | Unknown |
| **Motivation** | Unknown |
| **Active Period** | Observed within last 24 hours |
| **Tradecraft Summary** | IP-based C2 infrastructure, no confirmed malware family attribution |
| **Confidence in Characterization** | Low |

## 3. Methodology

### Collection

Sources: check_ioc (12 reputation providers), lookup_asn, lookup_reverse_dns. Gaps: no malware family attribution, no confirmed victim telemetry.

### Analytic Techniques

Quality of Information Check, Key Assumptions Check.

### Confidence and Likelihood

This report follows ICD-203. Confidence is expressed as high, moderate, or low. Likelihood uses the seven-tier ladder and applies only to forward-looking claims.

## 4. Activity Overview

### Victim Profile

| Sector | Region | Victims | Notes |
|---|---|---|---|
| Financial | Global | Unknown specific victims | Targeting inferred from infrastructure profile |

### Activity Date Range

Observed within last 24 hours.

### Related Reporting

No vendor or government reporting directly matching this activity cluster at this time.

## 5. Representative Adversary Techniques

| Tactic | Technique ID | Technique Name | Procedure Observed |
|---|---|---|---|
| Command and Control | T1071.001 | Web Protocols | C2 communication over HTTP/S |

## 6. Indicators of Compromise

| Type | Indicator | Context |
|---|---|---|
| IP Addresses | 1.2.3.4 | Command-and-control server |
| Domain Names | evil1.com | Co-hosted C2 domain |
| Domain Names | evil2.com | Co-hosted C2 domain |

## 7. Defensive Implications

### Defensive Measures

| Defensive Action | Addresses | Notes |
|---|---|---|
| Block 1.2.3.4 at perimeter firewall | T1071.001 | Immediate containment |
| Hunt for beaconing in last 24h proxy logs | T1071.001 | Scope compromise |

### Detection Engineering Content

| Detection Content | Notes |
|---|---|
| DeviceNetworkEvents \| where RemoteIP == "1.2.3.4" | KQL — Microsoft 365 Defender |

### Vendor Detection Coverage

No vendor detections confirmed for this specific infrastructure at time of analysis.

## 8. Attribution Analysis

| Signal | Finding | Confidence | Notes |
|---|---|---|---|
| Victim | Financial sector targeting | Low | Inferred from infrastructure |
| Targeting Intent | Unknown | Low | No victim telemetry |
| Tradecraft | Generic C2 | Low | No unique TTPs observed |
| Tooling | Unknown | Low | No malware family identified |
| Identity Artifacts | None found | Low | No credentials or artifacts |
| Infrastructure | AS12345 BadNet (US) | High | Confirmed via ASN lookup |

## 9. Anticipated Activity

**Expected near-term activity:** Continued C2 beaconing until infrastructure is blocked.

**Conditions that would expand or contract the activity:** Blocking at perimeter will disrupt C2; failure to block increases risk of data exfiltration.

## 10. About this Report

| | |
|---|---|
| **Report Title** | Active C2 Infrastructure Analysis — 1.2.3.4 |
| **Author(s) and Organization** | CTI Analyst Agent — pranithjain.com |
| **Publication Date** | 2024-12-01 |
| **Report Classification** | TLP:AMBER |
| **Follow-Up Contact** | Security team |

### Report Changelog

| **Date** | **Author** | **Change Description** |
|---|---|---|
| 2024-12-01 | CTI Agent | Initial report |

:::handoff
next_stages:
  - extract_iocs: 1.2.3.4, evil1.com, evil2.com
  - map_mitre: T1071.001
  - detect_hunt: deploy KQL to SIEM
analyst_approval_required: true
:::

\`\`\`action-card
{
  "verdict": {
    "headline": "Active C2 infrastructure at 1.2.3.4 — block at perimeter and hunt for beaconing",
    "confidence": "high",
    "confidence_rationale": "12 providers agree",
    "posture": "active",
    "tlp": "AMBER"
  },
  "severity": "critical",
  "actions": [
    {
      "severity": "critical",
      "action": "Block 1.2.3.4 at perimeter",
      "target": "1.2.3.4",
      "source": "check_ioc",
      "category": "contain",
      "stakeholders": ["soc", "ir"]
    }
  ],
  "mitre": [
    { "id": "T1071.001", "name": "Web Protocols", "tactic": "Command and Control", "evidence": "C2 host", "detection": "kql" }
  ],
  "iocs": [
    { "type": "ipv4", "value": "1.2.3.4", "confidence": "Confirmed", "source": "check_ioc" },
    { "type": "domain", "value": "evil1.com", "confidence": "Probable", "source": "lookup_reverse_dns" }
  ],
  "kev": false,
  "ransomware": false,
  "attributed": false,
  "navigatorLayer": {
    "name": "C2 Investigation",
    "description": "Active C2 1.2.3.4",
    "techniques": [{ "id": "T1071.001", "score": 80, "comment": "C2 host" }]
  },
  "diamond": {
    "adversary": "Unknown threat actor",
    "capability": ["T1071.001"],
    "infrastructure": ["1.2.3.4", "AS12345", "evil1.com"],
    "victim": "Financial sector"
  },
  "pirs": [
    { "pir": "Are we seeing active C2 from this IP?", "relevant": true, "bluf": "Yes, 1.2.3.4 active C2", "businessOutcome": "Prevent data exfiltration" }
  ]
}
\`\`\``;
describe('splitSynthOutput', () => {
  it('extracts prose, action card, and handoff', () => {
    const out = splitSynthOutput(SAMPLE_REPORT);
    expect(out.report).toContain('Executive Summary');
    expect(out.report).not.toContain('```action-card');
    expect(out.report).not.toContain(':::handoff');
    expect(out.actionCard).toBeDefined();
    expect(out.handoff).toBeDefined();
    expect(out.handoff?.next_stages).toHaveLength(3);
    expect(out.handoff?.analyst_approval_required).toBe(true);
  });
  it('parses severity, headline, and confidence', () => {
    const out = splitSynthOutput(SAMPLE_REPORT);
    expect(out.actionCard?.severity).toBe('critical');
    expect(out.actionCard?.verdict.headline).toContain('Active C2');
    expect(out.actionCard?.verdict.confidence).toBe('high');
    expect(out.actionCard?.verdict.tlp).toBe('AMBER');
  });
  it('parses actions with stakeholders', () => {
    const out = splitSynthOutput(SAMPLE_REPORT);
    expect(out.actionCard?.actions).toHaveLength(1);
    const a = out.actionCard?.actions[0];
    expect(a?.category).toBe('contain');
    expect(a?.stakeholders).toEqual(['soc', 'ir']);
  });
  it('parses MITRE techniques', () => {
    const out = splitSynthOutput(SAMPLE_REPORT);
    expect(out.actionCard?.mitre).toHaveLength(1);
    expect(out.actionCard?.mitre[0]?.id).toBe('T1071.001');
  });
  it('parses IOCs with type and confidence', () => {
    const out = splitSynthOutput(SAMPLE_REPORT);
    expect(out.actionCard?.iocs).toHaveLength(2);
    expect(out.actionCard?.iocs[0]?.type).toBe('ipv4');
    expect(out.actionCard?.iocs[0]?.confidence).toBe('Confirmed');
  });
  it('parses Diamond Model', () => {
    const out = splitSynthOutput(SAMPLE_REPORT);
    expect(out.actionCard?.diamond?.adversary).toBe('Unknown threat actor');
    expect(out.actionCard?.diamond?.infrastructure).toContain('1.2.3.4');
  });
  it('parses PIR links', () => {
    const out = splitSynthOutput(SAMPLE_REPORT);
    expect(out.actionCard?.pirs).toHaveLength(1);
    expect(out.actionCard?.pirs?.[0]?.relevant).toBe(true);
  });
  it('parses MITRE Navigator layer', () => {
    const out = splitSynthOutput(SAMPLE_REPORT);
    expect(out.actionCard?.navigatorLayer?.techniques).toHaveLength(1);
    expect(out.actionCard?.navigatorLayer?.techniques[0]?.score).toBe(80);
  });
  it('falls back to a minimal card when action-card JSON is missing', () => {
    const proseOnly =
      '# Investigation\n\n## 1. Executive Summary\nHIGH — Observed active C2 infrastructure. Further analysis recommended.';
    const out = splitSynthOutput(proseOnly);
    expect(out.actionCard).toBeDefined();
    expect(out.actionCard?.verdict.headline).toContain('Observed active C2 infrastructure');
    expect(out.handoff).toBeUndefined();
  });
  it('falls back to a minimal card when action-card JSON is invalid', () => {
    const bad = `# Report\n\n\`\`\`action-card\n{not valid json\n\`\`\``;
    const out = splitSynthOutput(bad);
    expect(out.actionCard).toBeDefined();
  });
  it('maps stakeholder aliases', () => {
    const card = `\`\`\`action-card
{
  "verdict": {"headline": "x", "confidence": "low", "posture": "unknown", "tlp": "CLEAR"},
  "severity": "low",
  "actions": [
    {"severity": "low", "action": "a", "category": "inform", "stakeholders": ["SOC & Detection Engineering", "Red Team", "CISO"]}
  ],
  "mitre": [], "iocs": [], "kev": false, "ransomware": false, "attributed": false
}
\`\`\``;
    const out = splitSynthOutput(card);
    const a = out.actionCard?.actions[0];
    expect(a?.stakeholders).toContain('soc');
    expect(a?.stakeholders).toContain('redteam');
    expect(a?.stakeholders).toContain('exec');
  });
  it('clamps out-of-range navigator scores', () => {
    const card = `\`\`\`action-card
{
  "verdict": {"headline": "x", "confidence": "low", "posture": "unknown", "tlp": "CLEAR"},
  "severity": "low",
  "actions": [], "mitre": [], "iocs": [], "kev": false, "ransomware": false, "attributed": false,
  "navigatorLayer": {"name": "x", "description": "y", "techniques": [{"id": "T1071", "score": 999}]}
}
\`\`\``;
    const out = splitSynthOutput(card);
    expect(out.actionCard?.navigatorLayer?.techniques[0]?.score).toBe(100);
  });
  it('omits Diamond Model when fewer than 2 vertices are filled', () => {
    const card = `\`\`\`action-card
{
  "verdict": {"headline": "x", "confidence": "low", "posture": "unknown", "tlp": "CLEAR"},
  "severity": "low",
  "actions": [], "mitre": [], "iocs": [], "kev": false, "ransomware": false, "attributed": false,
  "diamond": {"adversary": "x"}
}
\`\`\``;
    const out = splitSynthOutput(card);
    expect(out.actionCard?.diamond).toBeUndefined();
  });
  describe('parseHandoff (lenient)', () => {
    // Helper to build a minimal report with a handoff block.
    const wrapHandoff = (block) => `\`\`\`action-card
{
  "verdict": {"headline": "x", "confidence": "low", "posture": "unknown", "tlp": "CLEAR"},
  "severity": "low",
  "actions": [], "mitre": [], "iocs": [], "kev": false, "ransomware": false, "attributed": false
}
\`\`\`

:::handoff
${block}
:::`;
    it('parses the original `- stage: description` form', () => {
      const out = splitSynthOutput(
        wrapHandoff(
          'next_stages:\n  - detect_hunt: deploy KQL to SIEM\n  - map_mitre: T1071\nanalyst_approval_required: true'
        )
      );
      expect(out.handoff?.next_stages).toEqual(['detect_hunt: deploy KQL to SIEM', 'map_mitre: T1071']);
      expect(out.handoff?.analyst_approval_required).toBe(true);
    });
    it('accepts `*` bullet marker', () => {
      const out = splitSynthOutput(
        wrapHandoff('next_stages:\n  * detect_hunt: deploy KQL to SIEM\nanalyst_approval_required: false')
      );
      expect(out.handoff?.next_stages).toEqual(['detect_hunt: deploy KQL to SIEM']);
      expect(out.handoff?.analyst_approval_required).toBe(false);
    });
    it('accepts numbered list (1. ...)', () => {
      const out = splitSynthOutput(
        wrapHandoff(
          'next_stages:\n  1. detect_hunt: deploy KQL to SIEM\n  2. map_mitre: T1071\nanalyst_approval_required: true'
        )
      );
      expect(out.handoff?.next_stages).toEqual(['detect_hunt: deploy KQL to SIEM', 'map_mitre: T1071']);
    });
    it('handles stage lines with no description (uses placeholder)', () => {
      const out = splitSynthOutput(
        wrapHandoff('next_stages:\n  - detect_hunt\n  - map_mitre: T1071\nanalyst_approval_required: true')
      );
      expect(out.handoff?.next_stages).toEqual(['detect_hunt: (no description provided)', 'map_mitre: T1071']);
    });
    it('skips the analyst_approval_required config line as a stage', () => {
      const out = splitSynthOutput(
        wrapHandoff('next_stages:\n  - detect_hunt: deploy KQL to SIEM\nanalyst_approval_required: true')
      );
      expect(out.handoff?.next_stages).toEqual(['detect_hunt: deploy KQL to SIEM']);
      expect(out.handoff?.next_stages).not.toContainEqual(expect.stringMatching(/analyst_approval_required/));
    });
    it('defaults analyst_approval_required to true when missing', () => {
      const out = splitSynthOutput(wrapHandoff('next_stages:\n  - detect_hunt: deploy KQL to SIEM'));
      expect(out.handoff?.analyst_approval_required).toBe(true);
    });
  });
  describe('CVE metadata extraction', () => {
    // Build a JSON object that always has the CVE-meta keys. The `overrides`
    // argument lets a specific test substitute one field to verify
    // validation behaviour.
    const wrapCard = (overrides = {}) => {
      const card = {
        verdict: { headline: 'CVE-2024-3400', confidence: 'high', posture: 'active', tlp: 'AMBER' },
        severity: 'critical',
        actions: [],
        mitre: [],
        iocs: [],
        kev: true,
        kev_date: '2024-04-12',
        cvss: { score: 10.0, vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', severity: 'CRITICAL' },
        epss: { score: 0.974, percentile: 0.999 },
        ransomware_use: 'Known',
        threat_actors: ['Volt Typhoon', 'APT41'],
        exploit_status: 'in-the-wild',
        patch_url: 'https://example.com/advisory',
        ransomware: true,
        attributed: true,
      };
      return ['```action-card', JSON.stringify({ ...card, ...overrides }), '```'].join('\n');
    };
    it('passes through validated KEV/CVSS/EPSS/actor/exploit data', () => {
      const out = splitSynthOutput(wrapCard({}));
      expect(out.actionCard?.kev).toBe(true);
      expect(out.actionCard?.kev_date).toBe('2024-04-12');
      expect(out.actionCard?.cvss?.score).toBe(10);
      expect(out.actionCard?.cvss?.severity).toBe('CRITICAL');
      expect(out.actionCard?.epss?.score).toBe(0.974);
      expect(out.actionCard?.epss?.percentile).toBe(0.999);
      expect(out.actionCard?.ransomware_use).toBe('Known');
      expect(out.actionCard?.threat_actors).toEqual(['Volt Typhoon', 'APT41']);
      expect(out.actionCard?.exploit_status).toBe('in-the-wild');
      expect(out.actionCard?.patch_url).toBe('https://example.com/advisory');
    });
    it('clamps out-of-range CVSS scores to null', () => {
      const out = splitSynthOutput(wrapCard({ cvss: { score: 15, vector: 'invalid', severity: 'BOGUS' } }));
      // score 15 is out of range, vector is not a string, severity is invalid
      // The normaliser sets them to null.
      expect(out.actionCard?.cvss?.score).toBe(null);
      // vector is a string, so it survives (length cap only)
      expect(out.actionCard?.cvss?.vector).toBe('invalid');
      expect(out.actionCard?.cvss?.severity).toBe(null);
    });
    it('drops invalid kev_date and falls back to null', () => {
      const out = splitSynthOutput(wrapCard({ kev_date: 'not-a-date' }));
      expect(out.actionCard?.kev_date).toBe(null);
    });
    it('drops invalid exploit_status values', () => {
      const out = splitSynthOutput(wrapCard({ exploit_status: 'banana' }));
      expect(out.actionCard?.exploit_status).toBe(null);
    });
    it('filters non-string entries from threat_actors', () => {
      const out = splitSynthOutput(wrapCard({ threat_actors: ['Lazarus', 42, null, 'APT28', ''] }));
      // String entries are kept (including empty string); non-strings are dropped.
      const actors = out.actionCard?.threat_actors ?? [];
      expect(actors).toContain('Lazarus');
      expect(actors).toContain('APT28');
      expect(actors.every((a) => typeof a === 'string')).toBe(true);
      expect(actors).not.toContain(42);
      expect(actors).not.toContain(null);
    });
  });
});
