import { DataPageLayout } from '../../components/DataPageLayout';
import { ExternalLink, Fingerprint, AlertTriangle, Search } from 'lucide-react';

interface Finding {
  id: string;
  title: string;
  description: string;
  delivery: string;
  detectionSignals: string[];
  color: string;
  border: string;
  bg: string;
}

const FINDINGS: Finding[] = [
  {
    id: 'favicon-pivot',
    title: 'Favicon-Pivot Discovery',
    description:
      'Threat actors embedding unique favicon hashes across multiple infrastructure nodes to establish shared identity. Pivoting on favicon SHA256 reveals entire clusters of impersonation domains — a single hash surfaces dozens of related sites that would otherwise appear unrelated.',
    delivery: 'Infrastructure fingerprinting',
    detectionSignals: [
      'Favicon SHA256 hash clustering',
      'Shared resource identity across domains',
      'Passive DNS correlation via static assets',
    ],
    color: 'text-brand-700 dark:text-brand-300',
    border: 'border-brand-500/40',
    bg: 'bg-brand-500/10',
  },
  {
    id: 'js-gated-exe',
    title: 'JS-Gated EXE Delivery (MROScanner OU Cert)',
    description:
      'Malware delivery gated behind JavaScript execution checks — the browser must execute JS before the payload drops. Uses MROScanner organizational unit certificate for code signing legitimacy. Targets users who paste copied content or follow installation instructions.',
    delivery: 'Browser-gated payload',
    detectionSignals: [
      'MROScanner OU code signing certificate',
      'JavaScript execution gate before download',
      'Clipboard-intercept delivery mechanism',
      'Organizational cert abuse for trust',
    ],
    color: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/10',
  },
  {
    id: 'clickfix-ai-tools',
    title: 'ClickFix Install Modals — AI Dev Tools',
    description:
      'ClickFix social engineering campaigns impersonating Claude Code CLI and LM Studio installers. Fake install modals prompt users to paste terminal commands that execute malicious cradles. Targets AI developer community specifically — a high-value, fast-growing audience with elevated trust in CLI-based tooling.',
    delivery: 'Social engineering modals',
    detectionSignals: [
      'Claude Code CLI impersonation pages',
      'LM Studio fake installer prompts',
      'Terminal command paste injection',
      'AI developer tool targeting',
    ],
    color: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
  },
  {
    id: 'domain-squatting',
    title: 'Post-Launch Domain Squatting',
    description:
      'Registering lookalike domains immediately after product launches, security advisories, or viral announcements. Squatting domains timed to capture search traffic and social media referrals during peak interest windows — then redirecting to malware payloads.',
    delivery: 'Typosquatting / brand impersonation',
    detectionSignals: [
      'Brand-adjacent domain registration spikes',
      'Post-announcement registration timing',
      'SSL certificate mismatch patterns',
      'Redirect chain analysis',
    ],
    color: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
  },
  {
    id: 'favicon-infrastructure',
    title: 'Software Impersonation Infrastructure',
    description:
      'Complete infrastructure setups impersonating legitimate software products — cloned landing pages, matching CDN patterns, and domain-adjacent registrations. The infrastructure is purpose-built to capture users searching for legitimate tools and redirect them to malicious payloads.',
    delivery: 'Cloned landing pages + CDN abuse',
    detectionSignals: [
      'Landing page fingerprint matching',
      'CDN origin correlation',
      'SSL cert transparency log anomalies',
      'WHOIS pattern analysis across brands',
    ],
    color: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
  },
];

const STATS = [
  { label: 'Validated Hunts', value: '5' },
  { label: 'Brands Impersonated', value: '5' },
  { label: 'Confirmed Deliveries', value: '2' },
  { label: 'Pipeline Records', value: '1,569' },
  { label: 'Date Range', value: '2026-02-15 → 2026-05-17' },
];

export default function TrendMasqInfra(): JSX.Element {
  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Fingerprint size={28} />}
      title="Trend: Software Impersonation Infrastructure"
      description="Analysis of threat actor infrastructure built to impersonate legitimate software products — cloned landing pages, ClickFix delivery chains targeting AI developers, and post-launch domain squatting campaigns."
      headerExtra={
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          5 validated hunts · 1,569 pipeline records · 5 brands tracked
        </p>
      }
      maxWidthClass="max-w-6xl"
    >
      <section className="mb-8">
        <div className="grid gap-3 sm:grid-cols-5">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4"
            >
              <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 block mb-1">
                {s.label}
              </span>
              <span className="font-mono font-bold text-lg text-slate-900 dark:text-slate-100">{s.value}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
          Validated Findings
        </h2>

        <div className="space-y-3">
          {FINDINGS.map((f) => (
            <article key={f.id} className={`rounded-lg border ${f.border} ${f.bg} shadow-e1 p-4`}>
              <header className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">{f.title}</h3>
                <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400">
                  {f.delivery}
                </span>
              </header>

              <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-3 leading-relaxed">
                {f.description}
              </p>

              <div className="flex flex-wrap gap-1.5">
                <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 self-center mr-1">
                  Detection
                </span>
                {f.detectionSignals.map((s) => (
                  <span
                    key={s}
                    className="text-micro font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </DataPageLayout>
  );
}
