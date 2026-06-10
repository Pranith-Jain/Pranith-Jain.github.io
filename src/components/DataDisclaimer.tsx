import { Radio, AlertTriangle, Github } from 'lucide-react';
import { SEVERITY_TONE, type Severity } from './severity';

// Source `risk` strings use a "moderate" tier; map to the canonical Severity union.
const normalizeRisk = (r: string): Severity => (r === 'moderate' ? 'medium' : (r as Severity));

const SOURCES = [
  {
    id: 'ransomlook',
    name: 'Ransomlook',
    grade: 'B',
    risk: 'low',
    desc: 'Leak-site scraping — ransomware group onion posts',
    bias: 'Only claims posted to leak sites',
  },
  {
    id: 'ransomwarelive',
    name: 'ransomware.live PRO',
    grade: 'B',
    risk: 'low',
    desc: 'Authenticated API — ransom notes, negotiation logs, victim claims',
  },
  {
    id: 'ctifyi',
    name: 'cti.fyi',
    grade: 'B',
    risk: 'low',
    desc: 'Leak-site post tracker — victim claims with .onion screenshots',
    bias: 'Only claims posted to leak sites',
  },
  {
    id: 'x-claims',
    name: 'X / FalconFeeds + DailyDarkWeb',
    grade: 'C',
    risk: 'medium',
    desc: 'Ransomware + breach claims parsed from threat-intel X posts (free text)',
    bias: 'Heuristic extraction from prose — lower precision; unverified actor claims',
  },
  {
    id: 'cisa-kev',
    name: 'CISA KEV',
    grade: 'A',
    risk: 'low',
    desc: 'Known Exploited Vulnerabilities — authoritative US govt',
  },
  { id: 'nvd', name: 'NVD', grade: 'A', risk: 'low', desc: 'National Vulnerability Database — official CVE repo' },
  {
    id: 'malpedia',
    name: 'Malpedia',
    grade: 'B',
    risk: 'low',
    desc: 'Curated malware family reference (Fraunhofer FKIE)',
  },
  { id: 'abusech-urlhaus', name: 'URLhaus', grade: 'A', risk: 'low', desc: 'Confirmed malicious URLs (abuse.ch)' },
  {
    id: 'abusech-threatfox',
    name: 'ThreatFox',
    grade: 'A',
    risk: 'low',
    desc: 'Confirmed malicious IOCs with context (abuse.ch)',
  },
  {
    id: 'abusech-malwarebazaar',
    name: 'MalwareBazaar',
    grade: 'A',
    risk: 'low',
    desc: 'Confirmed malware samples with hashes (abuse.ch)',
  },
  { id: 'phish-tank', name: 'PhishTank', grade: 'B', risk: 'low', desc: 'Crowdsourced phishing verification' },
  { id: 'openphish', name: 'OpenPhish', grade: 'B', risk: 'low', desc: 'Curated commercial phishing feed' },
  {
    id: 'certspotter',
    name: 'Cert Spotter / crt.sh',
    grade: 'B',
    risk: 'low',
    desc: 'Certificate Transparency log search',
  },
  {
    id: 'hudson-rock',
    name: 'Hudson Rock',
    grade: 'C',
    risk: 'moderate',
    desc: 'Infostealer victim data',
    bias: 'Only infostealer-compromised machines',
  },
  { id: 'leak-check', name: 'LeakCheck', grade: 'C', risk: 'moderate', desc: 'Breach database aggregator' },
  { id: 'xposedornot', name: 'XposedOrNot', grade: 'C', risk: 'moderate', desc: 'Breach aggregation service' },
  { id: 'ipsum', name: 'IPsum', grade: 'C', risk: 'moderate', desc: 'Consensus-scored malicious IPs from 3+ lists' },
  { id: 'cinsarmy', name: 'CINS Army', grade: 'C', risk: 'moderate', desc: 'Active malicious IP list' },
  { id: 'bitwire', name: 'Bitwire IP Blocklist', grade: 'C', risk: 'moderate', desc: 'IP blocklist' },
  { id: 'mythreatintel', name: 'MyThreatIntel', grade: 'C', risk: 'moderate', desc: 'Commercial CTI platform' },
  { id: 'abuseipdb', name: 'AbuseIPDB', grade: 'C', risk: 'moderate', desc: 'Crowdsourced IP reputation' },
  { id: 'otx', name: 'AlienVault OTX', grade: 'C', risk: 'moderate', desc: 'Open Threat Exchange pulses' },
  { id: 'virustotal', name: 'VirusTotal', grade: 'B', risk: 'low', desc: 'Multi-engine file scanner' },
  {
    id: 'telegram-feed',
    name: 'Telegram Cybersec',
    grade: 'D',
    risk: 'high',
    desc: 'Public Telegram channels — IOC drops, leak announcements',
    bias: 'Quality varies by channel',
  },
  {
    id: 'telegram-leak-monitor',
    name: 'Telegram Leak Monitor',
    grade: 'D',
    risk: 'high',
    desc: 'Auto-scanned Telegram for leaks',
    bias: 'Scanner heuristics produce false positives',
  },
  {
    id: 'reddit',
    name: 'Reddit Cybersec',
    grade: 'D',
    risk: 'high',
    desc: '16 cybersec subreddits',
    bias: 'Discussion may include unsubstantiated claims',
  },
  { id: 'x-twitter', name: 'X/Twitter Cybersec', grade: 'D', risk: 'high', desc: 'Researcher tweets & IOC drops' },
  { id: 'bluesky', name: 'Bluesky Cybersec', grade: 'D', risk: 'high', desc: 'Researcher posts (smaller community)' },
  {
    id: 'ai-copilot',
    name: 'AI Copilot Analysis',
    grade: 'F',
    risk: 'critical',
    desc: 'LLM-generated assessment',
    bias: 'May hallucinate attribution or IOCs',
  },
  {
    id: 'actor-dna',
    name: 'Actor DNA Analysis',
    grade: 'E',
    risk: 'high',
    desc: 'AI-driven actor profiling',
    bias: 'Pattern-matching may produce false associations',
  },
  {
    id: 'heuristic-cve-link',
    name: 'Heuristic CVE→Actor',
    grade: 'E',
    risk: 'high',
    desc: 'Keyword-based CVE→actor matching',
    bias: 'Matches may be coincidental',
  },
  {
    id: 'predictive',
    name: 'Predictive Intel',
    grade: 'F',
    risk: 'critical',
    desc: 'Forward-looking pattern extrapolation',
    bias: 'Novel TTPs not covered',
  },
];

const OS_TOOLS = [
  'Vite',
  'React 18',
  'TypeScript',
  'Tailwind CSS',
  'Cloudflare Workers',
  'Wrangler',
  'Lucide React',
  'React Router',
  'Recharts',
  'Leaflet',
  'D3 / vis-network',
  'STIX 2.1',
  'NATO Admiralty Code',
  'sql.js (WASM)',
];

const GRADE_STYLES: Record<string, string> = {
  A: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  B: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  C: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  D: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  E: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  F: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
};

export function DataDisclaimer() {
  return (
    <div className="space-y-6">
      {/* Disclaimer banner */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-4 text-sm text-amber-800 dark:text-amber-200 font-mono">
        <p className="font-semibold flex items-center gap-2 mb-1">
          <AlertTriangle size={14} /> Disclaimer
        </p>
        <p>
          This platform aggregates data from the following sources for reference and decision-support purposes only.
          Source reliability varies — always validate indicators in your own environment before taking action. The
          platform does not verify, endorse, or guarantee the accuracy of third-party data.
        </p>
      </div>

      {/* Sources */}
      <div>
        <p className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Radio size={12} /> Backend data sources ({SOURCES.length})
        </p>
        <p className="text-mini font-mono text-slate-500 mb-3">
          Reliability graded per NATO Admiralty Code (A=best, F=unassessed). Risk level indicates how much corroboration
          is recommended before acting on data from each source.
        </p>
        <div className="space-y-1">
          {SOURCES.map((s) => (
            <div
              key={s.id}
              className="flex items-start gap-2 text-mini font-mono py-1 border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
              <span className={`px-1 py-0.5 rounded text-micro font-bold shrink-0 ${GRADE_STYLES[s.grade] ?? ''}`}>
                {s.grade}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-slate-900 dark:text-slate-100">{s.name}</span>
                <span className="text-slate-500"> — {s.desc}</span>
                {s.bias && <span className="text-amber-600 dark:text-amber-400 block truncate">{s.bias}</span>}
              </div>
              <span
                className={`shrink-0 rounded border px-1 py-0.5 text-micro uppercase ${SEVERITY_TONE[normalizeRisk(s.risk)]}`}
              >
                {s.risk}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Open source */}
      <div>
        <p className="text-xs font-mono font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Github size={12} /> Open source tools & libraries
        </p>
        <div className="flex flex-wrap gap-1.5">
          {OS_TOOLS.map((t) => (
            <span
              key={t}
              className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-micro font-mono text-slate-600 dark:text-slate-400"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
