/**
 * /threatintel/f2t2ea -- F2T2EA: Find, Fix, Track, Target, Engage, Assess.
 *
 * The US joint targeting cycle (JP 3-60) from which F3EAD descends.
 * F3EAD collapses Track/Target/Engage into Finish and swaps Assess for
 * the intelligence cycle (Exploit -> Analyze -> Disseminate); F2T2EA is
 * the ops-pure original -- no explicit intelligence feedback loop, the
 * Assess phase carries the learning instead.
 *
 * This page is static (no backend roundtrip) -- the value is the
 * structured doctrine, the platform cross-links, and the concrete
 * incident walkthrough that makes the loop visible. It follows the
 * same pattern as F3ead.tsx and the other framework pages in the
 * `frameworks` catalog group.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Crosshair,
  Radar,
  Satellite,
  Target,
  Zap,
  Gauge,
  Wrench,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ArrowRight,
  CircleDot,
  CheckCircle2,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';

// ---------------------------------------------------------------------------
// Phase model
// ---------------------------------------------------------------------------

type PhaseId = 'find' | 'fix' | 'track' | 'target' | 'engage' | 'assess';

interface Phase {
  id: PhaseId;
  number: number;
  name: string;
  short: string;
  icon: typeof Crosshair;
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
    id: 'find',
    number: 1,
    name: 'Find',
    short: 'Locate the target',
    icon: Radar,
    accent: 'bg-sky-500/10',
    ringClass: 'ring-sky-400/60 dark:ring-sky-500/40',
    who: 'Intel + SOC (tipping, intel reqs, PIRs, OSINT, dark-web)',
    defenderGoal: 'Discover the adversary, campaign, or asset that warrants action.',
    description:
      'The collection half of the cycle: identify targets of interest from PIRs, partner tipping, anomaly reports, and the Assess outputs of prior cycles. In F2T2EA, Find is deliberately broad -- you locate before you decide anything about the target.',
    deliverables: [
      'Named target (host, account, domain, or infrastructure set)',
      'Priority Intelligence Requirements (PIRs)',
      'Initial collection plan',
    ],
    pitfalls: [
      'Skipping PIRs -- results in undirected collection and noisy leads.',
      'Confusing Find with Fix. Locating is not the same as pinning the target down.',
    ],
    attackMapping: 'Maps loosely to ATT&CK Reconnaissance + Resource Development.',
    platformTool: { to: '/threatintel/ach', label: 'ACH (analyze competing hypotheses)' },
  },
  {
    id: 'fix',
    number: 2,
    name: 'Fix',
    short: 'Pin the target in time and space',
    icon: Crosshair,
    accent: 'bg-amber-500/10',
    ringClass: 'ring-amber-400/60 dark:ring-amber-500/40',
    who: 'SOC + threat hunting + IR',
    defenderGoal: 'Confirm exactly where the target is, with enough certainty to act.',
    description:
      "Fix is where a lead becomes a location. The analyst confirms the target's presence with corroborating telemetry -- IPs, hostnames, hashes, accounts, timestamps -- and drops any target that cannot be fixed. A target you cannot Fix is a target you cannot Engage.",
    deliverables: [
      'Confirmed location / identity (IP, host, account, domain)',
      'Corroborating evidence set',
      'Time window of activity',
    ],
    pitfalls: [
      'Acting on an unverified tip -- Engagement on a ghost wastes the team.',
      'Stopping at one source. Fix requires independent corroboration.',
    ],
    attackMapping: 'Covers ATT&CK Initial Access through Execution and Persistence.',
    platformTool: { to: '/dfir/threat-hunt', label: 'Threat hunt workbench' },
  },
  {
    id: 'track',
    number: 3,
    name: 'Track',
    short: 'Maintain continuous surveillance',
    icon: Satellite,
    accent: 'bg-cyan-500/10',
    ringClass: 'ring-cyan-400/60 dark:ring-cyan-500/40',
    who: 'SOC + threat hunting (sustained monitoring)',
    defenderGoal: 'Keep eyes on the target so it cannot slip away before Engage.',
    description:
      'Continuous monitoring of the fixed target -- movement, infrastructure churn, beaconing, command-and-control changes. Track is the phase F3EAD absorbed into Finish; in F2T2EA it is its own discipline because the target may sit for days or weeks before the decision to engage.',
    deliverables: [
      'Surveillance timeline (beaconing / logins / infra changes)',
      'Tracked target status board',
      'Change alerts (new IPs, domains, hashes)',
    ],
    pitfalls: [
      'Letting Track go stale -- the target moves and the team engages the ghost.',
      'Tracking so passively that the target is lost in log noise.',
    ],
    attackMapping: 'Covers ATT&CK Command and Control + lateral movement observation.',
    platformTool: { to: '/threatintel/iocs/c2', label: 'C2 tracker' },
  },
  {
    id: 'target',
    number: 4,
    name: 'Target',
    short: 'Decide what to do to it',
    icon: Target,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'IR + SecOps + leadership (decision authority)',
    defenderGoal: 'Choose the engagement option that achieves the desired effect.',
    description:
      'The decision gate: pick the action -- block, sinkhole, isolate, evict, takedown, or simply continue tracking -- and the desired effect. Targeting is where rules of engagement, legality, and operational risk get weighed. In a defender context it is also where you decide what NOT to touch.',
    deliverables: [
      'Engagement option + desired effect',
      'Rules of engagement / legal review',
      'Contingency plan (what if the action fails or tips the actor)',
    ],
    pitfalls: [
      'Choosing an option without an exit criteria -- the action becomes open-ended.',
      'Forgetting that Engage has second-order effects (tipping, collateral).',
    ],
    attackMapping: 'Aligned with NIST SP 800-61 IR decision gates: Containment strategy selection.',
    platformTool: { to: '/dfir/ir-playbooks', label: 'IR playbooks' },
  },
  {
    id: 'engage',
    number: 5,
    name: 'Engage',
    short: 'Execute the action',
    icon: Zap,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'IR + SecOps + asset owners',
    defenderGoal: 'Deliver the chosen action precisely and capture the result.',
    description:
      'Execution: block the IOC, isolate the host, sinkhole the domain, revoke the token, apply the containment. Engage in F2T2EA is the ops arm -- in F3EAD this merges into Finish. Every Engage should be paired with evidence capture so Assess has something to measure.',
    deliverables: [
      'Executed action log (what, when, where, by whom)',
      'Before/after telemetry for assessment',
      'Collateral-damage report if the action was broad',
    ],
    pitfalls: [
      'Engaging without a captured baseline -- Assess becomes guesswork.',
      'Going loud before the plan is approved -- tipping the actor during Target review.',
    ],
    attackMapping: 'Aligned with NIST SP 800-61 IR phases: Containment, Eradication, Recovery.',
    platformTool: { to: '/dfir/blocklists', label: 'Blocklists (exportable)' },
  },
  {
    id: 'assess',
    number: 6,
    name: 'Assess',
    short: 'Measure the effect, feed the next cycle',
    icon: Gauge,
    accent: 'bg-emerald-500/10',
    ringClass: 'ring-emerald-400/60 dark:ring-emerald-500/40',
    who: 'CTI analysts + IR',
    defenderGoal: 'Determine whether the engagement achieved its desired effect.',
    description:
      "Compare the post-Engage state against the desired effect: did the beaconing stop? Did the actor re-tool? Is the host clean? Assess closes the loop -- its findings become new PIRs and targets for the next cycle's Find. This is the phase F3EAD replaced with the full intelligence cycle (Exploit / Analyze / Disseminate).",
    deliverables: [
      'Effectiveness assessment vs. desired effect',
      'Lessons learned (what slowed the cycle?)',
      'New PIRs / re-targeting recommendations',
    ],
    pitfalls: [
      'Skipping Assess -- the cycle becomes a fire-drill with no learning.',
      'Measuring activity instead of effect (counted blocks, not stopped intrusions).',
    ],
    attackMapping: 'Produces the feedback that drives the next cycle of ATT&CK-mapped activity.',
    platformTool: { to: '/threatintel/briefings', label: 'Briefings & writeups' },
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
    phase: 'find',
    title: 'Tip: Lazarus exploiting CVE-2025-55182',
    prompt:
      'A partner feed + a CTF IoC report named Lazarus exploiting CVE-2025-55182 against financial / blockchain infra. The platform pulls the sample into the AI Report showcase.',
    artifacts: [
      'PIR: "Is Lazarus using CVE-2025-55182 against our React/Next.js surface?"',
      'Initial collection plan: greynoise + ctfiot + our perimeter logs',
    ],
  },
  {
    phase: 'fix',
    title: 'Pin the RCE to a specific host',
    prompt:
      'Corroborate the tip: the list.txt scanning pattern hits one Next.js 15.x prod app, and the follow-up POST that triggers the RSC deserialization RCE lands on the same origin. Three independent log sources agree.',
    artifacts: ['Fixed target: origin host + app + time window', 'Corroborating evidence set (WAF + LB + app logs)'],
  },
  {
    phase: 'track',
    title: 'Watch the C2 channel',
    prompt:
      'Sustain monitoring: the loader checks in over ChaCha20/HTTP to a rotating set of C2 domains. Track infra churn and new beacons for 48h while the legal/ROE review runs.',
    artifacts: ['C2 domain / IP rotation timeline', 'Beaconing frequency + JA3 fingerprint log'],
  },
  {
    phase: 'target',
    title: 'Decide: sinkhole vs. block vs. evict',
    prompt:
      'Weigh options against the desired effect (stop exfiltration, preserve evidence, avoid tipping). Decision: perimeter-block the C2 domains + isolate the 3 prod apps, with the vendor patch staged for the same window.',
    artifacts: ['Engagement option + desired effect', 'ROE / legal sign-off + exit criteria'],
  },
  {
    phase: 'engage',
    title: 'Execute the containment window',
    prompt:
      'Block the C2 domains at the perimeter, isolate the 3 prod apps, rotate secrets, deploy the vendor patch. Capture before/after telemetry and a final memory + disk image during the same window.',
    artifacts: ['Action log (blocklist entries, isolation, patching)', 'Before/after beacon counts for Assess'],
  },
  {
    phase: 'assess',
    title: 'Did the beacons stop?',
    prompt:
      'Compare post-Engage telemetry: beaconing drops to zero on blocked domains, but the actor starts probing a staging Next.js app with the same technique 12h later. Assess produces new PIRs and re-opens Find for the staging surface.',
    artifacts: ['Effectiveness assessment (stopped, but actor re-tooling)', 'Lessons + new PIRs for the next cycle'],
  },
];

// ---------------------------------------------------------------------------
// Comparison table: F2T2EA vs. F3EAD and the other frameworks
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
    name: 'F2T2EA',
    kind: 'process',
    question: 'How do we locate, track, and act on a target?',
    primaryUser: 'Ops + IR (targeting)',
    platformPage: '/threatintel/f2t2ea',
    note: 'The joint targeting cycle. Ops-pure -- the Assess phase carries the learning.',
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
    note: 'Linear, 7 phases. Describes the intrusion, not the targeting decision.',
  },
  {
    name: 'Cyber Kill Chain v2',
    kind: 'content',
    question: 'How do multiple intrusions and lateral movement fit the chain?',
    primaryUser: 'DFIR + SOC',
    platformPage: '/threatintel/kill-chain-v2',
    note: "Lockheed Martin's 2015 extension -- adds lateral movement and campaign-level tracking to the original chain.",
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
    name: 'OODA Loop',
    kind: 'process',
    question: 'How fast can we decide and act?',
    primaryUser: 'IR + SOC (tempo)',
    platformPage: '/threatintel/ooda',
    note: "Boyd's Observe-Orient-Decide-Act decision cycle. Not a targeting framework -- the inner loop that sets the tempo F2T2EA runs at.",
  },
  {
    name: 'MITRE ATT&CK',
    kind: 'content',
    question: 'Which specific techniques did the adversary use?',
    primaryUser: 'Detection eng + CTI',
    platformPage: '/threatintel/mitre',
    note: 'The shared vocabulary. F2T2EA maps its phases onto ATT&CK tactics.',
  },
  {
    name: 'Diamond Model',
    kind: 'content',
    question: 'Who did what to whom, and how?',
    primaryUser: 'CTI + IR',
    platformPage: '/dfir/diamond',
    note: 'Per-event reconstruction. Helps Fix and Assess.',
  },
  {
    name: 'ACH',
    kind: 'process',
    question: 'Which hypothesis best explains the evidence?',
    primaryUser: 'CTI analysts',
    platformPage: '/threatintel/ach',
    note: 'Structured analytic technique used inside Fix and Assess.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function F2t2ea(): JSX.Element {
  const [openPhase, setOpenPhase] = useState<PhaseId | null>('find');
  const [walkStep, setWalkStep] = useState<number>(0);

  const currentWalk = WALK[walkStep]!;
  const currentPhase = PHASES.find((p) => p.id === currentWalk.phase)!;
  const WalkIcon = currentPhase.icon;

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Crosshair size={28} />}
      title="F2T2EA: Find, Fix, Track, Target, Engage, Assess"
      description={
        <>
          The US joint targeting cycle (JP 3-60) that F3EAD descends from. F2T2EA is the ops-pure original: Find &rarr;
          Fix &rarr; Track &rarr; Target &rarr; Engage &rarr; Assess. Adapted to Cyber Threat Intelligence it is the
          discipline of <em>locating</em> an adversary, <em>pinning</em> it down, <em>watching</em> it,{' '}
          <em>deciding</em> what to do, <em>doing</em> it, and <em>measuring</em> the result. The key insight: Assess
          feeds the Find of the next cycle -- the loop is what makes targeting repeatable.
        </>
      }
      maxWidthClass="max-w-7xl"
    >
      {/* ── The loop diagram ─────────────────────────────────────────── */}
      <section className="mb-12">
        <header className="flex items-end justify-between mb-4">
          <h2 className="text-xl font-display font-semibold text-heading">The F2T2EA loop</h2>
          <p className="text-xs font-mono text-muted hidden sm:block">locate &rarr; act &rarr; feedback to locate</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 relative">
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
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-xs font-mono text-body">
                        {p.number}
                      </span>
                      <Icon className="h-4 w-4 text-body" />
                    </div>
                    {openPhase === p.id ? (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                  <div className="relative mt-2">
                    <h3 className="text-base font-semibold text-heading">{p.name}</h3>
                    <p className="text-xs text-muted mt-0.5">{p.short}</p>
                  </div>
                </button>
                {/* Loop arrow back to Find on the last card. */}
                {isLast && (
                  <div className="hidden lg:flex absolute -bottom-3 left-1/2 -translate-x-1/2 items-center gap-1 text-micro font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-300 bg-white dark:bg-[rgb(var(--surface-200))] px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))]">
                    <Sparkles className="h-3 w-3" /> loops back to Find
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
                    <PIcon className="h-5 w-5 text-body" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-heading">
                      {p.number}. {p.name} &mdash; {p.short}
                    </h3>
                    <p className="text-sm text-muted mt-1">{p.description}</p>
                    <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <dt className="font-mono uppercase tracking-wider text-muted">Who</dt>
                        <dd className="text-heading">{p.who}</dd>
                      </div>
                      <div>
                        <dt className="font-mono uppercase tracking-wider text-muted">Defender goal</dt>
                        <dd className="text-heading">{p.defenderGoal}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-mono uppercase tracking-wider text-muted">Primary deliverables</dt>
                        <dd>
                          <ul className="mt-1 space-y-0.5">
                            {p.deliverables.map((d) => (
                              <li key={d} className="flex items-start gap-1.5 text-heading">
                                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-mono uppercase tracking-wider text-muted">Common pitfalls</dt>
                        <dd>
                          <ul className="mt-1 space-y-0.5">
                            {p.pitfalls.map((d) => (
                              <li key={d} className="flex items-start gap-1.5 text-heading">
                                <CircleDot className="h-3.5 w-3.5 mt-0.5 text-rose-600 dark:text-rose-300 shrink-0" />
                                <span>{d}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-mono uppercase tracking-wider text-muted">Framework mapping</dt>
                        <dd className="text-heading">{p.attackMapping}</dd>
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
          <h2 className="text-xl font-display font-semibold text-heading">Walk an incident through F2T2EA</h2>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            A 6-step click-through using the Lazarus / Copperhedge sample already in the platform's
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
              <WalkIcon className="h-5 w-5 text-body" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-micro font-mono uppercase tracking-wider text-muted">
                Step {walkStep + 1} of {WALK.length} &middot; {currentPhase.name}
              </p>
              <h3 className="text-base font-semibold text-heading mt-0.5">{currentWalk.title}</h3>
              <p className="text-sm text-muted mt-1">{currentWalk.prompt}</p>
            </div>
          </div>

          <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3">
            <p className="text-micro font-mono uppercase tracking-wider text-muted mb-1.5">
              Artifacts produced at this step
            </p>
            <ul className="space-y-1">
              {currentWalk.artifacts.map((a) => (
                <li key={a} className="flex items-start gap-1.5 text-xs text-heading">
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
              className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-3 py-1 text-xs font-mono text-body hover:border-rose-400 disabled:opacity-40 disabled:hover:border-slate-300 dark:disabled:hover:border-[rgb(var(--border-400))]"
            >
              &larr; previous
            </button>
            <p className="text-micro font-mono uppercase tracking-wider text-muted">
              {walkStep < WALK.length - 1
                ? `next: ${PHASES.find((p) => p.id === WALK[walkStep + 1]!.phase)!.name}`
                : 'cycle complete -- loops back to Find'}
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
          <h2 className="text-xl font-display font-semibold text-heading">
            F2T2EA vs. the other frameworks on the platform
          </h2>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            F2T2EA is a <strong>process</strong> framework from joint targeting doctrine. It does not replace ATT&CK,
            the Kill Chain, or Diamond; it sits beside them as the loop that turns their outputs into a decision to act.
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
                  render: (row) => <span className="font-semibold text-heading whitespace-nowrap">{row.name}</span>,
                },
                {
                  key: 'kind',
                  header: 'Kind',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.kind,
                  render: (row) => (
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-micro font-mono uppercase tracking-wider ${row.kind === 'process' ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-body'}`}
                    >
                      {row.kind}
                    </span>
                  ),
                },
                {
                  key: 'question',
                  header: 'What it answers',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.question,
                  render: (row) => <span className="text-body">{row.question}</span>,
                },
                {
                  key: 'primaryUser',
                  header: 'Primary user',
                  sortValue: (row: (typeof COMPARISON)[number]) => row.primaryUser,
                  render: (row) => <span className="text-body whitespace-nowrap">{row.primaryUser}</span>,
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
          <h2 className="text-base font-semibold text-heading">References</h2>
        </header>
        <ul className="space-y-1.5 text-xs text-muted">
          <li>
            <strong className="text-heading">JP 3-60 (Joint Targeting)</strong> &mdash; the joint doctrine that codifies
            the Find&ndash;Fix&ndash;Track&ndash;Target&ndash;Engage&ndash;Assess cycle.
          </li>
          <li>
            <strong className="text-heading">FM 3-05.40 (Army Special Operations Forces)</strong> &mdash; the doctrinal
            source the F2T2EA / F3EAD targeting cycle descends from.
          </li>
          <li>
            <strong className="text-heading">JP 3-05.1 (Joint Special Operations)</strong> &mdash; joint
            special-operations doctrine that adapts F2T2EA into the F3EAD process. See the{' '}
            <Link to="/threatintel/f3ead" className="text-rose-600 dark:text-rose-400 hover:underline">
              full F3EAD reference page
            </Link>
            .
          </li>
          <li>
            <strong className="text-heading">SANS FOR578 &mdash; Cyber Threat Intelligence</strong> &mdash; teaches
            F3EAD (the F2T2EA descendant) as the canonical CTI workflow.
          </li>
          <li>
            <strong className="text-heading">
              MITRE ATT&CK Blog: "F3EAD: Operationalizing Cyber Threat Intelligence" (2018)
            </strong>{' '}
            &mdash; traces the lineage from joint targeting (F2T2EA) to the CTI mainstream.
          </li>
          <li>
            <strong className="text-heading">
              NIST SP 800-61 rev 2 &mdash; Computer Security Incident Handling Guide
            </strong>{' '}
            &mdash; the IR phases (Preparation, Detection &amp; Analysis, Containment, Eradication, Recovery,
            Post-Incident Activity) that Target and Engage align to.
          </li>
        </ul>
      </section>
    </DataPageLayout>
  );
}
