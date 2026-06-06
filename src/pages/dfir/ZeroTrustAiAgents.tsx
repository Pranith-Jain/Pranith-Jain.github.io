import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { BackLink } from '../../components/BackLink';

type Tier = 'foundation' | 'enterprise' | 'advanced';

interface MatrixRow {
  domain: string;
  foundation: string;
  enterprise: string;
  advanced: string;
}

interface Principle {
  title: string;
  body: string;
}

interface Threat {
  num: number;
  title: string;
  body: string;
}

interface WhyNowStat {
  value: string;
  label: string;
}

interface Phase {
  num: number;
  title: string;
  body: string;
}

const PRINCIPLES: Principle[] = [
  {
    title: 'Never trust, always verify',
    body: 'Every request is authenticated & authorized regardless of origin — inside the network gets no free pass.',
  },
  {
    title: 'Assume breach',
    body: 'Design to limit damage, not just prevent intrusion. Segment by identity, contain the blast radius.',
  },
  {
    title: 'Least privilege — least agency',
    body: 'Constrain not just what agents access, but what each tool can do, how often, and where.',
  },
];

const MATRIX: MatrixRow[] = [
  {
    domain: 'Identity & authentication',
    foundation: 'Per-agent cryptographic IDs; short-lived IdP tokens — no static API keys',
    enterprise: 'X.509 certs w/ full lifecycle; mutual TLS + certificate pinning',
    advanced: 'HSM/TPM hardware-backed identity with remote attestation',
  },
  {
    domain: 'Access control & privilege',
    foundation: 'RBAC, deny-by-default; identity-based isolation of workloads',
    enterprise: 'Context-aware ABAC; sandboxed execution per agent',
    advanced: 'Continuous authorization; IIT/IEA; confidential computing',
  },
  {
    domain: 'Observability & auditing',
    foundation: 'Comprehensive action logs; request IDs link actions to triggers',
    enterprise: 'Immutable audit trails; distributed tracing (OpenTelemetry)',
    advanced: 'Real-time SIEM streaming; full input→output provenance chains',
  },
  {
    domain: 'Behavioral monitoring',
    foundation: 'Manual baselines; alerts with model-drafted first-pass triage',
    enterprise: 'Learned baselines; automatic containment & access revocation',
    advanced: 'Continuous drift detection; orchestrated SOAR playbooks',
  },
  {
    domain: 'Input / output controls',
    foundation: 'Input validation & length limits; PII/credential output filtering',
    enterprise: 'Attack-pattern content filtering; semantic output analysis',
    advanced: 'Constitutional classifiers + spotlighting; human approval for high-risk actions',
  },
  {
    domain: 'Integrity & recovery',
    foundation: 'Version-controlled configs; documented, tested rollback',
    enterprise: 'Signed configurations; automated rollback with health checks',
    advanced: 'Immutable infrastructure; self-healing auto-remediation',
  },
  {
    domain: 'AI governance',
    foundation: 'Documented acceptable-use & IR policies; address shadow AI',
    enterprise: 'Formal framework with cross-functional stakeholder oversight',
    advanced: 'Automated compliance checks enforced in deployment pipelines',
  },
];

const THREATS: Threat[] = [
  {
    num: 1,
    title: 'Prompt injection',
    body: 'Direct & indirect — LLMs cannot reliably separate informational context from actionable instructions.',
  },
  {
    num: 2,
    title: 'Tool & resource misuse',
    body: 'MCP tool poisoning, rug-pull tool swaps, tool-chaining exfiltration, resource exhaustion.',
  },
  {
    num: 3,
    title: 'Identity & privilege abuse',
    body: 'Unscoped privilege inheritance, confused-deputy relays, memory-based privilege retention.',
  },
  {
    num: 4,
    title: 'Supply chain risk',
    body: 'Poisoned model weights, malicious MCP servers, dependency confusion attacks.',
  },
  {
    num: 5,
    title: 'Memory & context poisoning',
    body: 'RAG / vector-DB poisoning, shared-context attacks, gradual long-term memory drift.',
  },
];

const WHY_NOW: WhyNowStat[] = [
  { value: 'months → hours', label: 'AI compresses vuln-to-exploit timelines, at marginal cost in dollars' },
  { value: '250 docs', label: 'enough to backdoor LLMs (600k–138 params, surviving safety training)' },
  { value: '50% → <2%', label: 'indirect injection success cut by spotlighting untrusted content' },
  { value: '95%', label: 'of jailbreak attempts blocked by constitutional classifiers' },
];

const PHASES: Phase[] = [
  { num: 1, title: 'Identify requirements', body: 'regulatory, operational, stakeholder alignment' },
  { num: 2, title: 'Secure supply chain', body: 'AI-BOM, scorecards, AI vendoring, signing' },
  { num: 3, title: 'Define agent boundaries', body: 'simple IDs, least agency, blast radius' },
  { num: 4, title: 'Defend prompt injection', body: 'secure inputs, classifiers, limit surfaces' },
  { num: 5, title: 'Secure tool access', body: 'allow-lists, param validation, sandboxes' },
  { num: 6, title: 'Protect credentials', body: 'short-lived, hardware-bound, JIT, per-agent' },
  { num: 7, title: 'Safeguard memory', body: 'isolation, integrity checks at retrieval, TITs' },
  { num: 8, title: 'Measure what matters', body: 'dwell time, coverage, explainability' },
];

const TIER_LABEL: Record<Tier, { label: string; tag: string; bar: string; head: string; chip: string }> = {
  foundation: {
    label: 'FOUNDATION',
    tag: 'minimum viable — the floor has been raised',
    bar: 'bg-amber-500',
    head: 'text-amber-300',
    chip: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  },
  enterprise: {
    label: 'ENTERPRISE',
    tag: 'target maturity for most organizations',
    bar: 'bg-emerald-500',
    head: 'text-emerald-300',
    chip: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  },
  advanced: {
    label: 'ADVANCED',
    tag: 'regulated / high-consequence environments',
    bar: 'bg-yellow-400',
    head: 'text-yellow-300',
    chip: 'bg-yellow-500/15 text-yellow-300 ring-yellow-500/30',
  },
};

export default function ZeroTrustAiAgents(): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <BackLink
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-brand-400 mb-6 font-mono"
        >
          <ArrowLeft size={14} /> back
        </BackLink>

        {/* ─── Header ──────────────────────────────────────────────── */}
        <header className="relative mb-8 sm:mb-10">
          <div className="flex items-center gap-2 text-eyebrow font-mono uppercase tracking-[0.2em] text-brand-400 mb-4">
            <ShieldCheck size={14} /> security framework · reference card
          </div>
          <div className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold tracking-tight text-white leading-[1.05]">
                ZERO TRUST FOR AI AGENTS
              </h1>
              <p className="mt-3 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
                A security framework for deploying autonomous AI agents in the enterprise
              </p>
            </div>
            <aside className="lg:text-right lg:max-w-md">
              <p className="font-display italic text-base sm:text-lg text-teal-300 leading-snug">
                “Trust nothing. Verify everything. Assume breach.”
              </p>
              <p className="mt-2 text-meta font-mono text-slate-500 uppercase tracking-wider">
                Source: Anthropic, Zero Trust for AI Agents eBook (2026)
              </p>
            </aside>
          </div>
        </header>

        {/* ─── Three-column body ───────────────────────────────────── */}
        <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)_minmax(0,1fr)]">
          {/* Left column: Principles + Design Test + Why Now */}
          <aside className="space-y-4">
            <SectionHeader label="PRINCIPLES" tone="teal" />

            <div className="space-y-3">
              {PRINCIPLES.map((p) => (
                <article
                  key={p.title}
                  className="relative pl-3 pr-3 py-3 rounded-md bg-slate-900/60 ring-1 ring-slate-800 border-l-2 border-teal-400"
                >
                  <h3 className="font-display font-semibold text-slate-100 text-sm leading-snug">{p.title}</h3>
                  <p className="mt-1 text-meta font-mono text-slate-400 leading-relaxed">{p.body}</p>
                </article>
              ))}
            </div>

            {/* Design test card */}
            <article className="rounded-md bg-slate-900/60 ring-1 ring-orange-500/40 border-l-2 border-orange-400 p-3">
              <h3 className="font-display font-bold text-orange-300 text-sm leading-snug">
                THE DESIGN TEST: “Impossible, not tedious”
              </h3>
              <p className="mt-1.5 text-meta font-mono text-slate-300 leading-relaxed">
                Agentic attackers have unlimited patience and near-zero per-attempt cost, so friction-only controls
                (rate limits, SMS MFA) fail. Prefer controls that remove a capability over ones that throttle it.
              </p>
            </article>

            {/* Why now */}
            <section className="pt-2">
              <h2 className="font-display font-bold text-sm text-brand-300 mb-2.5">WHY NOW</h2>
              <dl className="space-y-2.5">
                {WHY_NOW.map((s) => (
                  <div key={s.label} className="flex items-baseline gap-3">
                    <dt className="shrink-0 w-24 sm:w-28 font-display font-bold text-brand-300 text-sm whitespace-nowrap">
                      {s.value}
                    </dt>
                    <dd className="text-[11px] font-mono text-slate-400 leading-snug">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </aside>

          {/* Middle column: Capability matrix */}
          <section className="min-w-0">
            <SectionHeader label="CAPABILITY MATRIX — 3 TIERS × 7 DOMAINS" tone="neutral" />

            <div className="rounded-lg ring-1 ring-slate-800 bg-slate-900/40 overflow-hidden">
              {/* Tier header row */}
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] bg-slate-900/80">
                <div className="px-3 py-2.5 text-eyebrow font-mono uppercase tracking-[0.18em] text-slate-400 border-b border-slate-800 border-r">
                  DOMAIN
                </div>
                {(['foundation', 'enterprise', 'advanced'] as Tier[]).map((t) => {
                  const cfg = TIER_LABEL[t];
                  return (
                    <div key={t} className="px-3 py-2.5 border-b border-slate-800 border-r last:border-r-0">
                      <div className={`text-eyebrow font-mono uppercase tracking-[0.18em] ${cfg.head}`}>
                        {cfg.label}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5 leading-snug">{cfg.tag}</div>
                    </div>
                  );
                })}
              </div>

              {/* Body rows */}
              <div>
                {MATRIX.map((row, i) => (
                  <div
                    key={row.domain}
                    className={`grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] ${
                      i % 2 === 0 ? 'bg-slate-900/30' : 'bg-slate-900/10'
                    } border-b border-slate-800/60 last:border-b-0`}
                  >
                    <div className="px-3 py-2.5 border-r border-slate-800/60">
                      <div className="font-display font-semibold text-slate-100 text-sm leading-snug">{row.domain}</div>
                    </div>
                    {(['foundation', 'enterprise', 'advanced'] as Tier[]).map((t) => {
                      const cfg = TIER_LABEL[t];
                      return (
                        <div key={t} className="px-3 py-2.5 border-r border-slate-800/60 last:border-r-0 relative">
                          <span
                            aria-hidden="true"
                            className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r ${cfg.bar} opacity-70`}
                          />
                          <div className="text-[12.5px] font-mono text-slate-300 leading-snug pl-1.5">{row[t]}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-3 text-meta font-mono text-slate-500 leading-relaxed">
              Each tier builds on the last.{' '}
              <span className="text-slate-300 font-semibold">Skip one capability and attackers exploit the gap.</span>
            </p>
          </section>

          {/* Right column: Threats */}
          <aside className="space-y-4">
            <SectionHeader label="THREATS (OWASP)" tone="red" />

            <div className="space-y-3">
              {THREATS.map((t) => (
                <article
                  key={t.num}
                  className="relative pl-3 pr-3 py-2.5 rounded-md bg-slate-900/60 ring-1 ring-slate-800 border-l-2 border-rose-500"
                >
                  <h3 className="font-display font-semibold text-slate-100 text-sm leading-snug">
                    <span className="text-rose-400 font-mono mr-1.5">{t.num}.</span>
                    {t.title}
                  </h3>
                  <p className="mt-1 text-meta font-mono text-slate-400 leading-relaxed">{t.body}</p>
                </article>
              ))}
            </div>

            <article className="rounded-md bg-teal-500/10 ring-1 ring-teal-400/40 p-3">
              <p className="text-[12.5px] font-mono text-teal-200 leading-relaxed">
                <span className="font-semibold text-teal-300">The floor keeps rising:</span> expect today’s Advanced to
                become tomorrow’s Enterprise — and Enterprise to become Foundation.
              </p>
            </article>
          </aside>
        </div>

        {/* ─── Implementation workflow ─────────────────────────────── */}
        <section className="mt-10 sm:mt-12">
          <SectionHeader label="IMPLEMENTATION WORKFLOW — 8 PHASES" tone="green" />

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {PHASES.map((p) => (
              <article
                key={p.num}
                className="relative rounded-md bg-slate-900/60 ring-1 ring-emerald-500/30 p-2.5 border-t-2 border-emerald-400"
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-emerald-300 text-meta font-bold">{p.num}.</span>
                  <h3 className="font-display font-semibold text-slate-100 text-[12.5px] leading-snug">{p.title}</h3>
                </div>
                <p className="mt-1 text-[11px] font-mono text-slate-400 leading-snug">{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-10 pt-6 border-t border-slate-800/60 text-meta font-mono text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>Reference card · derived from public security guidance</span>
          <span className="uppercase tracking-wider">v1 · 2026</span>
        </footer>
      </div>
    </div>
  );
}

function SectionHeader({ label, tone }: { label: string; tone: 'teal' | 'red' | 'green' | 'neutral' }): JSX.Element {
  const colorMap: Record<typeof tone, string> = {
    teal: 'text-teal-300',
    red: 'text-rose-300',
    green: 'text-emerald-300',
    neutral: 'text-slate-200',
  };
  return (
    <div className="flex items-center gap-2">
      <span className={`font-display font-bold text-eyebrow tracking-[0.18em] uppercase ${colorMap[tone]}`}>
        {label}
      </span>
      <span className="flex-1 h-px bg-slate-800" />
    </div>
  );
}
