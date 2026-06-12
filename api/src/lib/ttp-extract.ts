/**
 * TTP extraction — maps free-text report behavior to MITRE ATT&CK
 * techniques with confidence.
 *
 * Two implementations:
 *   1. Keyword scanner (always runs) — fast, deterministic, works for
 *      common verbs and known-actor TTPs. Returns ~5-15 hits per report
 *      on a typical writeup. Tied to `data/atlas-matrix.ts` (canonical
 *      technique list).
 *   2. LLM extractor (optional, runs on Workers AI / Groq) — produces
 *      behavioral mappings that the keyword scanner misses. Falls back
 *      to keyword results on any failure.
 *
 * Public API:
 *   - extractTTPsKeyword(text, matrix)  → pure, sync
 *   - extractTTPsLLM(text, env)          → LLM-backed, returns
 *     { techniques, model, source, error? }
 *
 * Confidence band (per ti-mindmap-hub's "Known Limitations" doc):
 *   - "high"  : exact technique ID + behavior string in text
 *   - "medium": behavior string present, no explicit ID
 *   - "low"   : LLM inferred, no lexical evidence
 */

import type { Env } from '../env';
import { runCompletion } from '../case-study/generation/ai-client';

export interface TtpHit {
  id: string; // ATT&CK technique ID, e.g. "T1059"
  name: string;
  tactic: string;
  confidence: 'high' | 'medium' | 'low';
  /** The exact behavior matched (keyword) or paraphrased (LLM). */
  evidence: string;
}

const TECHNIQUE_PATTERNS: Array<{
  id: string;
  name: string;
  tactic: string;
  patterns: RegExp[];
}> = [
  {
    id: 'T1566',
    name: 'Phishing',
    tactic: 'Initial Access',
    patterns: [/\bphish(?:ing|tail)?\b/i, /\bspear[\s-]?phish/i, /\bcredential[\s-]?harvest/i, /\bevilproxy\b/i],
  },
  {
    id: 'T1190',
    name: 'Exploit Public-Facing Application',
    tactic: 'Initial Access',
    patterns: [
      /\bexploit(?:ing|s|ed)?\b.{0,40}(?:vulnerab|cve|edge|fortinet|exchange|confluence|citrix)/i,
      /\bRCE\b/i,
      /\bremote code execution\b/i,
      /\b0-?day\b/i,
    ],
  },
  {
    id: 'T1078',
    name: 'Valid Accounts',
    tactic: 'Initial Access',
    patterns: [/\bvalid accounts?\b/i, /\bstolen credentials?\b/i, /\bcredential stuffing\b/i],
  },
  {
    id: 'T1133',
    name: 'External Remote Services',
    tactic: 'Initial Access',
    patterns: [/\bVPN\b/i, /\bRDP\b/i, /\b(?:citrix|rd web|remote desktop)\b/i],
  },
  {
    id: 'T1199',
    name: 'Trusted Relationship',
    tactic: 'Initial Access',
    patterns: [/\bthird[\s-]?party(?: vendor)?\b/i, /\bsupply chain\b/i, /\bmanaged service provider\b/i, /\bMSP\b/i],
  },
  {
    id: 'T1059',
    name: 'Command and Scripting Interpreter',
    tactic: 'Execution',
    patterns: [
      /\bPowerShell\b/i,
      /\bcmd\.exe\b/i,
      /\bbash\b/i,
      /\bzsh\b/i,
      /\bwscript\b/i,
      /\bcscript\b/i,
      /\bVBScript\b/i,
      /\bJavaScript\b/i,
      /\bPython\b/i,
    ],
  },
  {
    id: 'T1204',
    name: 'User Execution',
    tactic: 'Execution',
    patterns: [/\bmalicious (?:attachment|link|document|file)\b/i, /\buser (?:opens|clicks|downloads|runs)\b/i],
  },
  {
    id: 'T1053',
    name: 'Scheduled Task/Job',
    tactic: 'Persistence',
    patterns: [/\bscheduled task\b/i, /\bcron(?:job)?\b/i, /\bat\b/i, /\bsystemd timer\b/i],
  },
  {
    id: 'T1543',
    name: 'Create or Modify System Process',
    tactic: 'Persistence',
    patterns: [/\bsystemd service\b/i, /\blaunchd\b/i, /\bdaemon\b/i, /\binit\.d\b/i],
  },
  {
    id: 'T1136',
    name: 'Create Account',
    tactic: 'Persistence',
    patterns: [/\b(?:new|created?) (?:local )?account\b/i, /\bbackdoor account\b/i],
  },
  {
    id: 'T1547',
    name: 'Boot or Logon Autostart Execution',
    tactic: 'Persistence',
    patterns: [
      /\bRun key\b/i,
      /\b(?:HKCU|HKLM)\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\b/i,
      /\bLogin Items\b/i,
      /\bautostart\b/i,
    ],
  },
  {
    id: 'T1548',
    name: 'Abuse Elevation Control Mechanism',
    tactic: 'Privilege Escalation',
    patterns: [/\bUAC bypass\b/i, /\b(?:sudo|sudoers)\b/i, /\bsetuid\b/i, /\bPrivEsc\b/i],
  },
  {
    id: 'T1068',
    name: 'Exploitation for Privilege Escalation',
    tactic: 'Privilege Escalation',
    patterns: [/\bprivilege escalation\b/i, /\blocal privilege escalation\b/i, /\bLPE\b/i],
  },
  {
    id: 'T1003',
    name: 'OS Credential Dumping',
    tactic: 'Credential Access',
    patterns: [
      /\bcredential dump(?:ing)?\b/i,
      /\bLSASS\b/i,
      /Windows\\\\System32\\\\lsass/i,
      /\bmimikatz\b/i,
      /\bNTLM hash/i,
      /\bSAM database\b/i,
    ],
  },
  {
    id: 'T1110',
    name: 'Brute Force',
    tactic: 'Credential Access',
    patterns: [/\bbrute[\s-]?force\b/i, /\bpassword spray(?:ing)?\b/i, /\bcredential stuffing\b/i],
  },
  {
    id: 'T1555',
    name: 'Credentials from Password Stores',
    tactic: 'Credential Access',
    patterns: [/\bbrowser (?:password|credential)s?\b/i, /\bkeychain\b/i, /\bcredential vault\b/i],
  },
  {
    id: 'T1213',
    name: 'Data from Information Repositories',
    tactic: 'Collection',
    patterns: [
      /\bSharePoint\b/i,
      /\bConfluence\b/i,
      /\b(?:internal|company) wiki\b/i,
      /\bOneDrive\b/i,
      /\bGoogle Drive\b/i,
      /\bS3 buckets?\b/i,
    ],
  },
  {
    id: 'T1005',
    name: 'Data from Local System',
    tactic: 'Collection',
    patterns: [/\bstaged for exfil\b/i, /\blocal files?\b/i, /\bsensitive documents?\b/i],
  },
  {
    id: 'T1114',
    name: 'Email Collection',
    tactic: 'Collection',
    patterns: [/\bmailbox(?:es)?\b/i, /\bOutlook\b/i, /\bmail (?:rules?|forwarding)\b/i],
  },
  {
    id: 'T1056',
    name: 'Input Capture',
    tactic: 'Collection',
    patterns: [/\bkeylogg(?:er|ing)\b/i, /\bform grab\b/i, /\bscreen captur/i],
  },
  {
    id: 'T1041',
    name: 'Exfiltration Over C2 Channel',
    tactic: 'Exfiltration',
    patterns: [/\bexfil(?:tration|trate|trated)?\b/i, /\bdata theft\b/i, /\bstolen data\b/i],
  },
  {
    id: 'T1567',
    name: 'Exfiltration Over Web Service',
    tactic: 'Exfiltration',
    patterns: [/\bupload(?:ed)? to (?:mega|rclone|S3|Azure Blob|GCS|web)\b/i, /\b(?:mega\.nz|rclone)\b/i],
  },
  {
    id: 'T1486',
    name: 'Data Encrypted for Impact',
    tactic: 'Impact',
    patterns: [
      /\bransomware\b/i,
      /\bencrypt(?:ed|ing|s)? (?:files|drives?|data)\b/i,
      /\bcryptolock/i,
      /\blockbit\b/i,
      /\bblackcat\b/i,
      /\bcl0p\b/i,
      /\bplay ransomware\b/i,
      /\bakira\b/i,
    ],
  },
  {
    id: 'T1490',
    name: 'Inhibit System Recovery',
    tactic: 'Impact',
    patterns: [/\bvssadmin delete shadows\b/i, /\bdelete (?:shadow )?copies\b/i, /\bwbadmin delete\b/i],
  },
  {
    id: 'T1485',
    name: 'Data Destruction',
    tactic: 'Impact',
    patterns: [/\bdata (?:destruction|wipe|deletion)\b/i, /\b(wiped|wiped) drives?\b/i, /\bfile deletion\b/i],
  },
  {
    id: 'T1489',
    name: 'Service Stop',
    tactic: 'Impact',
    patterns: [/\bservice stopped\b/i, /\b(?:stop|kill) (?:SQL|backup|exchange) service/i, /\bsc stop\b/i],
  },
  {
    id: 'T1498',
    name: 'Network Denial of Service',
    tactic: 'Impact',
    patterns: [/\bDDoS\b/i, /\bdenial of service\b/i, /\bMirai\b/i],
  },
  {
    id: 'T1657',
    name: 'Financial Theft',
    tactic: 'Impact',
    patterns: [
      /\bfraud(?:ulent)?\b/i,
      /\bunauthori[sz]ed (?:transfer|wire|payment)s?\b/i,
      /\bBEC\b/i,
      /\bbusiness email compromise\b/i,
    ],
  },
  {
    id: 'T1071',
    name: 'Application Layer Protocol',
    tactic: 'Command and Control',
    patterns: [
      /\bC2 (?:beacon|traffic|channel|communication)s?\b/i,
      /\bcommand and control\b/i,
      /\b(?:HTTPS|HTTP|DNS) (?:beacon|c2|tunneling)\b/i,
    ],
  },
  {
    id: 'T1572',
    name: 'Protocol Tunneling',
    tactic: 'Command and Control',
    patterns: [/\bDNS tunneling\b/i, /\bICMP tunnel\b/i, /\bdomain fronting\b/i, /\bDoH\b/i],
  },
  {
    id: 'T1090',
    name: 'Proxy',
    tactic: 'Command and Control',
    patterns: [/\bproxy\b/i, /\bSOCKS\b/i, /\breverse proxy\b/i],
  },
  {
    id: 'T1102',
    name: 'Web Service',
    tactic: 'Command and Control',
    patterns: [
      /\bdead[\s-]?drop (?:resolver|URL)\b/i,
      /\bTelegram (?:bot|channel|C2)\b/i,
      /\bDiscord webhook\b/i,
      /\bPastebin\b/i,
    ],
  },
  {
    id: 'T1573',
    name: 'Encrypted Channel',
    tactic: 'Command and Control',
    patterns: [/\bTLS\b/i, /\bencrypted (?:C2|channel|traffic)\b/i],
  },
  {
    id: 'T1027',
    name: 'Obfuscated Files or Information',
    tactic: 'Defense Evasion',
    patterns: [/\bobfuscat(?:ed|ion)\b/i, /\bpacked (?:binary|executable)\b/i, /\bbase64[\s-]?encoded\b/i],
  },
  {
    id: 'T1055',
    name: 'Process Injection',
    tactic: 'Defense Evasion',
    patterns: [
      /\bprocess injection\b/i,
      /\binject(?:ed|ion) into\b/i,
      /\bReflectiveLoader\b/i,
      /\bProcess Hollowing\b/i,
    ],
  },
  {
    id: 'T1070',
    name: 'Indicator Removal',
    tactic: 'Defense Evasion',
    patterns: [/\bcleared? (?:event )?logs?\b/i, /\bwevtutil cl\b/i, /\bdisable(?:d)? (?:antivirus|defender|EDR)\b/i],
  },
  {
    id: 'T1562',
    name: 'Impair Defenses',
    tactic: 'Defense Evasion',
    patterns: [/\bAMSI bypass\b/i, /\bETW (?:blind|patch)\b/i, /\bkilled? EDR\b/i, /\bCrowdStrike sensor\b/i],
  },
  {
    id: 'T1546',
    name: 'Event Triggered Execution',
    tactic: 'Persistence',
    patterns: [/\bWMI subscription\b/i, /\bSysmon\b/i, /\bAccessibility (?:features?|abuse)\b/i],
  },
  {
    id: 'T1018',
    name: 'Remote System Discovery',
    tactic: 'Discovery',
    patterns: [
      /\bnetwork (?:scan|discovery|enumeration)\b/i,
      /\bnmap\b/i,
      /\bSMB enumeration\b/i,
      /\bAD enumeration\b/i,
    ],
  },
  {
    id: 'T1087',
    name: 'Account Discovery',
    tactic: 'Discovery',
    patterns: [/\b(?:net user|Get-ADUser|LDAP query)\b/i, /\bActive Directory enumeration\b/i],
  },
  {
    id: 'T1083',
    name: 'File and Directory Discovery',
    tactic: 'Discovery',
    patterns: [/\bfile (?:enumeration|search|discovery)\b/i, /\bdirectory listing\b/i],
  },
  {
    id: 'T1046',
    name: 'Network Service Discovery',
    tactic: 'Discovery',
    patterns: [/\bport scan\b/i, /\bservice (?:enumeration|discovery)\b/i],
  },
  {
    id: 'T1482',
    name: 'Domain Trust Discovery',
    tactic: 'Discovery',
    patterns: [/\bdomain trust\b/i, /\bforest trust\b/i],
  },
  {
    id: 'T1069',
    name: 'Permission Groups Discovery',
    tactic: 'Discovery',
    patterns: [/\b(?:group|permission) discovery\b/i, /\bBloodHound\b/i],
  },
  {
    id: 'T1016',
    name: 'System Network Configuration Discovery',
    tactic: 'Discovery',
    patterns: [/\bipconfig\b/i, /\bifconfig\b/i, /\broute print\b/i, /\bnltest\b/i],
  },
  {
    id: 'T1012',
    name: 'Query Registry',
    tactic: 'Discovery',
    patterns: [/\breg query\b/i, /\bregistry query\b/i, /\bWindows registry\b/i],
  },
  {
    id: 'T1057',
    name: 'Process Discovery',
    tactic: 'Discovery',
    patterns: [/\btasklist\b/i, /\bGet-Process\b/i, /\bprocess (?:enumeration|listing)\b/i],
  },
  {
    id: 'T1082',
    name: 'System Information Discovery',
    tactic: 'Discovery',
    patterns: [/\bsysteminfo\b/i, /\bhost fingerprinting\b/i],
  },
  {
    id: 'T1098',
    name: 'Account Manipulation',
    tactic: 'Persistence',
    patterns: [/\baccount manipulation\b/i, /\badded to (?:group|admins)\b/i, /\bpermission (?:changes|escalation)\b/i],
  },
  {
    id: 'T1556',
    name: 'Modify Authentication Process',
    tactic: 'Credential Access',
    patterns: [
      /\b(?:MFA|2FA) bypass\b/i,
      /\bauth(?:entication)? (?:bypass|manipulation)\b/i,
      /\bOkta (?:compromise|admin)\b/i,
    ],
  },
  {
    id: 'T1530',
    name: 'Cloud Storage Object Discovery',
    tactic: 'Collection',
    patterns: [/\bS3 bucket enumeration\b/i, /\bAzure Blob\b/i, /\bGCS bucket\b/i],
  },
  {
    id: 'T1193',
    name: 'Spearphishing Attachment (legacy)',
    tactic: 'Initial Access',
    patterns: [/\b(?:ISO|LNK|HTA|CHM|VBA) (?:attachment|in voice|file)\b/i],
  },
  {
    id: 'T1203',
    name: 'Exploitation for Client Execution',
    tactic: 'Execution',
    patterns: [/\bbrowser (?:exploit|0day)\b/i, /\bPDF exploit\b/i, /\bOffice exploit\b/i],
  },
];

/** Pure keyword-based TTP extraction. No LLM. */
export function extractTTPsKeyword(text: string): TtpHit[] {
  if (!text) return [];
  const hits: TtpHit[] = [];
  for (const t of TECHNIQUE_PATTERNS) {
    for (const re of t.patterns) {
      const m = text.match(re);
      if (m) {
        hits.push({
          id: t.id,
          name: t.name,
          tactic: t.tactic,
          confidence: 'medium',
          evidence: m[0].slice(0, 160),
        });
        break; // one hit per technique is enough
      }
    }
  }
  // Promote techniques that match a precise identifier (Txxxx) in the text
  // to "high" confidence — the analyst already named the technique.
  for (const hit of hits) {
    if (new RegExp(`\\b${hit.id}\\b`, 'i').test(text)) {
      hit.confidence = 'high';
    }
  }
  return hits;
}

const LLM_SYSTEM = `You are a senior threat-intelligence analyst. Read the provided report and extract MITRE ATT&CK techniques the actor actually used or attempted. Return STRICT JSON:

{
  "techniques": [
    { "id": "T1059", "name": "Command and Scripting Interpreter", "tactic": "Execution", "confidence": "high|medium|low", "evidence": "<short verbatim quote or paraphrase from the report, max 120 chars>" }
  ]
}

Rules:
- ONLY techniques clearly supported by the report. Do NOT infer.
- Prefer technique IDs the report names verbatim — cite them.
- Skip mitigations / defenses / IOCs unless they imply an executed technique.
- 5-15 techniques per report is typical. Don't pad.
- If the report is about a vulnerability disclosure with no observed exploitation, return an empty list.
- Output JSON only. No prose, no markdown fences.`;

const LLM_CALL_TIMEOUT_MS = 25_000;
const MAX_INPUT_CHARS = 12_000;

export interface TTPExtractionResult {
  techniques: TtpHit[];
  model: string;
  source: 'keyword' | 'llm' | 'merged';
  error?: string;
}

/** LLM-backed TTP extraction. Falls back to keyword on any failure. */
export async function extractTTPsLLM(text: string, env: Env): Promise<TTPExtractionResult> {
  if (!text || text.trim().length < 100) {
    return { techniques: extractTTPsKeyword(text), model: 'keyword-only', source: 'keyword' };
  }
  const input = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) + '\n…[truncated]' : text;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ttp-extract timeout')), LLM_CALL_TIMEOUT_MS)
    );
    const result = await Promise.race([
      runCompletion(
        env.AI,
        {
          system: LLM_SYSTEM,
          user: `REPORT:\n\n${input}`,
          maxTokens: 900,
          temperature: 0.2,
        },
        { groqKey: env.GROQ_API_KEY }
      ),
      timeout,
    ]);
    const text2 = typeof result.text === 'string' ? result.text.trim() : '';
    const jsonStart = text2.indexOf('{');
    const jsonEnd = text2.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error('no json in response');
    const parsed = JSON.parse(text2.slice(jsonStart, jsonEnd + 1)) as {
      techniques?: Array<{ id?: string; name?: string; tactic?: string; confidence?: string; evidence?: string }>;
    };
    const llmHits: TtpHit[] = (parsed.techniques ?? [])
      .filter((t) => t && typeof t.id === 'string' && /^T\d{4}$/.test(t.id))
      .map((t) => ({
        id: t.id!,
        name: typeof t.name === 'string' ? t.name : '',
        tactic: typeof t.tactic === 'string' ? t.tactic : 'Unknown',
        confidence:
          t.confidence === 'high' || t.confidence === 'medium' || t.confidence === 'low' ? t.confidence : 'low',
        evidence: typeof t.evidence === 'string' ? t.evidence.slice(0, 160) : '',
      }));

    // Merge: keyword hits fill gaps the LLM missed; LLM hits fill gaps
    // the keyword scanner missed. Dedupe by technique id, prefer the
    // higher-confidence entry.
    const kwHits = extractTTPsKeyword(text);
    const merged = new Map<string, TtpHit>();
    for (const h of [...kwHits, ...llmHits]) {
      const prev = merged.get(h.id);
      if (!prev) {
        merged.set(h.id, h);
        continue;
      }
      const order = { high: 3, medium: 2, low: 1 } as const;
      merged.set(h.id, order[h.confidence] > order[prev.confidence] ? h : prev);
    }
    return {
      techniques: Array.from(merged.values()).sort((a, b) => a.id.localeCompare(b.id)),
      model: result.modelUsed,
      source: 'merged',
    };
  } catch (e) {
    return {
      techniques: extractTTPsKeyword(text),
      model: 'keyword-fallback',
      source: 'keyword',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
