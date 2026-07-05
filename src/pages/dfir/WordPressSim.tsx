import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Globe } from 'lucide-react';

const SIM_URL = 'https://mr-r3b00t.github.io/org_cyber_attack_sim/wordpress.html';

export default function WordPressSim(): JSX.Element {
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
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> WordPress Server — Attack Simulation
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          Single-server attack simulation: a LAMP-stack WordPress box exposed to the internet from 2018–2025. Watch bot
          scans, brute force, CVE exploits, SQL injection, DDoS, and database exfiltration in real time against
          configurable defensive controls.
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
          · WordPress scenario, fully client-side, MITRE ATT&CK tagged.
        </p>
      </div>

      {/* Feature grid */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {[
          { label: 'Single server', desc: 'One LAMP box on the internet' },
          { label: '2018–2025', desc: '7-year attack timeline' },
          { label: '6 attack types', desc: 'Scans, brute force, CVE, SQLi, DDoS, exfil' },
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
          <span className="text-xs font-mono text-muted">WordPress simulation running</span>
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
          title="WordPress Server — Attack Simulation"
          className="w-full border-0"
          style={{ minHeight: '70vh' }}
          sandbox="allow-scripts"
          loading="lazy"
        />
      </div>

      {/* Legend */}
      <section className="mt-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
          Attack Types
        </h2>
        <div className="grid gap-1.5 sm:grid-cols-3 text-sm font-mono text-slate-700 dark:text-slate-300">
          {[
            'Bot scan / recon',
            'Login brute force',
            'CVE exploit (RCE)',
            'SQL injection',
            'MySQL :3306 attack',
            'Open-directory crawl',
            'DDoS (huge volume)',
            'Compromise',
          ].map((t) => (
            <div key={t} className="flex items-start gap-2">
              <span className="shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* Defensive controls */}
      <section className="mt-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
          Defensive Controls (toggleable)
        </h2>
        <div className="grid gap-1.5 sm:grid-cols-3 text-sm font-mono text-slate-700 dark:text-slate-300">
          {[
            'WAF / firewall',
            'Auto-updates',
            'Login 2FA / limit',
            'DDoS protection',
            'MySQL exposed',
            'Open directory',
          ].map((c) => (
            <div key={c} className="flex items-start gap-2">
              <span className="shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {c}
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
