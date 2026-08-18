/**
 * /threatintel/ooda -- OODA Loop: Observe, Orient, Decide, Act.
 *
 * John Boyd's decision cycle (USAF, 1970s-80s, briefed as "A Discourse
 * on Winning and Losing"). The OODA loop describes how a decision-maker
 * processes information and acts faster than an opponent -- the
 * "get inside their OODA loop" concept from Boyd's fighter-pilot
 * experience. It is the tempo-setting cycle underneath targeting
 * frameworks like F2T2EA and F3EAD.
 *
 * This page is static (no backend roundtrip) -- the value is the
 * structured doctrine, the platform cross-links, and the concrete
 * incident walkthrough that makes the loop visible. It follows the
 * same pattern as F3ead.tsx, F2t2ea.tsx, and the other framework
 * pages in the `frameworks` catalog group.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Crosshair,
  Eye,
  Compass,
  Scale,
  Zap,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowRight,
  CircleDot,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Wrench,
} from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';

// ---------------------------------------------------------------------------
// Phase model
// ---------------------------------------------------------------------------

type PhaseId = 'observe' | 'orient' | 'decide' | 'act';

interface Phase {
  id: PhaseId;
  number: number;
  name: string;
  short: string;
  icon: typeof Eye;
  /** Hex tailwind accents per phase -- used on the loop diagram cards. */
  accent: string;
  ringClass: string;
  who: string;
  defenderGoal: string;
  description: string;
  deliverables: string[];
  pitfalls: string[];
  attackMapping: string;
  /** Optional in-platform tool the analyst can jump to from this phase. */
  platformTool?: { to: string; label: string };
}

const PHASES: Phase[] = [
  {
    id: 'observe',
    number: 1,
    name: 'Observe',
    short: 'Collect what is happening',
    icon: Eye,
    accent: 'bg-sky-500/10',
    ringClass: 'ring-sky-400/60 dark:ring-sky-500/40',
    who: 'SOC + Intel (telemetry, feeds, tipping)',
    defenderGoal: 'See the environment as it actually is -- not as you assume it is.',
    description:
      'The raw intake of the loop: telemetry, logs, intel feeds, partner tipping, and the results of your own prior Actions. Observation is worthless without the Orient step -- the same data means different things to different analysts.',
    deliverables: [
      'Raw alerts, logs, and feed hits',
      'Collection gaps noted (what we cannot see)',
      'Updated situational picture',
    ],
    pitfalls: [
      'Falling into an alert-driven loop -- reacting to every ping without orienting first.',
      'Assuming your sensors see everything. Gaps in coverage are data too.',
    ],
    attackMapping: 'Maps loosely to ATT&CK Reconnaissance + telemetry sources (TA0007-ish).',
    platformTool: { to: '/dfir/ioc-check', label: 'IOC check (multi-engine)' },
  },
  {
    id: 'orient',
    number: 2,
    name: 'Orient',
    short: 'Shape the picture with context',
    icon: Compass,
    accent: 'bg-amber-500/10',
    ringClass: 'ring-amber-400/60 dark:ring-amber-500/40',
    who: 'CTI analysts + threat hunters + DFIR',
    defenderGoal: 'Give the observed data meaning -- via training, culture, and prior intel.',
    description:
      "Boyd called Orient the schwerpunkt (main effort) of the loop: the analyst's mental models, prior knowledge, intel baseline, and assumptions filter what Observation means. Two analysts observing the same alert can orient to completely different threats. In cyber, Orient is where ATT&CK mapping, actor profiles, and kill-chain context get applied.",
    deliverables: [
      'Contextualized hypothesis (what this alert likely means)',
      'ATT&CK + actor mapping for the observed activity',
      'Assumptions and biases explicitly listed',
    ],
    pitfalls: [
      'Skipping Orient -- jumping from Observe straight to Decide ("it looks like X, act").',
      'Orient drift -- assumptions from last month that no longer hold.',
    ],
    attackMapping: 'Consumes ATT&CK + Diamond + actor intelligence to interpret the observation.',
    platformTool: { to: '/threatintel/ach', label: 'ACH (analyze competing hypotheses)' },
  },
  {
    id: 'decide',
    number: 3,
    name: 'Decide',
    short: 'Choose a course of action',
    icon: Scale,
    accent: 'bg-emerald-500/10',
    ringClass: 'ring-emerald-400/60 dark:ring-emerald-500/40',
    who: 'IR lead + SOC + leadership',
    defenderGoal: 'Select the response that best fits the oriented picture.',
    description:
      'The action-selection step: given the oriented picture, pick a response -- contain, block, sinkhole, investigate further, or deliberately do nothing. Boyd stressed that decisions must be made with imperfect information; waiting for perfect certainty forfeits tempo. In cyber, Decide is where the chosen response is weighed against rules of engagement and risk.',
    deliverables: [
      'Chosen response + rationale',
      'Rules-of-engagement / risk check',
      'Trigger to re-observe (what would change the decision)',
    ],
    pitfalls: [
      'Analysis paralysis -- waiting for certainty while the adversary moves.',
      'Deciding without an explicit re-observe trigger, so the loop stalls.',
    ],
    attackMapping: 'Aligned with NIST SP 800-61 IR decision gates: containment strategy selection.',
    platformTool: { to: '/dfir/ir-playbooks', label: 'IR playbooks' },
  },
  {
    id: 'act',
    number: 4,
    name: 'Act',
    short: 'Execute and change the picture',
    icon: Zap,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'IR + SecOps + asset owners',
    defenderGoal: 'Execute the decision, then re-observe the changed environment.',
    description:
      "Execution: block, isolate, patch, evict. Action changes the environment, which the next Observe cycle picks up. Boyd's key point: Act fast enough that the adversary must react to YOU -- getting inside their loop means they keep responding to your moves instead of setting the tempo.",
    deliverables: [
      'Executed action log',
      'Post-action telemetry baseline for the next Observe',
      'Tempo assessment (did we outpace the adversary?)',
    ],
    pitfalls: [
      'Acting without re-observation -- assuming the world froze after your action.',
      'Going loud with no evidence capture, so the next loop has nothing to orient on.',
    ],
    attackMapping: 'Aligned with NIST SP 800-61 IR phases: Containment, Eradication, Recovery.',
    platformTool: { to: '/dfir/blocklists', label: 'Blocklists (exportable)' },
  },
];

// ---------------------------------------------------------------------------
// Lazarus / Copperhedge walkthrough (drawn from the existing
// src/data/threatintel/sample-reports.ts so the example is real and
// already part of the codebase -- no fabricated CTI).
// ---------------------------------------------------------------------------

interface WalkStep {
  phase: PhaseId;
  title: string;
  prompt: string;
  artifacts: string[];
}

const WALK: WalkStep[] = [
  {
    phase: 'observe',
    title: 'Telemetry: RSC deserialization probes',
    prompt:
      'A partner feed + a CTF IoC report named Lazarus exploiting CVE-2025-55182. Simultaneously the WAF + load balancer logs show the list.txt scanning pattern hitting our Next.js 15.x prod apps.',
    artifacts: ['Raw hits: greynoise + ctfiot + perimeter logs', 'Noted gap: no visibility into staging app telemetry'],
  },
  {
    phase: 'orient',
    title: 'Context: Lazarus targets financial / blockchain infra',
    prompt:
      'ATT&CK + Diamond mapping: the scanning pattern and the follow-up RSC deserialization POST match known Lazarus tradecraft against React/Next.js surfaces. Bias check: the "Lazarus" label is a working hypothesis, not a confirmed attribution.',
    artifacts: [
      'Hypothesis: "Lazarus RSC RCE against our Next.js surface"',
      'Assumptions listed (financial motivation, known tooling)',
    ],
  },
  {
    phase: 'decide',
    title: 'Pick the response: isolate + block + patch',
    prompt:
      'Weigh options against risk and tempo: isolate the 3 prod apps, perimeter-block the C2 domains, stage the vendor patch. Decide to preserve evidence (memory + disk images) before cleanup. Set the re-observe trigger: watch for new scanning on the staging surface.',
    artifacts: ['Chosen response + ROE sign-off', 'Re-observe trigger: staging-surface scans within 24h'],
  },
  {
    phase: 'act',
    title: 'Execute, then re-observe',
    prompt:
      'Block C2 domains, isolate the apps, rotate secrets, deploy the patch, capture images. Then immediately re-observe: beaconing drops to zero on blocked domains, but 12h later the staging Next.js app shows the same scan pattern -- the adversary re-tooled, and the loop starts again.',
    artifacts: [
      'Action log (blocklist, isolation, patching)',
      'Post-action telemetry showing the adversary re-tooling',
    ],
  },
];

// ---------------------------------------------------------------------------
// Comparison table: OODA vs. the other frameworks on the platform
// ---------------------------------------------------------------------------

interface FrameworkRow {
  name: string;
  kind: 'process' | 'content';
  question: string;
  primaryUser: string;
  /** Optional -- frameworks without a dedicated platform page render as "—". */
  platformPage?: string;
  note: string;
}

const COMPARISON: FrameworkRow[] = [
  {
    name: 'OODA Loop',
    kind: 'process',
    question: 'How fast can we decide and act?',
    primaryUser: 'IR + SOC (tempo)',
    platformPage: '/threatintel/ooda',
    note: "Boyd's decision cycle. The inner loop that sets the tempo underneath F2T2EA / F3EAD.",
  },
  {
    name: 'F2T2EA',
    kind: 'process',
    question: 'How do we locate, track, and act on a target?',
    primaryUser: 'Ops + IR (targeting)',
    platformPage: '/threatintel/f2t2ea',
    note: 'The joint targeting cycle. OODA runs inside its Find-Target-Engage phases.',
  },
  {
    name: 'F3EAD',
    kind: 'process',
    question: 'How does the team operate end-to-end on a target?',
    primaryUser: 'CTI + SOC + IR',
    platformPage: '/threatintel/f3ead',
    note: 'F2T2EA plus an explicit intelligence cycle (Exploit/Analyze/Disseminate).',
  },
  {
    name: 'Lockheed Kill Chain',
    kind: 'content',
    question: 'What phases did the intrusion pass through?',
    primaryUser: 'DFIR + SOC',
    platformPage: '/dfir/kill-chain',
    note: 'Linear, 7 phases. Describes the intrusion, not the decision cycle.',
  },
  {
    name: 'Unified Kill Chain',
    kind: 'content',
    question: 'How does the full campaign unfold across In / Through / Out?',
    primaryUser: 'CTI + DFIR + SOC',
    platformPage: '/threatintel/unified-kill-chain',
    note: 'The 18-phase meta-framework (Pols 2017) synthesizing the kill chain + ATT&CK.',
  },
  {
    name: 'MITRE ATT&CK',
    kind: 'content',
    question: 'Which specific techniques did the adversary use?',
    primaryUser: 'Detection eng + CTI',
    platformPage: '/threatintel/mitre',
    note: 'The shared vocabulary. ATT&CK mapping happens inside Orient.',
  },
  {
    name: 'Diamond Model',
    kind: 'content',
    question: 'Who did what to whom, and how?',
    primaryUser: 'CTI + IR',
    platformPage: '/dfir/diamond',
    note: 'Per-event reconstruction. Feeds Orient and Assess.',
  },
  {
    name: 'ACH',
    kind: 'process',
    question: 'Which hypothesis best explains the evidence?',
    primaryUser: 'CTI analysts',
    platformPage: '/threatintel/ach',
    note: 'Structured analytic technique used inside Orient and Decide.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Ooda(): JSX.Element {
  const [openPhase, setOpenPhase] = useState<PhaseId | null>('observe');
  const [walkStep, setWalkStep] = useState<number>(0);

  const currentWalk = WALK[walkStep]!;
  const currentPhase = PHASES.find((p) => p.id === currentWalk.phase)!;
  const WalkIcon = currentPhase.icon;

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Crosshair size={28} />}
      title="OODA Loop: Observe, Orient, Decide, Act"
      description={
        <>
          John Boyd's decision cycle from fighter combat, adapted to cyber defense. The OODA loop is how a team
          <em>out-tempos</em> an adversary: Observe the environment, Orient it with context and prior knowledge, Decide
          a response, and Act -- then loop. The key insight: the loop is <em>continuous</em>, and speed comes from
          compressing it. OODA is the tempo-setting cycle underneath targeting frameworks like F2T2EA and F3EAD.
        </>
      }
      maxWidthClass="max-w-7xl"
    >
      {/* ── The loop diagram ─────────────────────────────────────────── */}
      <section className="mb-12">
        <header className="flex items-end justify-between mb-4">
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-200">The OODA loop</h2>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 hidden sm:block">
            observe &rarr; orient &rarr; decide &rarr; act &rarr; repeat
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative">
          {PHASES.map((p, i) => {
            const Icon = p.icon;
            const isLast = i === PHASES.length - 1;
            return (
              <div key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenPhase(openPhase === p.id ? null : p.id)}
                  className={`w-full text-left surface-card p-4 ring-1 ${p.ringClass} hover:shadow-e1 transition-shadow`}
                >
                  <div className={`absolute inset-0 rounded-xl ${p.accent} pointer-events-none opacity-60`} />
                  <div className="relative flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-xs font-mono text-slate-600 dark:text-slate-300">
                        {p.number}
                      </span>
                      <Icon className="h-4 w-4 text-slate-700 dark:text-slate-200" />
                    </div>
                    {openPhase === p.id ? (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                  <div className="relative mt-2">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{p.name}</h3>
                    <p className="text-xs text-muted mt-0.5">{p.short}</p>
                  </div>
                </button>
                {/* Loop arrow back to Observe on the last card. */}
                {isLast && (
                  <div className="hidden lg:flex absolute -bottom-3 left-1/2 -translate-x-1/2 items-center gap-1 text-micro font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-300 bg-white dark:bg-[rgb(var(--surface-200))] px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))]">
                    <Sparkles className="h-3 w-3" /> loops back to Observe
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Expanded phase detail */}
        {openPhase &&
          (() => {
            const p = PHASES.find((x) => x.id === openPhase)!;
            const PIcon = p.icon;
            return (
              <div className="mt-4 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className={`rounded p-2 ring-1 ${p.ringClass} bg-white dark:bg-[rgb(var(--surface-200))]`}>
                    <PIcon className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {p.number}. {p.name} &mdash; {p.short}
                    </h3>
                    <p className="text-sm text-muted mt-1">{p.description}</p>
                    <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <dt className="font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Who</dt>
                        <dd className="text-slate-800 dark:text-slate-200">{p.who}</dd>
                      </div>
                      <div>
                        <dt className="font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Defender goal
                        </dt>
                        <dd className="text-slate-800 dark:text-slate-200">{p.defenderGoal}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Primary deliverables
                        </dt>
                        <dd>
                          <ul className="mt-1 space-y-0.5">
                            {p.deliverables.map((d) => (
                              <li key={d} className="flex items-start gap-1.5 text-slate-800 dark:text-slate-200">
                                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Common pitfalls
                        </dt>
                        <dd>
                          <ul className="mt-1 space-y-0.5">
                            {p.pitfalls.map((d) => (
                              <li key={d} className="flex items-start gap-1.5 text-slate-800 dark:text-slate-200">
                                <CircleDot className="h-3.5 w-3.5 mt-0.5 text-rose-600 dark:text-rose-300 shrink-0" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Framework mapping
                        </dt>
                        <dd className="text-slate-800 dark:text-slate-200">{p.attackMapping}</dd>
                      </div>
                    </dl>
                    {p.platformTool && (
                      <div className="mt-4">
                        <Link
                          to={p.platformTool.to}
                          className="inline-flex items-center gap-1.5 rounded border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-mono text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60"
                        >
                          <Wrench className="h-3.5 w-3.5" /> Use platform tool: {p.platformTool.label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
      </section>

      {/* ── Incident walkthrough ─────────────────────────────────────── */}
      <section className="mb-12">
        <header className="mb-4">
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-200">
            Walk an incident through OODA
          </h2>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            A 4-step click-through using the Lazarus / Copperhedge sample already in the platform's
            <Link to="/threatintel/research-hub/ai" className="text-rose-600 dark:text-rose-400 hover:underline mx-1">
              AI Report showcase
            </Link>
            as the running example. Click a step to jump to that phase.
          </p>
        </header>

        <div className="surface-card p-5">
          <div className="flex flex-wrap gap-1.5 mb-4">
            {WALK.map((w, i) => {
              const phase = PHASES.find((p) => p.id === w.phase)!;
              const PIcon = phase.icon;
              const active = i === walkStep;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setWalkStep(i)}
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-mini font-mono transition-colors ${
                    active
                      ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                      : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] text-muted hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
                  }`}
                >
                  <span className="opacity-70">{phase.number}</span>
                  <PIcon className="h-3 w-3" />
                  {phase.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-3 mb-3">
            <div className={`rounded p-2 ring-1 ${currentPhase.ringClass} bg-slate-50 dark:bg-[rgb(var(--input-200))]`}>
              <WalkIcon className="h-5 w-5 text-slate-700 dark:text-slate-200" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Step {walkStep + 1} of {WALK.length} &middot; {currentPhase.name}
              </p>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{currentWalk.title}</h3>
              <p className="text-sm text-muted mt-1">{currentWalk.prompt}</p>
            </div>
          </div>

          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3">
            <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Artifacts produced at this step
            </p>
            <ul className="space-y-1">
              {currentWalk.artifacts.map((a) => (
                <li key={a} className="flex items-start gap-1.5 text-xs text-slate-800 dark:text-slate-200">
                  <CircleDot className="h-3 w-3 mt-0.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setWalkStep((s) => Math.max(0, s - 1))}
              disabled={walkStep === 0}
              className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-3 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 hover:border-rose-400 disabled:opacity-40 disabled:hover:border-slate-300 dark:disabled:hover:border-[rgb(var(--border-400))]"
            >
              &larr; previous
            </button>
            <p className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {walkStep < WALK.length - 1
                ? `next: ${PHASES.find((p) => p.id === WALK[walkStep + 1]!.phase)!.name}`
                : 'cycle complete -- loops back to Observe'}
            </p>
            <button
              type="button"
              onClick={() => setWalkStep((s) => Math.min(WALK.length - 1, s + 1))}
              disabled={walkStep === WALK.length - 1}
              className="rounded border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/40 px-3 py-1 text-xs font-mono text-rose-700 dark:text-rose-300 hover:bg-rose-100 disabled:opacity-40"
            >
              next &rarr;
            </button>
          </div>
        </div>
      </section>

      {/* ── Comparison table ─────────────────────────────────────────── */}
      <section className="mb-12">
        <header className="mb-4">
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-200">
            OODA vs. the other frameworks on the platform
          </h2>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            OODA is a <strong>process</strong> framework about decision tempo. It does not replace ATT&CK, the Kill
            Chain, or Diamond; it sits underneath them as the cycle that turns their outputs into faster decisions.
          </p>
        </header>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
          <DataTable
            columns={
              [
                {
                  key: 'name',
                  header: 'Framework',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.name,
                  render: (row) => (
                    <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {row.name}
                    </span>
                  ),
                },
                {
                  key: 'kind',
                  header: 'Kind',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.kind,
                  render: (row) => (
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-micro font-mono uppercase tracking-wider ${row.kind === 'process' ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300'}`}
                    >
                      {row.kind}
                    </span>
                  ),
                },
                {
                  key: 'question',
                  header: 'What it answers',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.question,
                  render: (row) => <span className="text-slate-700 dark:text-slate-300">{row.question}</span>,
                },
                {
                  key: 'primaryUser',
                  header: 'Primary user',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.primaryUser,
                  render: (row) => (
                    <span className="text-slate-700 dark:text-slate-300 whitespace-nowrap">{row.primaryUser}</span>
                  ),
                },
                {
                  key: 'platformPage',
                  header: 'On the platform',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.platformPage,
                  render: (row) =>
                    row.platformPage ? (
                      <Link
                        to={row.platformPage}
                        className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:underline font-mono text-xs"
                      >
                        {row.platformPage.replace('/threatintel/', '/ti/').replace('/dfir/', '/d/')}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">&mdash;</span>
                    ),
                },
                {
                  key: 'note',
                  header: 'Note',
                  render: (row) => <span className="text-muted text-xs">{row.note}</span>,
                },
              ] as DataTableColumn<(typeof COMPARISON)[number]>[]
            }
            rows={COMPARISON}
            rowKey={(row) => row.name}
            rowClassName={() =>
              '[&:nth-child(even)]:bg-slate-50/50 dark:[&:nth-child(even)]:bg-[rgb(var(--input-200)/0.5)]'
            }
          />
        </div>
      </section>

      {/* ── References ──────────────────────────────────────────────── */}
      <section>
        <header className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">References</h2>
        </header>
        <ul className="space-y-1.5 text-xs text-muted">
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              John Boyd, "A Discourse on Winning and Losing"
            </strong>{' '}
            &mdash; the 1987 briefing that formalized the OODA loop.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              Robert Coram, "Boyd: The Fighter Pilot Who Changed the Art of War" (2002)
            </strong>{' '}
            &mdash; the biography that carried OODA from military circles into business and cyber.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              "Getting Inside the Enemy's OODA Loop" (Boyd, 1987)
            </strong>{' '}
            &mdash; the tempo argument: act faster than the adversary can react.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              MITRE ATT&CK Blog: "F3EAD: Operationalizing Cyber Threat Intelligence" (2018)
            </strong>{' '}
            &mdash; positions the F2T2EA / F3EAD targeting cycle that OODA tempo drives.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              SANS FOR578 &mdash; Cyber Threat Intelligence
            </strong>{' '}
            &mdash; treats decision cycles (OODA) as the tempo layer under the CTI workflow.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              NIST SP 800-61 rev 2 &mdash; Computer Security Incident Handling Guide
            </strong>{' '}
            &mdash; the IR phases that the Decide and Act steps align to.
          </li>
        </ul>
      </section>
    </DataPageLayout>
  );
}
