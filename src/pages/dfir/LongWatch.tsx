import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Monitor, Shield, Swords, Clock } from 'lucide-react';

interface Scenario {
  id: string;
  title: string;
  icon: typeof Monitor;
  color: string;
  border: string;
  bg: string;
  description: string;
  features: string[];
  techniqueTags: string[];
  url: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'attack-surface',
    title: 'Attack Surface — SSL-VPN CVE Model',
    icon: Shield,
    color: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/5',
    description:
      'Model the exploitation of SSL-VPN appliances over an 8-year timeline (2018–2025). Four real CVEs with 6 defensive controls — watch how patching cadence, compensating controls, and asset visibility affect breach probability over time.',
    features: [
      '4 real CVEs modeled against SSL-VPN appliances',
      '6 defensive controls with realistic deployment timelines',
      '8-year simulation window (2018–2025)',
      'Probabilistic exploitation modeling',
    ],
    techniqueTags: ['T1190', 'T1133', 'T1078'],
    url: 'https://mr-r3b00t.github.io/org_cyber_attack_sim/',
  },
  {
    id: 'phishing-identity',
    title: 'Phishing & Identity — Inbox Arms Race',
    icon: Swords,
    color: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/5',
    description:
      'An 8-year inbox arms race: credential harvesting → MFA fatigue → AiTM proxy kits. Simulates the evolution of phishing techniques against progressively harder defensive postures — from basic email filters to FIDO2 passkeys.',
    features: [
      '8-year timeline of phishing technique evolution',
      'Credential harvest → MFA fatigue → AiTM progression',
      'Progressive defense simulation (filters → FIDO2)',
      'Realistic email volume and delivery patterns',
    ],
    techniqueTags: ['T1566', 'T1539', 'T1550.001', 'T1621'],
    url: 'https://mr-r3b00t.github.io/org_cyber_attack_sim/',
  },
  {
    id: 'ransomware-killchain',
    title: 'Ransomware Kill Chain — 15-Stage Intrusion',
    icon: Monitor,
    color: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/5',
    description:
      'A 15-stage ransomware intrusion model with full MITRE ATT&CK tagging. Combines scripted (deterministic) and probabilistic (randomized) elements — each run plays out differently based on defender actions and defender posture.',
    features: [
      '15-stage kill chain from initial access to exfiltration',
      'MITRE ATT&CK tagged at every stage',
      'Scripted + probabilistic hybrid execution',
      'Replayable — different outcomes based on defender choices',
    ],
    techniqueTags: ['T1566', 'T1059', 'T1053', 'T1486', 'T1490', 'T1560'],
    url: 'https://mr-r3b00t.github.io/org_cyber_attack_sim/',
  },
];

export default function LongWatch(): JSX.Element {
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
          <Clock size={28} className="text-brand-600 dark:text-brand-400" /> The Long Watch — Org Cyber Attack Sim
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          Interactive browser-based network defense simulation. Runs entirely in your browser — no data leaves the page.
          Movable SOC panel, telemetry from 2018–2025, and three scenarios modeling real-world attack evolution against
          progressive defensive postures.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Source:{' '}
          <a
            href="https://mr-r3b00t.github.io/org_cyber_attack_sim/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            mr-r3b00t/org_cyber_attack_sim <ExternalLink size={11} />
          </a>{' '}
          · 3 scenarios, fully client-side, MITRE ATT&CK tagged.
        </p>
      </div>

      <div className="space-y-4">
        {SCENARIOS.map((s) => {
          const Icon = s.icon;
          return (
            <article key={s.id} className={`rounded-lg border ${s.border} ${s.bg} shadow-e1 p-5`}>
              <header className="flex flex-wrap items-center gap-2 mb-3">
                <Icon size={20} className={s.color} />
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">{s.title}</h2>
              </header>

              <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-3 leading-relaxed">
                {s.description}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 mb-3">
                {s.features.map((f) => (
                  <div
                    key={f}
                    className="flex items-start gap-2 text-meta font-mono text-slate-600 dark:text-slate-400"
                  >
                    <span
                      className={`shrink-0 mt-1 inline-block w-1.5 h-1.5 rounded-full ${s.color.replace('text-', 'bg-')}`}
                    />
                    {f}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {s.techniqueTags.map((t) => (
                  <span
                    key={t}
                    className="text-micro font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                  >
                    {t}
                  </span>
                ))}
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/60 text-slate-700 dark:text-slate-300 hover:text-brand-700 dark:hover:text-brand-300 inline-flex items-center gap-1.5"
                >
                  Launch interactive sim <ExternalLink size={12} />
                </a>
              </div>
            </article>
          );
        })}
      </div>

      {/* Feature highlights */}
      <section className="mt-8 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
          Platform Features
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-700 dark:text-slate-300">
          <li className="flex items-start gap-2">
            <span className="shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Runs entirely in your browser — no data leaves the page
          </li>
          <li className="flex items-start gap-2">
            <span className="shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Movable SOC panel for real-time monitoring during simulation
          </li>
          <li className="flex items-start gap-2">
            <span className="shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Telemetry spanning 2018–2025 with realistic threat evolution
          </li>
          <li className="flex items-start gap-2">
            <span className="shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            MITRE ATT&CK technique mapping at every stage
          </li>
          <li className="flex items-start gap-2">
            <span className="shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Scripted + probabilistic hybrid — replayable with different outcomes
          </li>
        </ul>
      </section>

      {/* Upstream reference */}
      <section className="mt-4 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
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
