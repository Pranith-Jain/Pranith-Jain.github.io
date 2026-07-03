import { useMemo, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Shield, Target } from 'lucide-react';
import { sanitizeUrl } from '../../lib/sanitize-url';

type Priority = 'CRITICAL' | 'HIGH';
type FPLevel = 'Pre-Exec' | 'High FP' | 'Medium FP' | 'Low FP';
type Maturity = 'Research' | 'Hunt' | 'Analyst';

interface Chokepoint {
  name: string;
  priority: Priority;
  techniques: string[];
  fpLevel: FPLevel;
  maturity: Maturity;
  description: string;
  url: string;
  tags: string[];
}

const CHOKEPOINTS: Chokepoint[] = [
  {
    name: 'AiTM WebSocket Kit Relay',
    priority: 'CRITICAL',
    techniques: ['T1539', 'T1078.004'],
    fpLevel: 'Pre-Exec',
    maturity: 'Hunt',
    description:
      'Adversary-in-the-Middle proxy relay via WebSocket-based phishing kits. Intercepts session tokens and MFA codes in real time, bypassing push-based MFA.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['aitm', 'mfa-bypass', 'phishing', 'session-theft'],
  },
  {
    name: 'Infostealer Browser Credential Theft',
    priority: 'CRITICAL',
    techniques: ['T1555.003', 'T1539', 'T1041'],
    fpLevel: 'Pre-Exec',
    maturity: 'Analyst',
    description:
      'Browser credential and cookie exfiltration by commodity infostealers (Lumma, Raccoon, RedLine). Targets cookie stores, saved passwords, and session tokens before the host is remediated.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['infostealer', 'credentials', 'cookies', 'browser'],
  },
  {
    name: 'LSASS Credential Dumping',
    priority: 'CRITICAL',
    techniques: ['T1003.001', 'T1003', 'T1547.005'],
    fpLevel: 'High FP',
    maturity: 'Analyst',
    description:
      'LSASS process memory access for credential extraction. 24 documented variations across tools (Mimikatz, ProcDump, comsvcs.dll, direct syscalls). High false-positive rate without context.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['lsass', 'credentials', 'mimikatz', 'credential-dumping'],
  },
  {
    name: 'EDR Bypass Techniques',
    priority: 'CRITICAL',
    techniques: ['T1562.001', 'T1562.006', 'T1055.001'],
    fpLevel: 'Medium FP',
    maturity: 'Research',
    description:
      'Defense evasion via EDR sensor tampering — process termination, driver unloading, callback removal, and direct kernel calls. Each variant leaves distinct telemetry gaps.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['edr', 'defense-evasion', 'tampering', 'kernel'],
  },
  {
    name: 'Ransomware Service Manipulation',
    priority: 'CRITICAL',
    techniques: ['T1562.001', 'T1489'],
    fpLevel: 'Medium FP',
    maturity: 'Hunt',
    description:
      'Pre-encryption service disruption — stopping backup agents, databases, and AV services via sc.exe, net stop, or PsExec. Creates a detection window before payload execution.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['ransomware', 'service-stop', 'backup-disable', 'pre-encryption'],
  },
  {
    name: 'Web Shell Persistence',
    priority: 'CRITICAL',
    techniques: ['T1505.003', 'T1190', 'T1059.004'],
    fpLevel: 'Medium FP',
    maturity: 'Analyst',
    description:
      'Post-exploitation web shell deployment on IIS, Apache, and Nginx. Server-side scripting persistence with command execution capability, often obfuscated or embedded in legitimate files.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['web-shell', 'persistence', 'iis', 'server-side'],
  },
  {
    name: 'BYOSI Scripting Interpreters',
    priority: 'HIGH',
    techniques: ['T1059.006', 'T1059.007', 'T1059'],
    fpLevel: 'High FP',
    maturity: 'Analyst',
    description:
      'Bring-your-own scripting interpreters — Python, Node.js, PowerShell downloaded to disk and used for execution. Bypasses application whitelisting by using legitimate runtimes.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['scripting', 'interpreter', 'python', 'node', 'powershell'],
  },
  {
    name: 'OAuth Device Code Phishing',
    priority: 'HIGH',
    techniques: ['T1550.001'],
    fpLevel: 'Pre-Exec',
    maturity: 'Research',
    description:
      'OAuth device code flow abuse — attacker tricks user into approving a device code, granting persistent token access without password compromise. Bypasses MFA entirely.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['oauth', 'device-code', 'cloud', 'identity'],
  },
  {
    name: 'Graph API Reconnaissance Burst',
    priority: 'HIGH',
    techniques: ['T1087.004', 'T1069.003', 'T1526'],
    fpLevel: 'Pre-Exec',
    maturity: 'Hunt',
    description:
      'Azure/M365 Graph API enumeration — bulk user, group, and role queries from a single token. Detectable via query velocity, unusual service-principal activity, and cross-tenant access patterns.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['graph-api', 'reconnaissance', 'azure', 'entra-id'],
  },
  {
    name: 'ClickFix Techniques',
    priority: 'HIGH',
    techniques: ['T1204.004'],
    fpLevel: 'Pre-Exec',
    maturity: 'Research',
    description:
      'Social engineering via fake CAPTCHA, browser update prompts, or "copy-paste" instructions that lead to PowerShell/terminal execution. Exploits user trust in familiar UI patterns.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['clickfix', 'social-engineering', 'captcha', 'terminal'],
  },
  {
    name: 'Renamed RMM Tools',
    priority: 'HIGH',
    techniques: ['T1219.002'],
    fpLevel: 'High FP',
    maturity: 'Analyst',
    description:
      'Remote Monitoring & Management tools (AnyDesk, ScreenConnect, TeamViewer) renamed or installed in non-standard paths. Legitimate admin tooling co-opted for persistence and C2.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['rmm', 'remote-access', 'persistence', 'renamed'],
  },
  {
    name: 'Remote Execution Tools',
    priority: 'HIGH',
    techniques: ['T1021.002', 'T1021.003', 'T1021.006'],
    fpLevel: 'Medium FP',
    maturity: 'Hunt',
    description:
      'Lateral movement via SMB/SSH/WinRM execution. PsExec, wmic, ssh.exe, and native cmdlets used for remote command execution across the network.',
    url: 'https://iimp0ster.github.io/detection-chokepoints/',
    tags: ['lateral-movement', 'smb', 'ssh', 'winrm', 'psexec'],
  },
];

const PRIORITY_STYLES: Record<Priority, string> = {
  CRITICAL: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  HIGH: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

const FP_STYLES: Record<FPLevel, string> = {
  'Pre-Exec': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'Low FP': 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'Medium FP': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'High FP': 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const MATURITY_STYLES: Record<Maturity, string> = {
  Research: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  Hunt: 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300',
  Analyst: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
};

export default function DetectionChokepoints(): JSX.Element {
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<Priority | 'all'>('all');
  const [fpFilter, setFpFilter] = useState<FPLevel | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHOKEPOINTS.filter((c) => {
      if (priority !== 'all' && c.priority !== priority) return false;
      if (fpFilter !== 'all' && c.fpLevel !== fpFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.techniques.some((t) => t.toLowerCase().includes(q)) ||
        c.tags.some((t) => t.includes(q))
      );
    });
  }, [query, priority, fpFilter]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Shield size={28} className="text-brand-600 dark:text-brand-400" /> Detection Chokepoints
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          Invariant detection points in attack chains — prerequisites that attackers cannot bypass. Each chokepoint
          targets a forced action that generates reliable telemetry regardless of the specific tool or variant used.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Source:{' '}
          <a
            href={sanitizeUrl('https://github.com/iimp0ster/detection-chokepoints') || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            iimp0ster/detection-chokepoints <ExternalLink size={11} />
          </a>{' '}
          · {CHOKEPOINTS.length} chokepoints mapped to MITRE ATT&CK techniques.
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-6">
        <div className="relative">
          <Target size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chokepoint, technique, or tag…"
            className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] font-mono text-sm focus:border-brand-500/60 focus:outline-none"
            aria-label="Filter chokepoints"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 self-center mr-1">
            Priority
          </span>
          <button
            onClick={() => setPriority('all')}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              priority === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            All
          </button>
          {(['CRITICAL', 'HIGH'] as Priority[]).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                priority === p
                  ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
              }`}
            >
              {p} <span className="opacity-60">· {CHOKEPOINTS.filter((c) => c.priority === p).length}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 self-center mr-1">
            FP Profile
          </span>
          <button
            onClick={() => setFpFilter('all')}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              fpFilter === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            All
          </button>
          {(['Pre-Exec', 'Low FP', 'Medium FP', 'High FP'] as FPLevel[]).map((f) => (
            <button
              key={f}
              onClick={() => setFpFilter(f)}
              className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                fpFilter === f
                  ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
              }`}
            >
              {f} <span className="opacity-60">· {CHOKEPOINTS.filter((c) => c.fpLevel === f).length}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-3">
        Showing {filtered.length} of {CHOKEPOINTS.length}
      </p>

      <div className="space-y-3">
        {filtered.map((c) => (
          <article
            key={c.name}
            className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
          >
            <header className="flex flex-wrap items-center gap-2 mb-2">
              <code className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">{c.name}</code>
              <span
                className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${PRIORITY_STYLES[c.priority]}`}
              >
                {c.priority}
              </span>
              <span
                className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${FP_STYLES[c.fpLevel]}`}
              >
                {c.fpLevel}
              </span>
              <span
                className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${MATURITY_STYLES[c.maturity]}`}
              >
                {c.maturity}
              </span>
              {c.techniques.map((t) => (
                <span
                  key={t}
                  className="text-micro font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                >
                  {t}
                </span>
              ))}
            </header>

            <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-2 leading-relaxed">{c.description}</p>

            <div className="flex flex-wrap gap-1.5 mb-2">
              {c.tags.map((t) => (
                <span
                  key={t}
                  className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400"
                >
                  {t}
                </span>
              ))}
            </div>

            <a
              href={sanitizeUrl(c.url) || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="text-micro font-mono text-slate-400 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-0.5"
            >
              upstream reference <ExternalLink size={10} />
            </a>
          </article>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm font-mono text-slate-500 dark:text-slate-400">
            No chokepoints match those filters.
          </div>
        )}
      </div>

      {/* Badge legend */}
      <section className="mt-8 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
          Badge Legend
        </h2>
        <div className="grid gap-4 sm:grid-cols-3 text-sm font-mono">
          <div>
            <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 block mb-1">
              Maturity Level
            </span>
            <ul className="space-y-1 text-slate-700 dark:text-slate-300">
              <li>
                <span
                  className={`inline-block text-micro uppercase px-1.5 py-0.5 rounded border mr-2 ${MATURITY_STYLES.Research}`}
                >
                  Research
                </span>{' '}
                Active research area
              </li>
              <li>
                <span
                  className={`inline-block text-micro uppercase px-1.5 py-0.5 rounded border mr-2 ${MATURITY_STYLES.Hunt}`}
                >
                  Hunt
                </span>{' '}
                Hunting-ready, some tuning needed
              </li>
              <li>
                <span
                  className={`inline-block text-micro uppercase px-1.5 py-0.5 rounded border mr-2 ${MATURITY_STYLES.Analyst}`}
                >
                  Analyst
                </span>{' '}
                Operational, analyst-ready
              </li>
            </ul>
          </div>
          <div>
            <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 block mb-1">
              FP Profile
            </span>
            <ul className="space-y-1 text-slate-700 dark:text-slate-300">
              <li>
                <span
                  className={`inline-block text-micro uppercase px-1.5 py-0.5 rounded border mr-2 ${FP_STYLES['Pre-Exec']}`}
                >
                  Pre-Exec
                </span>{' '}
                Action occurs before execution — minimal FP
              </li>
              <li>
                <span
                  className={`inline-block text-micro uppercase px-1.5 py-0.5 rounded border mr-2 ${FP_STYLES['Low FP']}`}
                >
                  Low FP
                </span>{' '}
                Low false-positive rate with proper scoping
              </li>
              <li>
                <span
                  className={`inline-block text-micro uppercase px-1.5 py-0.5 rounded border mr-2 ${FP_STYLES['Medium FP']}`}
                >
                  Medium FP
                </span>{' '}
                Requires context to reduce noise
              </li>
              <li>
                <span
                  className={`inline-block text-micro uppercase px-1.5 py-0.5 rounded border mr-2 ${FP_STYLES['High FP']}`}
                >
                  High FP
                </span>{' '}
                Needs tuning or allowlisting
              </li>
            </ul>
          </div>
          <div>
            <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 block mb-1">
              Upstream
            </span>
            <p className="text-slate-700 dark:text-slate-300">
              <a
                href={sanitizeUrl('https://github.com/iimp0ster/detection-chokepoints') || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                iimp0ster/detection-chokepoints <ExternalLink size={11} />
              </a>
            </p>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              MITRE ATT&CK mapping and detection research for forced-prerequisite chokepoints in attacker kill chains.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
