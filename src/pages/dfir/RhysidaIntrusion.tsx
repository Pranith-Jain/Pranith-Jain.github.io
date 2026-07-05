import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Skull } from 'lucide-react';

const SIM_URL = 'https://mr-r3b00t.github.io/org_cyber_attack_sim/rhysida.html';

export default function RhysidaIntrusion(): JSX.Element {
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
          <Skull size={28} className="text-brand-600 dark:text-brand-400" /> Anatomy of a Rhysida Intrusion
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          A real Rhysida kill chain mapped to MITRE ATT&CK — 24 stages across all 12 tactics, from no-MFA VPN login
          through Zerologon, ntds.dit exfiltration to domain-wide encryption. Step through stage by stage, or watch the
          8-hour timeline play out.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6">
          Source:{' '}
          <a
            href="https://mr-r3b00t.github.io/org_cyber_attack_sim/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            mr-r3b00t/org_cyber_attack_sim <ExternalLink size={11} />
          </a>{' '}
          · Rhysida scenario, fully client-side, MITRE ATT&CK tagged.
        </p>
      </div>

      {/* Feature grid */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {[
          { label: '24 stages', desc: 'Across all 12 MITRE ATT&CK tactics' },
          { label: '8-hour timeline', desc: 'Realistic dwell time and exfil pacing' },
          { label: 'Rhysida TTPs', desc: 'Real tooling and techniques mapped' },
        ].map((f) => (
          <div
            key={f.label}
            className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3 shadow-e1"
          >
            <div className="text-sm font-display font-bold text-slate-900 dark:text-slate-100">{f.label}</div>
            <div className="text-xs font-mono text-muted">{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Embedded simulation */}
      <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e2 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-100))]">
          <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-xs font-mono text-muted">Rhysida simulation running</span>
          <a
            href={SIM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            Open in new tab <ExternalLink size={10} />
          </a>
        </div>
        <iframe
          src={SIM_URL}
          title="Anatomy of a Rhysida Intrusion"
          className="w-full border-0"
          style={{ minHeight: '70vh' }}
          sandbox="allow-scripts"
          loading="lazy"
        />
      </div>

      {/* Kill chain stages */}
      <section className="mt-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
          Kill Chain Highlights
        </h2>
        <div className="grid gap-1.5 sm:grid-cols-2 text-sm font-mono text-slate-700 dark:text-slate-300">
          {[
            'Initial Access — no-MFA VPN login',
            'Credential Access — Zerologon (CVE-2020-1472)',
            'Discovery — domain enumeration',
            'Lateral Movement — DCSync, PsExec',
            'Collection — ntds.dit extraction',
            'Exfiltration — Rhysida blob upload',
            'Impact — domain-wide encryption',
          ].map((t) => (
            <div key={t} className="flex items-start gap-2">
              <span className="shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* Source */}
      <section className="mt-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
          Upstream
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-muted">
          <li>
            <a
              href="https://mr-r3b00t.github.io/org_cyber_attack_sim/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              mr-r3b00t/org_cyber_attack_sim — live simulation
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://github.com/mr-r3b00t/org_cyber_attack_sim"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              GitHub — source code
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
