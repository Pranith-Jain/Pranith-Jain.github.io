import { DataPageLayout } from '../../components/DataPageLayout';
import { ExternalLink, Shield, Target, CheckCircle, XCircle } from 'lucide-react';

interface Step {
  number: number;
  title: string;
  description: string;
  highlight?: boolean;
}

const STEPS: Step[] = [
  {
    number: 1,
    title: 'What is this technique at a technical level?',
    description:
      'Define the exact mechanism — process injection, credential theft, lateral movement protocol. Be specific about the implementation, not just the intent.',
  },
  {
    number: 2,
    title: 'What must be true for it to succeed?',
    description:
      'List every precondition: permissions, access, software state, network position. These are the candidate chokepoints.',
  },
  {
    number: 3,
    title: 'What does the attacker control?',
    description:
      'Tool choice, timing, encoding, target selection, exfil channel. Anything the attacker can rotate or modify to evade detection.',
  },
  {
    number: 4,
    title: "What can't the attacker control? → THIS IS THE CHOKEPOINT",
    description:
      'The intersection of attacker goals and forced prerequisites. If the attacker must do X to achieve Y, and X is observable, that is the chokepoint.',
    highlight: true,
  },
  {
    number: 5,
    title: 'Can we observe it?',
    description:
      'Does telemetry exist? Can we instrument the chokepoint without modifying the target? Are there logs, ETW providers, or API hooks available?',
  },
  {
    number: 6,
    title: 'What are all the variations?',
    description:
      'Map every known variant, tool, and implementation. The chokepoint must hold across families — if it only works for one tool, it is not a chokepoint.',
  },
];

interface MaturityLevel {
  level: string;
  description: string;
  fpRate: string;
  useCase: string;
  color: string;
  border: string;
  bg: string;
}

const MATURITY_LEVELS: MaturityLevel[] = [
  {
    level: 'Research',
    description: 'Broad baseline, high FP, not for alerting',
    fpRate: 'High',
    useCase: 'Threat research, baselining, understanding attack surface',
    color: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
  },
  {
    level: 'Hunt',
    description: 'Behavioral context, moderate FP, analyst triage',
    fpRate: 'Medium',
    useCase: 'Active hunting, campaign tracking, threat landscape awareness',
    color: 'text-brand-700 dark:text-brand-300',
    border: 'border-brand-500/40',
    bg: 'bg-brand-500/10',
  },
  {
    level: 'Analyst',
    description: 'Production SOC alerting, minimal FP',
    fpRate: 'Low',
    useCase: 'SOC alerting, automated IR, incident response triage',
    color: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-500/40',
    bg: 'bg-sky-500/10',
  },
];

interface ValidationQuestion {
  question: string;
  description: string;
}

const VALIDATION_QUESTIONS: ValidationQuestion[] = [
  {
    question: 'Can the attacker avoid it?',
    description: 'If the attacker can achieve their objective without triggering the chokepoint, it is not durable.',
  },
  {
    question: 'Does it survive tool rotation?',
    description: 'The chokepoint must hold across tool families, not just one specific implementation.',
  },
  {
    question: 'Does it cover multiple families?',
    description:
      'If multiple threat groups or malware families share the same forced prerequisite, the chokepoint has broad coverage.',
  },
  {
    question: 'Will it work in 6–12 months?',
    description:
      'The chokepoint must be grounded in fundamental constraints, not implementation quirks that patch or evolve.',
  },
];

interface Contrast {
  dimension: string;
  chokepoint: string;
  tool: string;
}

const CONTRAST_DATA: Contrast[] = [
  {
    dimension: 'Durability',
    chokepoint: 'Months to years — attacker must violate it to succeed',
    tool: 'Days to weeks — signature becomes stale after first rotation',
  },
  {
    dimension: 'Coverage',
    chokepoint: 'Broad — catches all families sharing the prerequisite',
    tool: 'Narrow — specific to one tool or variant',
  },
  {
    dimension: 'Maintenance',
    chokepoint: 'Low — monitor telemetry drift, rarely update',
    tool: 'High — constant signature updates, FP tuning, rule rewrites',
  },
  {
    dimension: 'FP Rate',
    chokepoint: 'Low — grounded in attacker constraints, not behavioral heuristics',
    tool: 'Variable — often high without extensive tuning',
  },
  {
    dimension: 'Evasion Difficulty',
    chokepoint: 'Hard — would require fundamentally different attack approach',
    tool: 'Easy — tool swap, encoding change, or minor variant',
  },
];

export default function DetectionChokepointsFramework(): JSX.Element {
  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Shield size={28} />}
      title="Detection Chokepoints Framework"
      description="The 6-step chokepoint identification process adapted from Matt Graeber's methodology. Find invariant detection points where attackers are forced to violate observable prerequisites — regardless of tool choice or variant."
      headerExtra={
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Source:{' '}
          <a
            href="https://iimp0ster.github.io/detection-chokepoints/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            iimp0ster/detection-chokepoints <ExternalLink size={11} />
          </a>
        </p>
      }
      maxWidthClass="max-w-6xl"
    >
      <section className="mb-8">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
          6-Step Chokepoint Identification
        </h2>
        <div className="space-y-3">
          {STEPS.map((s) => (
            <div
              key={s.number}
              className={`rounded-xl border p-4 ${
                s.highlight
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]'
              } shadow-e1`}
            >
              <header className="flex items-center gap-3 mb-2">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-mono text-sm font-bold flex items-center justify-center">
                  {s.number}
                </span>
                <h3 className="font-display font-bold text-slate-900 dark:text-slate-100 text-base">{s.title}</h3>
              </header>
              <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed ml-10">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
          Detection Maturity Model
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {MATURITY_LEVELS.map((m) => (
            <div key={m.level} className={`rounded-xl border ${m.border} ${m.bg} p-4 shadow-e1`}>
              <h3 className={`font-display font-bold text-base mb-1 ${m.color}`}>{m.level}</h3>
              <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-2">{m.description}</p>
              <div className="space-y-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                <p>
                  <span className="text-micro uppercase tracking-[0.2em] mr-1">FP Rate</span>
                  <span className="text-slate-700 dark:text-slate-300">{m.fpRate}</span>
                </p>
                <p>
                  <span className="text-micro uppercase tracking-[0.2em] mr-1">Use</span>
                  <span className="text-slate-700 dark:text-slate-300">{m.useCase}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
          4-Question Chokepoint Validation Test
        </h2>
        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="space-y-3">
            {VALIDATION_QUESTIONS.map((q, i) => (
              <div key={i} className="flex items-start gap-3">
                <Target size={14} className="flex-shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" />
                <div>
                  <p className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">{q.question}</p>
                  <p className="text-sm font-mono text-slate-600 dark:text-slate-400">{q.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
            <p className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle size={14} /> All yes = durable chokepoint
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
          Chokepoint Detection vs Tool Detection
        </h2>
        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <th className="text-left text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 px-4 py-2">
                    Dimension
                  </th>
                  <th className="text-left text-micro font-mono uppercase tracking-[0.2em] px-4 py-2">
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle size={11} /> Chokepoint
                    </span>
                  </th>
                  <th className="text-left text-micro font-mono uppercase tracking-[0.2em] px-4 py-2">
                    <span className="flex items-center gap-1 text-rose-700 dark:text-rose-300">
                      <XCircle size={11} /> Tool
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CONTRAST_DATA.map((r, i) => (
                  <tr
                    key={r.dimension}
                    className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${
                      i % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-900/50' : ''
                    }`}
                  >
                    <td className="px-4 py-2 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {r.dimension}
                    </td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{r.chokepoint}</td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{r.tool}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </DataPageLayout>
  );
}
