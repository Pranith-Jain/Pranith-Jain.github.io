import { useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ExternalLink, TrendingUp, Search } from 'lucide-react';

interface Variant {
  name: string;
  mitre: string;
  stage: string;
  detectionSignals: string[];
  color: string;
  border: string;
  bg: string;
}

const VARIANTS: Variant[] = [
  {
    name: 'ClickFix',
    mitre: 'T1204.002',
    stage: 'Delivery',
    detectionSignals: [
      'Fake browser dialog prompts',
      'JavaScript clipboard injection',
      'PowerShell/cmd execution from pasted content',
    ],
    color: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/10',
  },
  {
    name: 'FileFix',
    mitre: 'T1204.002',
    stage: 'Delivery',
    detectionSignals: [
      'Malicious file opens triggering hidden commands',
      'LNK/ISO/HTA abuse',
      'Social engineering around file preview',
    ],
    color: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
  },
  {
    name: 'TerminalFix',
    mitre: 'T1059.001',
    stage: 'Execution',
    detectionSignals: [
      'Clipboard paste into terminal executes encoded payload',
      'Base64 encoded cradle chain',
      'Self-deleting script artifacts',
    ],
    color: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
  },
  {
    name: 'DownloadFix',
    mitre: 'T1105',
    stage: 'C2',
    detectionSignals: [
      'CDN-staged payloads',
      'URL shortener redirects',
      'Cloudflare Workers as staging infrastructure',
    ],
    color: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/40',
    bg: 'bg-sky-500/10',
  },
  {
    name: 'JackFix / GlitchFix / ConsentFix',
    mitre: 'T1204.002',
    stage: 'Delivery',
    detectionSignals: [
      'Browser consent prompt abuse',
      'Fake permission dialogs',
      'OAuth token theft via fake authorization screens',
    ],
    color: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
  },
  {
    name: 'WebDAV ClickFix',
    mitre: 'T1204.002',
    stage: 'Delivery',
    detectionSignals: [
      'WebDAV protocol abuse for file delivery',
      'UNC path execution via Explorer',
      'NTLM relay via WebDAV prompts',
    ],
    color: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-500/40',
    bg: 'bg-orange-500/10',
  },
  {
    name: 'InstallFix',
    mitre: 'T1204.002',
    stage: 'Delivery',
    detectionSignals: [
      'Fake installer prompts',
      'Bundled malware in legitimate-looking packages',
      'AI dev tool impersonation (Claude Code CLI, LM Studio)',
    ],
    color: 'text-brand-700 dark:text-brand-300',
    border: 'border-brand-500/40',
    bg: 'bg-brand-500/10',
  },
  {
    name: 'Windows Terminal ClickFix',
    mitre: 'T1059.001',
    stage: 'Execution',
    detectionSignals: [
      'Windows Terminal profile abuse',
      'Command profile injection',
      'Encoded PowerShell via terminal bootstrap',
    ],
    color: 'text-teal-700 dark:text-teal-300',
    border: 'border-teal-500/40',
    bg: 'bg-teal-500/10',
  },
  {
    name: 'DNS-based ClickFix',
    mitre: 'T1071.004',
    stage: 'C2',
    detectionSignals: ['DNS-over-HTTPS C2 channels', 'TXT record payload encoding', 'Subdomain-based exfiltration'],
    color: 'text-indigo-700 dark:text-indigo-300',
    border: 'border-indigo-500/40',
    bg: 'bg-indigo-500/10',
  },
];

interface Finding {
  label: string;
  detail: string;
}

const KEY_FINDINGS: Finding[] = [
  {
    label: 'Cradle Family Evolution',
    detail:
      'IWR → Curl pivot — attackers switching from Invoke-WebRequest to curl for better evasion and cross-platform coverage.',
  },
  {
    label: 'Evasion Acceleration',
    detail: 'Base64 encoding seen 18× increase — layered encoding to bypass static analysis and content filtering.',
  },
  {
    label: 'Self-Delete Emergence',
    detail: 'Post-execution artifact cleanup becoming standard — scripts remove themselves after payload delivery.',
  },
  {
    label: 'CDN Staging',
    detail:
      'Cloudflare Workers, Azure CDN, and other legitimate infrastructure used as payload staging — blends with normal traffic.',
  },
];

const STATS = [
  { label: 'Sites Crawled', value: '25,607' },
  { label: 'Malicious Sites', value: '22,214' },
  { label: 'Daily Reports', value: '534' },
  { label: 'Date Range', value: '2025-04-17 → 2026-06-29' },
];

export default function TrendClickFix(): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = VARIANTS.filter((v) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      v.name.toLowerCase().includes(q) ||
      v.mitre.toLowerCase().includes(q) ||
      v.stage.toLowerCase().includes(q) ||
      v.detectionSignals.some((s) => s.toLowerCase().includes(q))
    );
  });

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<TrendingUp size={28} />}
      title="Trend: ClickFix Delivery Chain"
      description="ClickFix trend analysis — 9 variants tracked across 25,607 crawled sites. Social engineering delivery chains exploiting user interaction patterns with clipboard and terminal mechanics."
      headerExtra={
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Source:{' '}
          <a
            href="https://github.com/MHaggis/ClickGrab"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            MHaggis/ClickGrab <ExternalLink size={11} />
          </a>
        </p>
      }
      maxWidthClass="max-w-6xl"
    >
      <section className="mb-8">
        <div className="grid gap-3 sm:grid-cols-4">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
            >
              <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 block mb-1">
                {s.label}
              </span>
              <span className="font-mono font-bold text-lg text-slate-900 dark:text-slate-100">{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
          Key Findings
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {KEY_FINDINGS.map((f) => (
            <div
              key={f.label}
              className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
            >
              <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-sm mb-1">{f.label}</h3>
              <p className="text-sm font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
          ClickFix Variants
        </h2>

        <div className="mb-4 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search variants, techniques, or detection signals…"
            className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] font-mono text-sm focus:border-brand-500/60 focus:outline-none"
            aria-label="Filter variants"
          />
        </div>

        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-3">
          Showing {filtered.length} of {VARIANTS.length}
        </p>

        <div className="space-y-3">
          {filtered.map((v) => (
            <article key={v.name} className={`rounded-xl border ${v.border} ${v.bg} shadow-e1 p-4`}>
              <header className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">{v.name}</h3>
                <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300">
                  {v.mitre}
                </span>
                <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400">
                  {v.stage}
                </span>
              </header>
              <div className="flex flex-wrap gap-1.5">
                {v.detectionSignals.map((s) => (
                  <span
                    key={s}
                    className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </article>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm font-mono text-slate-500 dark:text-slate-400">
              No variants match that search.
            </div>
          )}
        </div>
      </section>
    </DataPageLayout>
  );
}
