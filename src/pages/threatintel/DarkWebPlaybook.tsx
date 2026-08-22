import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  Skull,
  Sparkles,
  Search,
  Filter,
  Layers,
  ScanSearch,
  FileText,
  ShieldAlert,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Timer,
  UserX,
  Ban,
  MonitorSmartphone,
  Trash2,
  Fingerprint,
  Youtube,
  Github,
} from 'lucide-react';

interface Stage {
  n: number;
  icon: typeof Sparkles;
  title: string;
  desc: string;
  detail: string;
}

const PIPELINE: Stage[] = [
  {
    n: 1,
    icon: Sparkles,
    title: 'Query Refinement',
    desc: 'AI expands your query for semantic matching.',
    detail:
      '"ransomware" → "ransomware forums threat actors tools techniques latest vulnerabilities exploitation". Matches meaning, not just keywords.',
  },
  {
    n: 2,
    icon: Search,
    title: 'Multi-Engine Search',
    desc: '15 dark-web search engines, simultaneously.',
    detail:
      'Aggregates hundreds of results in one pass — a single query can surface 900+ hits across every indexed engine.',
  },
  {
    n: 3,
    icon: Filter,
    title: 'Semantic Filtering',
    desc: 'AI cuts 900 results → ~20 relevant sources.',
    detail:
      'Drops irrelevant results, low-quality sources, duplicate content, and likely scam / honeypot sites before you ever see them.',
  },
  {
    n: 4,
    icon: Layers,
    title: 'Multi-Threaded Scraping',
    desc: 'Parallel content extraction over Tor.',
    detail:
      'Scrapes all filtered sites at once to beat slow circuits. Some sites fail (broken circuits, sites down) — normal on Tor.',
  },
  {
    n: 5,
    icon: ScanSearch,
    title: 'Content Analysis',
    desc: 'Key findings, IOCs, TTPs, next steps.',
    detail:
      'Surfaces referenced .onion links, threat-actor handles, crypto addresses, malware families, and recommended follow-up queries.',
  },
  {
    n: 6,
    icon: FileText,
    title: 'Report Generation',
    desc: 'Markdown export for Obsidian / Notion.',
    detail: 'A downloadable report with the query, summary, all referenced links, categorized findings, and metadata.',
  },
];

const REALITIES = [
  {
    stat: '90%',
    label: 'is fake',
    desc: 'Law-enforcement honeypots and outright scams dominate the surface of the dark web.',
  },
  {
    stat: '~2 days',
    label: 'per week',
    desc: 'Many real sites operate only a couple of days a week, at unpredictable times.',
  },
  {
    stat: '6–8 hrs → 30 min',
    label: 'with AI',
    desc: 'Manual searching vs an AI pipeline that filters hundreds of results automatically.',
  },
  {
    stat: 'Months',
    label: 'to build trust',
    desc: 'Genuine access to private forums requires a consistent persona and patience.',
  },
];

const OPSEC = [
  {
    icon: ShieldAlert,
    title: 'VPN before Tor',
    desc: 'Connect to a VPN first, then Tor — never the reverse, never Tor alone.',
  },
  {
    icon: UserX,
    title: 'No real identity',
    desc: 'No real names, emails, or accounts. One slip can blow an investigation.',
  },
  {
    icon: Ban,
    title: "Don't download files",
    desc: 'Treat every file as hostile — downloads are the primary malware vector.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Dedicated machine',
    desc: 'Ideally a separate device or VM used only for dark-web research.',
  },
  {
    icon: Trash2,
    title: 'Clear browser data',
    desc: 'Regularly clear cookies and cache; leave no residual session state.',
  },
  {
    icon: Fingerprint,
    title: 'Consistent persona',
    desc: 'A sock-puppet identity must stay consistent — reuse breaks cover.',
  },
];

const WORKFLOW = [
  'Start broad, then narrow — landscape first, then specific forums, then deep dives.',
  'Identify the real communities — filter for the forums that actually have activity.',
  'Monitor over time — real investigations take days, weeks, or months, not hours.',
  'Build a sock-puppet identity — a consistent, reusable fake persona.',
  'Engage gradually — trust is earned slowly; never rush an introduction.',
  'Document everything — keep detailed markdown notes as you go.',
  'Verify across sources — never trust a single result; look for corroboration.',
];

const VIDEO_URL = 'https://www.youtube.com/watch?v=_KzObeom88Y';
const REPO_URL = 'https://github.com/theNetworkChuck/dark-web-scraping-guide';

export default function DarkWebPlaybook(): JSX.Element {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Skull size={28} />}
      title="Dark Web Research Playbook"
      maxWidthClass="max-w-5xl"
      description={
        <>
          <span className="block max-w-3xl">
            How professional threat researchers find <em>real</em> content on the dark web — the AI-assisted pipeline
            behind the Robin tool, the operational realities of Tor, and the OPSEC discipline that keeps an
            investigation (and an investigator) safe.
          </span>
          <span className="block text-xs text-muted font-mono mt-2">
            Methodology from NetworkChuck Episode 480 · Robin dark-web research tool · educational & defensive use only.
          </span>
        </>
      }
    >
      {/* Safety gate */}
      <section className="surface-card p-5 mb-8 border-rose-500/30 bg-rose-500/[0.04]">
        <div className="flex items-start gap-3">
          <ShieldAlert size={20} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <h2 className="font-display font-semibold text-heading mb-1">Educational & security research only</h2>
            <p className="text-sm text-body leading-relaxed">
              Accessing illegal content on the dark web carries serious legal consequences. This playbook is for threat
              intelligence, defensive security, and finding <strong>your own</strong> leaked data — not marketplaces,
              illegal content, or evading law enforcement.
            </p>
            <button
              type="button"
              onClick={() => setAcknowledged((v) => !v)}
              className={`mt-3 inline-flex items-center gap-2 text-xs font-mono px-3 py-2 rounded-lg border transition-colors ${
                acknowledged
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:border-rose-500/60'
              }`}
            >
              {acknowledged ? (
                <CheckCircle2 size={13} aria-hidden="true" />
              ) : (
                <AlertTriangle size={13} aria-hidden="true" />
              )}
              {acknowledged ? 'Understood — proceeding defensively' : 'I understand — this is for defensive research'}
            </button>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section className="mb-12">
        <SectionHeader
          eyebrow="The pipeline"
          title="Six stages from query to report"
          sub="Robin runs every search through the same AI-assisted pipeline, collapsing 6–8 hours of manual hunting into roughly half an hour."
        />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE.map((s) => (
            <li
              key={s.n}
              className="group relative surface-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-e2"
            >
              <div className="flex items-center gap-2.5 mb-2.5">
                <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 font-mono text-sm font-bold">
                  {s.n}
                </span>
                <s.icon size={17} className="text-slate-400 dark:text-slate-500" aria-hidden="true" />
              </div>
              <h3 className="font-display font-semibold text-heading mb-1">{s.title}</h3>
              <p className="text-sm text-body mb-2">{s.desc}</p>
              <p className="text-xs text-muted leading-relaxed">{s.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Realities */}
      <section className="mb-12">
        <SectionHeader
          eyebrow="Ground truth"
          title="The dark web is mostly noise"
          sub="The whole reason an AI pipeline is needed: the surface of the dark web is dominated by honeypots and scams, and the real content is sparse and unstable."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REALITIES.map((r) => (
            <div key={r.label} className="surface-card p-4 text-center">
              <div className="font-display font-bold text-2xl text-brand-600 dark:text-brand-400 tracking-tight">
                {r.stat}
              </div>
              <div className="text-mini font-mono uppercase tracking-wider text-muted mt-0.5 mb-2">{r.label}</div>
              <p className="text-xs text-muted leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* OPSEC */}
      <section className="mb-12">
        <SectionHeader
          eyebrow="OPSEC protocol"
          title="Non-negotiable safety rules"
          sub="The discipline that separates a researcher from a victim. Every one of these exists because someone learned it the hard way."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OPSEC.map((o) => (
            <div key={o.title} className="surface-card p-4 flex items-start gap-3">
              <span className="grid place-items-center h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <o.icon size={17} aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-display font-semibold text-sm text-heading mb-0.5">{o.title}</h3>
                <p className="text-xs text-muted leading-relaxed">{o.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section className="mb-12">
        <SectionHeader
          eyebrow="Field workflow"
          title="The investigator's loop"
          sub="How a professional moves from a broad query to trusted, documented intelligence — patiently."
        />
        <ol className="surface-card p-5 space-y-3">
          {WORKFLOW.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="grid place-items-center h-6 w-6 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 font-mono text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-body leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Continue */}
      <section className="surface-card p-5">
        <h2 className="font-display font-semibold text-heading mb-1">Put it into practice</h2>
        <p className="text-sm text-muted mb-4">
          The platform's own dark-web tooling covers the search and recon stages of this playbook.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/threatintel/darkweb/watch"
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg border border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:border-brand-500/70 transition-colors"
          >
            Dark-web tools directory <ArrowRight size={13} aria-hidden="true" />
          </Link>
          <Link
            to="/threatintel/darkweb/recon"
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] text-body hover:border-brand-500/40 transition-colors"
          >
            Dark Web Recon <ArrowRight size={13} aria-hidden="true" />
          </Link>
          <a
            href={VIDEO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] text-body hover:border-rose-500/40 transition-colors"
          >
            <Youtube size={13} aria-hidden="true" /> NetworkChuck Ep. 480 <ExternalLink size={11} aria-hidden="true" />
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] text-body hover:border-slate-500/50 transition-colors"
          >
            <Github size={13} aria-hidden="true" /> Source guide <ExternalLink size={11} aria-hidden="true" />
          </a>
        </div>
        <p className="mt-4 flex items-center gap-1.5 text-mini font-mono text-slate-400 dark:text-slate-500">
          <Timer size={11} aria-hidden="true" />
          Real investigations take days to months · verify every finding against multiple sources
        </p>
      </section>
    </DataPageLayout>
  );
}

function SectionHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }): JSX.Element {
  return (
    <div className="mb-5">
      <div className="text-eyebrow font-mono uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-1.5">
        {eyebrow}
      </div>
      <h2 className="font-display font-bold text-xl sm:text-2xl text-heading tracking-tight mb-1.5">{title}</h2>
      <p className="text-sm text-muted max-w-2xl leading-relaxed">{sub}</p>
    </div>
  );
}
