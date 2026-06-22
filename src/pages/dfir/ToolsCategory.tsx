import { Link, useParams, Navigate } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ArrowRight, ShieldCheck, Cpu, Search, ExternalLink } from 'lucide-react';
import { SECTIONS } from '../../components/dfir/ToolGrid';
import { GROUP_META, type ToolGroup } from '../../components/dfir/tool-sections';
import { personalInfo } from '../../data/content';
import { AppHero } from '../../components/AppHero';

const VALID: ToolGroup[] = ['core-dfir', 'investigation', 'intelligence', 'recon', 'specialized', 'grc', 'aisec'];

const HERO: Record<ToolGroup, { kicker: string; title: string; sub: string }> = {
  'core-dfir': {
    kicker: 'Privacy-first · No upload · No login · Local analysis only',
    title: 'Core DFIR — Triage & Analysis',
    sub: 'IOC checks, malware triage, file analysis, artifact parsers. Everything runs in your browser — no data leaves your device.',
  },
  investigation: {
    kicker: 'Privacy-first · No upload · No login · Local analysis only',
    title: 'Investigation — Infrastructure & Identity',
    sub: 'Domain/network lookups, asset analysis, email security, vulnerability checks. Client-side, instant results.',
  },
  intelligence: {
    kicker: 'Privacy-first · No upload · No login · Local analysis only',
    title: 'Intelligence — Detection & Standards',
    sub: 'Rule converters, STIX/TAXII tools, IR playbooks, hunting frameworks. Author and test without uploading.',
  },
  recon: {
    kicker: 'Privacy-first · No upload · No login · Local analysis only',
    title: 'Recon & OSINT — Identity, Network, Dark Web',
    sub: 'Username pivots, network intel, image analysis, dark web tools, privacy checks. Collected client-side.',
  },
  specialized: {
    kicker: 'Advanced · Cloud · API · AI · GRC · Platform',
    title: 'Specialized Tools',
    sub: 'AI security, cloud posture, API audit, data security, GRC, case management, deception, and platform features.',
  },
  grc: {
    kicker: 'Compliance · Maturity · Tabletop · Frameworks',
    title: 'GRC & Posture Tools',
    sub: 'Compliance assessments, maturity scoring, tabletop exercises, kill chain mapping, and OWASP analysis.',
  },
  aisec: {
    kicker: 'LLM · Prompt Injection · MCP · Agent · ATLAS',
    title: 'AI Security Tools',
    sub: 'LLM red-teaming, prompt injection testing, MCP audit, AI agent attack surface mapping, and MITRE ATLAS.',
  },
};

const AUDIENCE = [
  { who: 'SOC Analysts', what: 'Triage alerts, extract IOCs and decode timestamps during incident response.' },
  {
    who: 'Incident Responders',
    what: 'Parse email headers, validate hashes and convert forensic timestamps on the fly.',
  },
  {
    who: 'Security Researchers',
    what: 'A fast workbench for parsing threat data without sending anything to external services.',
  },
];

export default function ToolsCategory(): JSX.Element {
  const { group } = useParams<{ group: string }>();
  if (!group || !VALID.includes(group as ToolGroup)) return <Navigate to="/dfir" replace />;
  const g = group as ToolGroup;
  const meta = GROUP_META[g];
  const hero = HERO[g];
  const sections = SECTIONS.filter((s) => s.group === g);
  const total = sections.reduce((n, s) => n + s.tools.length, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        <ArrowLeft size={14} /> all tools
      </BackLink>

      <AppHero
        kicker={hero.kicker}
        title={hero.title}
        sub={hero.sub}
        meta={
          <>
            {total} tools · {meta.label} · by{' '}
            <Link to="/" className="text-brand-600 dark:text-brand-400 hover:underline">
              {personalInfo.name}
            </Link>
          </>
        }
      />

      {/* Sibling category nav */}
      <div className="flex flex-wrap items-center gap-2 mb-8 text-mini font-mono">
        <span className="text-slate-500">categories:</span>
        {VALID.map((v) => (
          <Link
            key={v}
            to={`/dfir/tools/${v}`}
            className={`px-3 py-1.5 rounded border ${
              v === g
                ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-brand-500/40'
            }`}
          >
            {GROUP_META[v].label}
          </Link>
        ))}
      </div>

      <div className="mb-6">
        <h2 className="font-display font-bold text-2xl">Available Tools</h2>
        <p className="text-sm font-mono text-muted mt-1">
          Each tool runs 100% in your browser — your data never leaves your device.
        </p>
      </div>

      {sections.map((s) => (
        <section key={s.id} className="mb-10">
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">
              {s.label}
            </h3>
            <span className="text-mini font-mono text-slate-400">{s.blurb}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.tools.map((t) => {
              const Icon = t.icon;
              const card = (
                <div className="group h-full flex flex-col rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5 hover:border-brand-500/40 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={18} className="text-brand-600 dark:text-brand-400" />
                    <span className="font-display font-semibold group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {t.label}
                    </span>
                  </div>
                  <p className="text-sm font-mono text-muted leading-relaxed">{t.desc}</p>
                  {t.useCase && (
                    <p className="mt-2 text-meta font-mono italic text-slate-500 dark:text-slate-400 flex-1">
                      {t.useCase}
                    </p>
                  )}
                  <span className="mt-4 inline-flex items-center gap-1 text-meta font-mono text-brand-600 dark:text-brand-400">
                    Open tool <ArrowRight size={12} />
                  </span>
                </div>
              );
              return t.external ? (
                <a key={t.path} href={t.path} target="_blank" rel="noopener noreferrer">
                  {card}
                </a>
              ) : (
                <Link key={t.path} to={t.path}>
                  {card}
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/* Why local */}
      {g === 'core-dfir' && (
        <section className="mt-12 mb-8 rounded-lg border border-brand-500/30 dark:border-brand-500/20 bg-brand-500/5 p-8">
          <h2 className="font-display font-bold text-xl flex items-center gap-2 mb-4">
            <Search size={20} className="text-brand-600 dark:text-brand-400" /> Quick demo — Identity Lookup
          </h2>
          <p className="text-sm font-mono text-muted mb-4 leading-relaxed">
            Look up a username across 11+ platforms. All checks run from your browser against public APIs — no server,
            no sign-in. Try this live example:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { platform: 'GitHub', username: 'torvalds', profileUrl: 'https://github.com/torvalds' },
              {
                platform: 'Stack Overflow',
                username: 'Jon Skeet',
                profileUrl: 'https://stackoverflow.com/users/22656',
              },
              { platform: 'Keybase', username: 'torvalds', profileUrl: 'https://keybase.io/torvalds' },
              { platform: 'Dev.to', username: 'ben', profileUrl: 'https://dev.to/ben' },
              {
                platform: 'Bluesky',
                username: 'atpfm.bsky.social',
                profileUrl: 'https://bsky.app/profile/atpfm.bsky.social',
              },
              { platform: 'PyPI', username: 'pranith', profileUrl: 'https://pypi.org/user/pranith/' },
            ].map((ex) => (
              <div
                key={ex.platform}
                className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 shadow-e1 p-3 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center text-xs font-mono text-brand-600 dark:text-brand-400">
                  ✓
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold font-display">{ex.platform}</div>
                  <div className="text-mini font-mono text-slate-400 truncate">@{ex.username}</div>
                </div>
                <a
                  href={ex.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 shrink-0"
                >
                  View <ExternalLink size={9} />
                </a>
              </div>
            ))}
          </div>
          <Link
            to="/dfir/username-investigator"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline"
          >
            Try your own username <ArrowRight size={13} />
          </Link>
        </section>
      )}

      <section className="mt-12 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-8">
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <ShieldCheck size={20} className="text-brand-600 dark:text-brand-400" /> Why local analysis matters
        </h2>
        <p className="text-sm font-mono text-muted mt-3 leading-relaxed max-w-3xl">
          Uploading sensitive security data to third-party servers is an unnecessary risk. Logs, hashes, indicators and
          email headers can carry confidential infrastructure detail, PII or proprietary information. Everything here is
          processed in your browser with standard Web APIs — the results are yours alone.
        </p>
      </section>

      {/* Who for */}
      <section className="mt-8">
        <h2 className="font-display font-bold text-xl mb-4 flex items-center gap-2">
          <Cpu size={20} className="text-brand-600 dark:text-brand-400" /> Who is it for?
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {AUDIENCE.map((a) => (
            <div
              key={a.who}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5"
            >
              <div className="font-display font-semibold mb-1">{a.who}</div>
              <p className="text-sm font-mono text-muted leading-relaxed">{a.what}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
