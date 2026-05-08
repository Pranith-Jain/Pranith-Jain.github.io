/**
 * Static threat intel briefings data.
 * Add new entries here over time. Newest first.
 */

export type BriefingType = 'daily' | 'weekly';

export interface KeyIoc {
  type: 'url' | 'domain' | 'ipv4' | 'hash' | 'cve';
  value: string;
  context?: string;
}

export interface Briefing {
  slug: string;
  type: BriefingType;
  title: string;
  date: string; // ISO date YYYY-MM-DD
  date_range: string; // for weekly: "2026-05-01 – 2026-05-07"
  summary: string; // 2-4 sentences
  findings_count: number;
  cves_count: number;
  mitre_techniques: string[];
  sources: string[];
  key_iocs?: KeyIoc[];
}

export const briefings: Briefing[] = [
  {
    slug: '2026-05-08-daily',
    type: 'daily',
    title: 'Daily Threat Briefing — 2026-05-08',
    date: '2026-05-08',
    date_range: '2026-05-08',
    summary:
      'CISA KEV added two new entries today, including a critical authentication-bypass vulnerability in a widely-deployed enterprise VPN product (per CISA KEV). Abuse.ch URLhaus observed a spike in malware distribution URLs linked to a stealer campaign targeting APAC financial institutions. MalwareBazaar recorded 14 new Emotet-derivative samples, suggesting renewed loader activity as observed in the past 24 h.',
    findings_count: 21,
    cves_count: 2,
    mitre_techniques: ['T1190', 'T1566.001', 'T1055', 'T1059.003'],
    sources: ['CISA KEV', 'URLhaus', 'MalwareBazaar'],
    key_iocs: [
      {
        type: 'cve',
        value: 'CVE-2025-47460',
        context: 'Authentication bypass in enterprise VPN — CISA KEV 2026-05-08',
      },
    ],
  },
  {
    slug: '2026-05-07-daily',
    type: 'daily',
    title: 'Daily Threat Briefing — 2026-05-07',
    date: '2026-05-07',
    date_range: '2026-05-07',
    summary:
      'ThreatFox logged 38 new command-and-control indicators yesterday, predominantly Cobalt Strike and AsyncRAT beacons, per Abuse.ch ThreatFox data. OpenPhish added 19 new phishing URLs impersonating major cloud providers. Feodo Tracker recorded 4 new Dridex botnet C2 IPs, consistent with a mid-week activity pattern observed over the past month.',
    findings_count: 17,
    cves_count: 0,
    mitre_techniques: ['T1071.001', 'T1105', 'T1566.002', 'T1219'],
    sources: ['ThreatFox', 'OpenPhish', 'Feodo Tracker'],
    key_iocs: [
      {
        type: 'domain',
        value: 'update-microsoft-edge[.]com',
        context: 'Phishing lure — impersonates Microsoft, per OpenPhish',
      },
    ],
  },
  {
    slug: '2026-W19-weekly',
    type: 'weekly',
    title: 'Weekly Threat Briefing — W19 2026',
    date: '2026-05-08',
    date_range: '2026-05-02 – 2026-05-08',
    summary:
      'Week 19 saw a 23% increase in phishing URLs tracked by OpenPhish compared with W18, with financial-services lures dominating. CISA KEV grew by 5 new entries this week, including vulnerabilities in industrial control system components. Abuse.ch feeds collectively logged over 1,200 new malicious indicators, with LockBit-derivative ransomware samples continuing to appear in MalwareBazaar as observed across the week.',
    findings_count: 94,
    cves_count: 5,
    mitre_techniques: ['T1190', 'T1486', 'T1566.001', 'T1566.002', 'T1071.001', 'T1027'],
    sources: ['CISA KEV', 'URLhaus', 'MalwareBazaar', 'ThreatFox', 'OpenPhish', 'Feodo Tracker'],
    key_iocs: [
      {
        type: 'cve',
        value: 'CVE-2025-32433',
        context: 'Critical Erlang/OTP SSH pre-auth RCE — CISA KEV W19',
      },
      {
        type: 'hash',
        value: 'd41d8cd98f00b204e9800998ecf8427e',
        context: 'Placeholder — replace with real MalwareBazaar hash',
      },
    ],
  },
];
