import { useState, useEffect, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { CopyButton } from '../../components/dfir/CopyButton';
import {
  ArrowLeft,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';

interface Chapter {
  id: string;
  num: number;
  title: string;
  description: string;
  concepts: string[];
  examples: Array<{ language: string; code: string }>;
  estimatedMinutes: number;
}

interface Domain {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  live: boolean;
  chapters: Chapter[];
  totalHours: number;
  color: string;
}

const DOMAINS: Domain[] = [
  {
    id: 'threat-hunting',
    icon: BookOpen,
    title: 'Threat Hunting',
    subtitle: 'CrowdStrike / Red Canary / Mandiant methodologies',
    live: true,
    totalHours: 13,
    color: 'emerald',
    chapters: [
      {
        id: 'th-philosophy',
        num: 1,
        title: 'The Hunt Philosophy',
        description:
          'Hypothesis-driven hunting overview — understanding the difference between reactive detection and proactive hunting.',
        concepts: [
          'Hypothesis-driven methodology',
          'Hunting Maturity Model (HMM)',
          'Baseline vs anomaly detection',
          'Time-to-detection reduction',
        ],
        examples: [
          {
            language: 'KQL',
            code: '// Identify anomalous outbound traffic\nDeviceNetworkEvents\n| where Timestamp > ago(7d)\n| summarize TotalBytes = sum(SentBytes) by DeviceName\n| where TotalBytes > 500000000\n| order by TotalBytes desc',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'th-peak',
        num: 2,
        title: 'PEAK Framework',
        description:
          'Preparation, Execution, Analysis, Knowledge transfer — a structured approach to hunting operations.',
        concepts: [
          'PEAK methodology phases',
          'Hypothesis refinement',
          'Data source mapping',
          'Knowledge base creation',
        ],
        examples: [
          {
            language: 'KQL',
            code: '// PEAK Execution: hunt for unusual process chains\nDeviceProcessEvents\n| where Timestamp > ago(14d)\n| where InitiatingProcessFileName in ("cmd.exe", "powershell.exe")\n  and ProcessFileName in ("rundll32.exe", "regsvr32.exe", "mshta.exe")\n| project Timestamp, DeviceName, InitiatingProcessFileName, ProcessFileName, CommandLine',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'th-tahiti',
        num: 3,
        title: 'TaHiTI Methodology',
        description: 'Threat Actor-centric hunting — focuses on adversary behaviors rather than specific IOCs.',
        concepts: [
          'Threat Actor-centric hunting',
          'TTP-based hypothesis generation',
          'Adversary playbook mapping',
          'Infrastructure tracking',
        ],
        examples: [
          {
            language: 'KQL',
            code: '// Hunt for TA behavior: certutil download\nDeviceProcessEvents\n| where Timestamp > ago(30d)\n| where FileName == "certutil.exe" and CommandLine has "-urlcache"\n| project Timestamp, DeviceName, AccountName, CommandLine',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'th-telemetry',
        num: 4,
        title: 'Data Sources & Telemetry',
        description: 'Understanding log types, EDR telemetry, network data, and identity signals for hunting.',
        concepts: [
          'EDR event types (process, network, registry)',
          'Network logs (DNS, HTTP, TLS)',
          'Identity and cloud logs',
          'Log retention and coverage gaps',
        ],
        examples: [
          {
            language: 'KQL',
            code: '// Enumerate available data sources\nunion DeviceProcessEvents, DeviceNetworkEvents, DeviceFileEvents, DeviceRegistryEvents\n| where Timestamp > ago(1h)\n| summarize Count = count() by $table\n| order by Count desc',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'th-kql',
        num: 5,
        title: 'KQL for Hunters',
        description: 'Kusto Query Language fundamentals with practical hunting examples.',
        concepts: [
          'KQL operators (where, summarize, project)',
          'Time-based analysis (bin, ago)',
          'Joining event types',
          'Hunting-specific patterns',
        ],
        examples: [
          {
            language: 'KQL',
            code: '// KQL hunting pattern: processes spawning from Office\nDeviceProcessEvents\n| where Timestamp > ago(7d)\n| where InitiatingProcessFileName in ("winword.exe", "excel.exe", "outlook.exe")\n  and not (ProcessFileName in ("eqnedt32.exe", "msohtmed.exe"))\n| extend ParentPID = InitiatingProcessId\n| join kind=inner DeviceNetworkEvents on $left.ProcessId == $right.ProcessId\n| project Timestamp, DeviceName, InitiatingProcessFileName, ProcessFileName, RemoteUrl',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'th-sigma',
        num: 6,
        title: 'Sigma for Hunters',
        description: 'SIEM-agnostic detection rules and how to convert Sigma to hunting queries.',
        concepts: ['Sigma rule structure', 'Logsource mapping', 'Detection logic', 'Sigma to KQL/SPL conversion'],
        examples: [
          {
            language: 'Sigma',
            code: "title: Suspicious Certutil Download\ndescription: Detects certutil.exe downloading remote content\nid: certutil-download\nlogsource:\n  product: windows\n  category: process_creation\ndetection:\n  selection:\n    Image|endswith: '\\\\certutil.exe'\n    CommandLine|contains: '-urlcache'\n  condition: selection\nfalsepositives:\n  - Legitimate admin scripts\nlevel: high",
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'th-spl',
        num: 7,
        title: 'SPL for Hunters',
        description: 'Splunk Search Processing Language for hunting at scale.',
        concepts: [
          'SPL search pipeline',
          'Stats and timechart commands',
          'Transaction and subsearch',
          'Lookups and data models',
        ],
        examples: [
          {
            language: 'SPL',
            code: 'index=windows sourcetype=WinEventLog:Security\n| search EventCode=4688\n| eval process = mvindex(CommandLine, 1)\n| search process IN (*powershell*, *cmd*, *wmic*)\n| stats count by process, User, host\n| where count > 5',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'th-admiralty',
        num: 8,
        title: 'Admiralty System',
        description: 'Evidence scoring and confidence levels for intelligence-derived hunting hypotheses.',
        concepts: [
          'Admiralty credibility scale',
          'Source reliability scoring',
          'Confidence levels in hunts',
          'Reporting confidence',
        ],
        examples: [
          {
            language: 'KQL',
            code: '// Track hunting confidence over time\nlet HuntResults = materialize (\n  DeviceProcessEvents\n  | where Timestamp > ago(7d)\n  | where ProcessFileName in ("powershell.exe", "cmd.exe")\n);\nHuntResults\n| summarize ConfidenceScore = dcount(InitiatingProcessFileName) by bin(Timestamp, 1d)\n| project Timestamp, ConfidenceScore, ThreatLevel = case(\n  ConfidenceScore > 10, "High",\n  ConfidenceScore > 5, "Medium",\n  "Low")',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'th-ml',
        num: 9,
        title: 'ML-Assisted Hunting',
        description: 'Advanced techniques using machine learning to surface anomalous behaviors.',
        concepts: [
          'Unsupervised anomaly detection',
          'Behavioral baselining',
          'Outlier scoring',
          'ML model integration in EDR',
        ],
        examples: [
          {
            language: 'KQL',
            code: '// Anomaly detection baseline\nlet Baseline = DeviceNetworkEvents\n| where Timestamp between (ago(30d) .. ago(1d))\n| summarize AvgBytes = avg(SentBytes), StdDev = stdev(SentBytes) by DeviceName;\nDeviceNetworkEvents\n| where Timestamp > ago(1d)\n| join kind=leftouter Baseline on DeviceName\n| extend ZScore = (SentBytes - AvgBytes) / max_of(StdDev, 1)\n| where ZScore > 3\n| project Timestamp, DeviceName, ZScore, RemoteUrl, SentBytes',
          },
        ],
        estimatedMinutes: 120,
      },
    ],
  },
  {
    id: 'lolbas',
    icon: BookOpen,
    title: 'LOLBAS',
    subtitle: 'Living off the land Windows binaries',
    live: true,
    totalHours: 10,
    color: 'sky',
    chapters: [
      {
        id: 'lol-intro',
        num: 1,
        title: 'Introduction to LOLBAS',
        description: 'What are Living-Off-the-Land binaries and why they matter in incident response.',
        concepts: [
          'Definition of LOLBAS',
          'Why attackers use built-in tools',
          'Detection challenges',
          'LOLBAS project overview',
        ],
        examples: [],
        estimatedMinutes: 60,
      },
      {
        id: 'lol-certutil',
        num: 2,
        title: 'Certutil',
        description: 'Abuse patterns for certutil.exe — download, encode, decode, and install certificates.',
        concepts: [
          '-urlcache download',
          'Base64 encode/decode',
          'Certificate extraction',
          'Detection via command-line logging',
        ],
        examples: [
          {
            language: 'KQL',
            code: 'DeviceProcessEvents\n| where FileName == "certutil.exe"\n| where CommandLine has_any ("-urlcache", "-decode", "-encode")\n| project Timestamp, DeviceName, AccountName, CommandLine',
          },
        ],
        estimatedMinutes: 75,
      },
      {
        id: 'lol-mshta',
        num: 3,
        title: 'Mshta',
        description: 'HTA execution via mshta.exe for in-memory payload delivery.',
        concepts: [
          'HTA file format',
          'Inline JavaScript/VBS execution',
          'Mshta in phishing attacks',
          'Detection via parent process',
        ],
        examples: [
          {
            language: 'KQL',
            code: 'DeviceProcessEvents\n| where FileName == "mshta.exe"\n| where InitiatingProcessFileName in ("outlook.exe", "winword.exe", "explorer.exe")\n| project Timestamp, DeviceName, AccountName, InitiatingProcessFileName, CommandLine',
          },
        ],
        estimatedMinutes: 75,
      },
      {
        id: 'lol-regsvr32',
        num: 4,
        title: 'Regsvr32',
        description: 'COM/Scriptlet execution and bypassing AppLocker using regsvr32.exe.',
        concepts: [
          'COM registration abuse',
          'Scriptlet execution (scrobj.dll)',
          'AppLocker bypass',
          'Squiblydoo technique',
        ],
        examples: [
          {
            language: 'KQL',
            code: 'DeviceProcessEvents\n| where FileName == "regsvr32.exe"\n| where CommandLine has_any ("/u", "scrobj.dll", "-s")\n| project Timestamp, DeviceName, AccountName, CommandLine',
          },
        ],
        estimatedMinutes: 75,
      },
      {
        id: 'lol-bitsadmin',
        num: 5,
        title: 'Bitsadmin',
        description: 'File download and execution abuse using Background Intelligent Transfer Service.',
        concepts: [
          'BITS job creation',
          'File download to alternate locations',
          'Persistent download',
          'BITS detection edge cases',
        ],
        examples: [
          {
            language: 'KQL',
            code: 'DeviceProcessEvents\n| where FileName == "bitsadmin.exe"\n| where CommandLine has "/transfer"\n| project Timestamp, DeviceName, AccountName, CommandLine',
          },
        ],
        estimatedMinutes: 75,
      },
      {
        id: 'lol-wmi',
        num: 6,
        title: 'WMI',
        description: 'Windows Management Instrumentation for lateral movement and reconnaissance.',
        concepts: [
          'WMI query execution',
          'WMI process creation',
          'WMI event subscription persistence',
          'Remote WMI connections',
        ],
        examples: [
          {
            language: 'KQL',
            code: 'DeviceProcessEvents\n| where FileName == "wmic.exe"\n| where CommandLine has_any ("process call create", "node:", "select * from")\n| project Timestamp, DeviceName, AccountName, CommandLine',
          },
        ],
        estimatedMinutes: 75,
      },
      {
        id: 'lol-powershell',
        num: 7,
        title: 'PowerShell LOL Techniques',
        description: 'Living-off-the-land PowerShell abuse patterns without writing scripts to disk.',
        concepts: [
          'PowerShell.exe vs powershell_ise.exe',
          'Reflective loading',
          'Download cradle patterns',
          'Constrained language mode bypasses',
        ],
        examples: [
          {
            language: 'KQL',
            code: 'DeviceProcessEvents\n| where FileName == "powershell.exe"\n| where CommandLine has_any ("-enc", "-w hidden", "IEX(", "Net.WebClient", "DownloadString")\n| project Timestamp, DeviceName, AccountName, CommandLine',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'lol-defense',
        num: 8,
        title: 'Defense Evasion',
        description: 'LOLBAS-based techniques for bypassing security controls and detection.',
        concepts: [
          'Process injection via LOLBAS',
          'AMSI bypass techniques',
          'Log clearing using wevtutil',
          'Parent PID spoofing',
        ],
        examples: [
          {
            language: 'KQL',
            code: 'DeviceProcessEvents\n| where FileName == "wevtutil.exe"\n| where CommandLine has "cl"\n| project Timestamp, DeviceName, AccountName, CommandLine\n| join kind=leftanti (\n    DeviceProcessEvents\n    | where FileName == "wevtutil.exe"\n    | where CommandLine !has "cl"\n  ) on DeviceName',
          },
        ],
        estimatedMinutes: 75,
      },
    ],
  },
  {
    id: 'threat-intel',
    icon: BookOpen,
    title: 'Threat Intelligence',
    subtitle: 'CTI practitioner curriculum',
    live: true,
    totalHours: 11,
    color: 'violet',
    chapters: [
      {
        id: 'ti-cycle',
        num: 1,
        title: 'Intelligence Cycle',
        description: 'The fundamental cycle: Requirements → Collection → Analysis → Dissemination → Feedback.',
        concepts: [
          'Intelligence lifecycle phases',
          'Requirements gathering (PIRs)',
          'Collection management',
          'Analysis techniques',
          'Dissemination best practices',
        ],
        examples: [],
        estimatedMinutes: 90,
      },
      {
        id: 'ti-ioc-confidence',
        num: 2,
        title: 'IOC Confidence Scoring',
        description: 'Pyramid of Pain, confidence levels, and how to score indicators of compromise.',
        concepts: [
          'Pyramid of Pain framework',
          'IOC confidence scoring methodology',
          'Hash vs IP vs domain vs TTP severity',
          'False positive management',
        ],
        examples: [
          {
            language: 'KQL',
            code: '// IOC severity scoring based on type\nlet IOCs = datatable(Indicator:string, Type:string) [\n  "e3b0c44...", "hash",\n  "203.0.113.42", "ip",\n  "evil.com", "domain"\n];\nIOCs\n| extend Severity = case(\n  Type == "hash", "Low (easily changed)",\n  Type == "ip", "Medium (infrastructure)",\n  Type == "domain", "Medium (infrastructure)",\n  Type == "TTP", "High (behavioral)",\n  "Unknown")',
          },
        ],
        estimatedMinutes: 75,
      },
      {
        id: 'ti-diamond',
        num: 3,
        title: 'Diamond Model',
        description: 'The Diamond Model of intrusion analysis: Adversary, Capability, Infrastructure, Victim.',
        concepts: [
          'Diamond Model components',
          'Bidirectional relationships',
          'Activity threads',
          'Event scoring and impact analysis',
        ],
        examples: [],
        estimatedMinutes: 75,
      },
      {
        id: 'ti-attribution',
        num: 4,
        title: 'Threat Actor Profiling',
        description: 'Attribution methodologies, confidence levels, and common pitfalls.',
        concepts: [
          'Attribution frameworks',
          'Confidence levels in attribution',
          'TTP clustering',
          'False flag operations',
        ],
        examples: [],
        estimatedMinutes: 90,
      },
      {
        id: 'ti-stix',
        num: 5,
        title: 'STIX 2.1 & TAXII',
        description: 'Structured Threat Information Expression and Trusted Automated Exchange of Intelligence.',
        concepts: [
          'STIX domain objects (SDOs)',
          'STIX relationship objects (SROs)',
          'TAXII 2.1 server and client',
          'Indicator and campaign mapping',
        ],
        examples: [
          {
            language: 'JSON (STIX 2.1)',
            code: '{\n  "type": "indicator",\n  "spec_version": "2.1",\n  "id": "indicator--8e2e2d2b-17d4-4cbf-938f-98ee46b3cd3f",\n  "created": "2026-06-15T00:00:00Z",\n  "name": "Malicious domain",\n  "pattern": "[domain-name:value = \'evil-domain.xyz\']",\n  "pattern_type": "stix",\n  "valid_from": "2026-06-15T00:00:00Z"\n}',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'ti-intel-hunting',
        num: 6,
        title: 'Intel-Driven Hunting',
        description: 'Converting intelligence reports into actionable hunting hypotheses and detection logic.',
        concepts: [
          'Intel to hypothesis pipeline',
          'TTP to query mapping',
          'Campaign tracking',
          'Cross-source intel correlation',
        ],
        examples: [
          {
            language: 'KQL',
            code: '// Intel-driven hunt for IcedID / BokBot loader\nDeviceProcessEvents\n| where InitiatingProcessFileName in ("cmd.exe", "powershell.exe")\n  and ProcessFileName has_any ("rundll32.exe", "regsvr32.exe")\n| where CommandLine has_any (".dat", ".tmp", "http://", "https://")\n| project Timestamp, DeviceName, InitiatingProcessFileName,\n           ProcessFileName, CommandLine',
          },
        ],
        estimatedMinutes: 90,
      },
      {
        id: 'ti-campaign',
        num: 7,
        title: 'Malware & Campaign Analysis',
        description: 'Analyzing malware campaigns: infrastructure clustering, payload analysis, and attribution.',
        concepts: [
          'Campaign infrastructure identification',
          'Payload similarity analysis',
          'Cross-campaign correlation',
          'Indicators of compromise extraction',
        ],
        examples: [],
        estimatedMinutes: 90,
      },
      {
        id: 'ti-writing',
        num: 8,
        title: 'CTI Writing',
        description: 'Writing intelligence reports that drive action and inform decision-makers.',
        concepts: [
          'Report structure (TLP, summary, analysis)',
          'Consumer-aware communication',
          'Analytical confidence statements',
          'TLP and handling caveats',
        ],
        examples: [],
        estimatedMinutes: 75,
      },
    ],
  },
  {
    id: 'soc-operations',
    icon: BookOpen,
    title: 'SOC Operations',
    subtitle: 'Alert triage, escalation, shift management',
    live: false,
    totalHours: 14,
    color: 'slate',
    chapters: [],
  },
  {
    id: 'malware-analysis',
    icon: BookOpen,
    title: 'Malware Analysis',
    subtitle: 'Static, dynamic, and behavioral analysis',
    live: false,
    totalHours: 16,
    color: 'slate',
    chapters: [],
  },
  {
    id: 'cloud-security',
    icon: BookOpen,
    title: 'Cloud Security',
    subtitle: 'Azure / AWS / Entra hunting',
    live: false,
    totalHours: 12,
    color: 'slate',
    chapters: [],
  },
];

type ProgressData = Record<string, string[]>;

const STORAGE_KEY = 'h3ad-learn-progress';

function loadProgress(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ProgressData;
  } catch {
    /* ignore */
  }
  return {};
}

function saveProgress(p: ProgressData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export default function H3adLearn(): JSX.Element {
  const [progress, setProgress] = useState<ProgressData>(loadProgress);
  const [expandedDomain, setExpandedDomain] = useState<string | null>('threat-hunting');
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const toggleDomain = (id: string) => {
    setExpandedDomain((prev) => (prev === id ? null : id));
    setExpandedChapter(null);
  };

  const toggleChapter = (id: string) => {
    setExpandedChapter((prev) => (prev === id ? null : id));
  };

  const isComplete = (domainId: string, chapterId: string) => {
    return (progress[domainId] ?? []).includes(chapterId);
  };

  const toggleComplete = useCallback((domainId: string, chapterId: string) => {
    setProgress((prev) => {
      const domainProgress = prev[domainId] ?? [];
      const next = domainProgress.includes(chapterId)
        ? domainProgress.filter((c) => c !== chapterId)
        : [...domainProgress, chapterId];
      return { ...prev, [domainId]: next };
    });
  }, []);

  const domainProgress = (d: Domain) => {
    if (d.chapters.length === 0) return 0;
    const done = (progress[d.id] ?? []).filter((c) => d.chapters.some((ch) => ch.id === c)).length;
    return Math.round((done / d.chapters.length) * 100);
  };

  const totalChapters = DOMAINS.reduce((a, b) => a + b.chapters.length, 0);
  const totalDone = DOMAINS.reduce(
    (a, d) => a + (progress[d.id] ?? []).filter((c) => d.chapters.some((ch) => ch.id === c)).length,
    0
  );
  const resetProgress = () => {
    setProgress({});
  };

  const totalLiveChapters = DOMAINS.filter((d) => d.live).reduce((a, d) => a + d.chapters.length, 0);
  const totalLiveHours = DOMAINS.filter((d) => d.live).reduce((a, d) => a + d.totalHours, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <GraduationCap size={28} className="text-brand-600 dark:text-brand-400" /> H3AD-LEARN
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Modular security training platform — hunting, LOLBAS, threat intelligence, and more.
        </p>
      </div>

      <div className="surface-card p-4 mb-8 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 text-sm font-mono text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />3 domains live
          </span>
          <span className="hidden sm:block">&middot;</span>
          <span>{totalLiveChapters} chapters</span>
          <span className="hidden sm:block">&middot;</span>
          <span>{totalLiveHours} hrs of training</span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-brand-600 dark:text-brand-400">
            {totalDone} of {totalChapters} chapters completed
          </span>
          <button
            type="button"
            onClick={resetProgress}
            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-500 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors inline-flex items-center gap-1.5"
          >
            <RotateCcw size={10} /> Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {DOMAINS.map((d) => {
          const Icon = d.icon;
          const pct = domainProgress(d);
          const done = (progress[d.id] ?? []).filter((c) => d.chapters.some((ch) => ch.id === c)).length;
          const total = d.chapters.length;

          const liveBadgeColor = d.live
            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700';

          return (
            <button
              key={d.id}
              type="button"
              onClick={() => d.live && toggleDomain(d.id)}
              className={`surface-card p-5 text-left transition-all ${d.live ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-e2' : 'cursor-default opacity-70'} ${expandedDomain === d.id ? 'ring-2 ring-brand-500/30' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                  <Icon size={20} className="text-brand-600 dark:text-brand-400" />
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${liveBadgeColor}`}>
                  {d.live ? 'LIVE' : 'PLANNED'}
                </span>
              </div>
              <h3 className="font-display font-bold text-sm mb-1">{d.title}</h3>
              <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-3">{d.subtitle}</p>
              {d.live && (
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>
                    {total} chapters, ~{d.totalHours}h
                  </span>
                  <span>
                    {done}/{total}
                  </span>
                </div>
              )}
              {d.live && total > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {expandedDomain &&
        (() => {
          const d = DOMAINS.find((x) => x.id === expandedDomain);
          if (!d || !d.live) return null;
          return (
            <div className="animate-fade-in-up space-y-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-lg flex items-center gap-2">
                  <BookOpen size={18} className="text-brand-600 dark:text-brand-400" />
                  {d.title}
                </h2>
                <span className="text-xs font-mono text-slate-500">{domainProgress(d)}% complete</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mb-6">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-500"
                  style={{ width: `${domainProgress(d)}%` }}
                />
              </div>
              {d.chapters.map((ch) => {
                const open = expandedChapter === ch.id;
                const complete = isComplete(d.id, ch.id);
                return (
                  <div key={ch.id} className="surface-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleChapter(ch.id)}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleComplete(d.id, ch.id);
                        }}
                        className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          complete
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-slate-300 dark:border-slate-700 hover:border-brand-400'
                        }`}
                        aria-label={complete ? `Mark ${ch.title} incomplete` : `Mark ${ch.title} complete`}
                      >
                        {complete && <CheckCircle2 size={12} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400">Ch {ch.num}</span>
                          <h3
                            className={`text-sm font-display font-bold ${complete ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}
                          >
                            {ch.title}
                          </h3>
                        </div>
                        <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                          <Clock size={10} />~{ch.estimatedMinutes} min
                        </p>
                      </div>
                      {open ? (
                        <ChevronDown size={14} className="text-slate-400" />
                      ) : (
                        <ChevronRight size={14} className="text-slate-400" />
                      )}
                    </button>
                    {open && (
                      <div className="px-4 pb-5 space-y-4 animate-fade-in-up border-t border-slate-100 dark:border-slate-800 pt-4">
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{ch.description}</p>
                        {ch.concepts.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-mono font-bold text-brand-600 dark:text-brand-400 mb-2 uppercase tracking-wider">
                              Key Concepts
                            </h4>
                            <ul className="space-y-1">
                              {ch.concepts.map((c, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-1.5 text-xs font-mono text-slate-700 dark:text-slate-300"
                                >
                                  <span className="text-brand-500 mt-0.5 flex-shrink-0">&bull;</span>
                                  {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {ch.examples.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-mono font-bold text-brand-600 dark:text-brand-400 mb-2 uppercase tracking-wider">
                              Query Examples
                            </h4>
                            <div className="space-y-2">
                              {ch.examples.map((ex, i) => (
                                <div
                                  key={i}
                                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950/5 dark:bg-slate-950/30 overflow-hidden"
                                >
                                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                                    <span className="text-[10px] font-mono font-bold text-slate-500">
                                      {ex.language}
                                    </span>
                                    <CopyButton value={ex.code} title={`Copy ${ex.language}`} />
                                  </div>
                                  <pre className="p-3 text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto leading-relaxed">
                                    {ex.code}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
    </div>
  );
}
