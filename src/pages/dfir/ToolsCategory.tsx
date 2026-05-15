import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ShieldCheck, Lock, Cpu, Github, Linkedin, Mail } from 'lucide-react';
import { SECTIONS } from '../../components/dfir/ToolGrid';
import { GROUP_META, type ToolGroup } from '../../components/dfir/tool-sections';
import { personalInfo } from '../../data/content';

const VALID: ToolGroup[] = ['dfir', 'osint', 'aisec', 'datasec', 'grc'];

const HERO: Record<ToolGroup, { kicker: string; title: string; sub: string }> = {
  dfir: {
    kicker: 'Privacy-first · No upload · No login · Local analysis only',
    title: 'Privacy-first DFIR tools that run entirely in your browser',
    sub: 'Analyze indicators, timestamps, files, logs and email headers locally. No upload. No login. Instant results.',
  },
  osint: {
    kicker: 'Privacy-first · No upload · No login · Local analysis only',
    title: 'Privacy-first OSINT tools that run entirely in your browser',
    sub: 'Pivot across domains, emails, usernames, images and web resources — collected and normalized client-side.',
  },
  aisec: {
    kicker: 'Privacy-first · No upload · No login · Local analysis only',
    title: 'AI-security tooling that never leaves your browser',
    sub: 'Probe prompts, audit MCP/agent surfaces and map model risk without shipping payloads to a third party.',
  },
  datasec: {
    kicker: 'Privacy-first · No upload · No login · Local analysis only',
    title: 'Data-security utilities with zero data exfiltration',
    sub: 'Detect and classify sensitive data and review handling — entirely on your own device.',
  },
  grc: {
    kicker: 'Privacy-first · No upload · No login · Local analysis only',
    title: 'GRC & posture workbench, fully client-side',
    sub: 'Run compliance, maturity, tabletop and framework exercises with nothing sent off-box.',
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
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono"
      >
        <ArrowLeft size={14} /> all tools
      </Link>

      {/* Hero */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 mb-8">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400 mb-3 inline-flex items-center gap-2">
          <Lock size={12} /> {hero.kicker}
        </div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl leading-tight">{hero.title}</h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mt-3 max-w-3xl leading-relaxed">{hero.sub}</p>
        <div className="mt-4 font-mono text-[12px] text-slate-500">
          {total} tools · {meta.label} · by{' '}
          <a
            href={personalInfo.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            {personalInfo.name}
          </a>
        </div>
      </section>

      {/* Sibling category nav */}
      <div className="flex flex-wrap items-center gap-2 mb-8 text-[11px] font-mono">
        <span className="text-slate-500">categories:</span>
        {VALID.map((v) => (
          <Link
            key={v}
            to={`/dfir/tools/${v}`}
            className={`px-3 py-1.5 rounded border ${
              v === g
                ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-brand-500/40'
            }`}
          >
            {GROUP_META[v].label}
          </Link>
        ))}
      </div>

      <div className="mb-6">
        <h2 className="font-display font-bold text-2xl">Available Tools</h2>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
          Each tool runs 100% in your browser — your data never leaves your device.
        </p>
      </div>

      {sections.map((s) => (
        <section key={s.id} className="mb-10">
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
              {s.label}
            </h3>
            <span className="text-[11px] font-mono text-slate-500">{s.blurb}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {s.tools.map((t) => {
              const Icon = t.icon;
              const card = (
                <div className="group h-full flex flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={18} className="text-brand-600 dark:text-brand-400" />
                    <span className="font-display font-semibold group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {t.label}
                    </span>
                  </div>
                  <p className="text-sm font-mono text-slate-600 dark:text-slate-400 leading-relaxed flex-1">
                    {t.desc}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-mono text-brand-600 dark:text-brand-400">
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
      <section className="mt-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <h2 className="font-display font-bold text-xl flex items-center gap-2">
          <ShieldCheck size={20} className="text-brand-600 dark:text-brand-400" /> Why local analysis matters
        </h2>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-3 leading-relaxed max-w-3xl">
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
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
            >
              <div className="font-display font-semibold mb-1">{a.who}</div>
              <p className="text-sm font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{a.what}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="font-mono text-[12px] text-slate-500 max-w-xl">
            Privacy-first DFIR & OSINT tooling by {personalInfo.name}. All analysis happens locally in your browser — no
            uploads, no tracking, no accounts. Triage support only; validate findings with your standard forensic
            workflow.
          </div>
          <div className="flex flex-wrap gap-4 text-[12px] font-mono">
            <Link
              to="/about"
              className="text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
            >
              About
            </Link>
            <Link
              to="/dfir/privacy-hub"
              className="text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
            >
              Privacy
            </Link>
            <a
              href={`mailto:${personalInfo.email}`}
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
            >
              <Mail size={12} /> Contact
            </a>
            <a
              href={personalInfo.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
            >
              <Github size={12} /> GitHub
            </a>
            <a
              href={personalInfo.linkedInUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
            >
              <Linkedin size={12} /> LinkedIn
            </a>
          </div>
        </div>
        <div className="font-mono text-[11px] text-slate-400 mt-4">
          © {new Date().getFullYear()} {personalInfo.name} · {meta.label}. Maintained by {personalInfo.name}.
        </div>
      </footer>
    </div>
  );
}
