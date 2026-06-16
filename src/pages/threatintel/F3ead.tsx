/**
 * /threatintel/f3ead -- F3EAD: Find, Fix, Finish, Exploit, Analyze, Disseminate.
 *
 * Originally a US Special Operations Forces (USSOF) targeting doctrine
 * (descended from F2T2EA in FM 3-05.40 / JP 3-05.1), adapted to Cyber
 * Threat Intelligence by fusing the ops side (Find -> Fix -> Finish)
 * with the intelligence cycle (Exploit -> Analyze -> Disseminate).
 *
 * This page is static (no backend roundtrip) -- the value is the
 * structured doctrine, the platform cross-links, and the concrete
 * incident walkthrough that makes the loop visible. It follows the
 * same pattern as ACH.tsx, InsiderThreatMatrix.tsx, and the other
 * framework pages in the `frameworks` catalog group.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Crosshair,
  MapPin,
  Wrench,
  FlaskConical,
  Brain,
  Megaphone,
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

// ---------------------------------------------------------------------------
// Phase model
// ---------------------------------------------------------------------------

type PhaseId = 'find' | 'fix' | 'finish' | 'exploit' | 'analyze' | 'disseminate';

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
    short: 'Identify the threat',
    icon: MapPin,
    accent: 'from-sky-500/20 to-sky-500/0',
    ringClass: 'ring-sky-400/60 dark:ring-sky-500/40',
    who: 'Intel + SOC (tipping, intel reqs, PIRs, OSINT, dark-web)',
    defenderGoal: 'Surface the actor, campaign, or activity that warrants attention.',
    description:
      'Proactive and reactive identification of adversary activity. The Find phase is fed by intelligence requirements (PIRs), tipping from partners, anomaly reports, and the Disseminate outputs of prior F3EAD cycles.',
    deliverables: [
      'Named actor, campaign, or hypothesis',
      'Priority Intelligence Requirements (PIRs)',
      'Initial collection plan',
    ],
    pitfalls: [
      'Skipping PIRs -- results in undirected hunting and noisy reports.',
      'Treating Find as a one-off. It is continuous; every cycle re-opens it.',
    ],
    attackMapping: 'Maps loosely to ATT&CK Reconnaissance + Resource Development.',
    platformTool: { to: '/threatintel/ach', label: 'ACH (analyze competing hypotheses)' },
  },
  {
    id: 'fix',
    number: 2,
    name: 'Fix',
    short: 'Pinpoint presence in the environment',
    icon: Crosshair,
    accent: 'from-amber-500/20 to-amber-500/0',
    ringClass: 'ring-amber-400/60 dark:ring-amber-500/40',
    who: 'SOC + threat hunting + IR',
    defenderGoal: 'Confirm the adversary is (or was) actually in the environment.',
    description:
      "Hypothesis-driven hunting, detection engineering, and triage. The output of Fix is a concrete set of observed activity in the defender's own telemetry, not just external reporting.",
    deliverables: [
      'Affected hosts, accounts, and time windows',
      'Working detections for the activity',
      'Scope of compromise',
    ],
    pitfalls: [
      'Stopping at "we found a hit" without scope.',
      'Hunting without a hypothesis -- turns into log grep with no conclusion.',
    ],
    attackMapping: 'Covers ATT&CK Initial Access through Execution and Persistence.',
    platformTool: { to: '/dfir/threat-hunt', label: 'Threat hunt workbench' },
  },
  {
    id: 'finish',
    number: 3,
    name: 'Finish',
    short: 'Remove / restrict the threat',
    icon: Wrench,
    accent: 'from-rose-500/20 to-rose-500/0',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'IR + SecOps + asset owners',
    defenderGoal: 'Stop the bleed, evict the actor, restore trust.',
    description:
      'Containment, eradication, and recovery. The action arm of F3EAD. Every Finish action MUST be paired with an Exploit step below -- otherwise the team fixes the symptom and learns nothing for the next cycle.',
    deliverables: [
      'Containment actions (isolate host, revoke token, block IOC)',
      'Eradication + recovery evidence',
      'Operational lessons (what slowed the response?)',
    ],
    pitfalls: [
      'Skipping the "why" -- kicking the actor out without capturing artifacts.',
      'Going loud before Exploit runs -- tipping the actor to change tradecraft.',
    ],
    attackMapping: 'Aligned with NIST SP 800-61 IR phases: Containment, Eradication, Recovery.',
    platformTool: { to: '/dfir/ir-playbooks', label: 'IR playbooks' },
  },
  {
    id: 'exploit',
    number: 4,
    name: 'Exploit',
    short: 'Extract tradecraft & IOCs',
    icon: FlaskConical,
    accent: 'from-fuchsia-500/20 to-fuchsia-500/0',
    ringClass: 'ring-fuchsia-400/60 dark:ring-fuchsia-500/40',
    who: 'IR + DFIR + intel',
    defenderGoal: 'Pull every artifact out of the incident before the cleanup wipes it.',
    description:
      'Acquisition and preservation of evidence: memory, disk, logs, binaries, scripts, persistence mechanisms, infrastructure. Exploit is the bridge between ops and intel -- without it, the analyst has nothing to Analyze.',
    deliverables: [
      'IOCs (hashes, IPs, domains, URLs, JA3, file names, mutexes)',
      'TTPs (ATT&CK technique IDs)',
      'Captured samples + sandbox reports',
    ],
    pitfalls: [
      'Reimaging before triage -- destroying the chain of custody.',
      'IOCs without context. A hash is not intelligence; "this Lazarus loader checks in over ChaCha20/HTTP" is.',
    ],
    attackMapping: 'Sources the data the rest of ATT&CK needs to be useful in your environment.',
    platformTool: { to: '/threatintel/ioc-enrichment', label: 'IOC enrichment & lifecycle' },
  },
  {
    id: 'analyze',
    number: 5,
    name: 'Analyze',
    short: 'Triage, enrich, attribute',
    icon: Brain,
    accent: 'from-emerald-500/20 to-emerald-500/0',
    ringClass: 'ring-emerald-400/60 dark:ring-emerald-500/40',
    who: 'CTI analysts + DFIR',
    defenderGoal: 'Turn artifacts into understanding -- what, who, why, so what.',
    description:
      "Pivot, correlate, enrich, weigh evidence, and either confirm or reject the originating hypothesis. Analyze is where ATT&CK, Diamond Model, ACH, and the platform's own intel bundle come together.",
    deliverables: [
      'Diamond Model event reconstruction',
      'ATT&CK technique / software / group mapping',
      'Updated confidence in attribution (or explicit "unknown")',
    ],
    pitfalls: [
      'Forced attribution. "Unknown actor" is a valid, defensible answer.',
      'Confirmation bias -- the analyst who set the hypothesis should not be the only one testing it.',
    ],
    attackMapping: 'Consumes ATT&CK + Diamond outputs; produces intel that drives the next Find.',
    platformTool: { to: '/threatintel/ach', label: 'Analysis of Competing Hypotheses' },
  },
  {
    id: 'disseminate',
    number: 6,
    name: 'Disseminate',
    short: 'Deliver intel to stakeholders',
    icon: Megaphone,
    accent: 'from-indigo-500/20 to-indigo-500/0',
    ringClass: 'ring-indigo-400/60 dark:ring-indigo-500/40',
    who: 'CTI lead + comms + leadership',
    defenderGoal: 'Right intel, right audience, right format, right time.',
    description:
      "Reports, briefings, signatures, countermeasures, and most importantly: feedback that re-opens the Find phase of the next cycle. Disseminate is the production step that justifies the team's existence to leadership.",
    deliverables: [
      'Executive briefing (1-pager + 5W)',
      'Technical writeup (TTPs, IOCs, ATT&CK mapping)',
      'Detection signatures (Sigma / YARA / Snort / Wazuh)',
    ],
    pitfalls: [
      'Publishing once and stopping. A report with no audience plan is shelfware.',
      'Skipping the feedback loop -- Disseminate must produce the PIRs that start the next cycle.',
    ],
    attackMapping: 'Outputs are what let defenders across the org act on the ATT&CK mapping.',
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
    title: 'Hunt across Next.js footprint',
    prompt:
      'Hypothesis: RSC deserialization RCE probes. Pivot through WAF + load balancer + app logs. Detect the inbound list.txt scanning pattern and the follow-up POST that triggers the RCE.',
    artifacts: [
      'Hypothesis-driven Sigma rule on RSC deserialization signatures',
      'Scope: 3 Next.js 15.x apps in prod, 1 in staging',
    ],
  },
  {
    phase: 'finish',
    title: 'Eradicate the foothold',
    prompt:
      'Isolate the 3 prod apps, rotate secrets, deploy the vendor patch, restore from a known-good image, take a final memory + disk image for Exploit.',
    artifacts: ['IR timeline (NIST SP 800-61)', 'Containment + eradication evidence pack'],
  },
  {
    phase: 'exploit',
    title: 'Pull artifacts before reimage',
    prompt:
      'Capture the loader (Manuscrypt variant), the brndlog.txt config, the MsSecurityObj mutex, the C2 ChaCha20/HTTP traffic, the Akagi64 UAC bypass binary, and the MultiRelay lateral-movement tool.',
    artifacts: [
      'IOCs: file names, mutex, registry key, C2 URI pattern, JA3',
      'TTPs mapped to ATT&CK (T1190, T1548.002, T1055, T1071.001, T1027)',
    ],
  },
  {
    phase: 'analyze',
    title: 'Diamond + ATT&CK + ACH',
    prompt:
      'Build a Diamond event per affected host. Cross-reference ATT&CK technique IDs with the Lazarus software list. Run ACH against competing hypotheses (Lazarus vs. DPRK-aligned unaffiliated vs. false flag).',
    artifacts: [
      'Diamond Model cards (3 hosts)',
      'ACH matrix with diagnostic evidence',
      'Confidence assessment: "high confidence Lazarus, low confidence specific subgroup"',
    ],
  },
  {
    phase: 'disseminate',
    title: 'Brief leadership + push detections',
    prompt:
      "5W briefing for the CISO + technical writeup for SOC + new Sigma / YARA signatures. The IOCs and TTPs also feed the next cycle's Find phase via the intel bundle.",
    artifacts: [
      '5W executive briefing',
      'Technical report (with ATT&CK + Diamond)',
      'Sigma / YARA / Wazuh rules deployed to prod',
      'New PIRs queued for the next cycle',
    ],
  },
];

// ---------------------------------------------------------------------------
// Comparison table: F3EAD vs. the other frameworks on the platform
// ---------------------------------------------------------------------------

interface FrameworkRow {
  name: string;
  kind: 'process' | 'content';
  question: string;
  primaryUser: string;
  platformPage: string;
  note: string;
}

const COMPARISON: FrameworkRow[] = [
  {
    name: 'F3EAD',
    kind: 'process',
    question: 'How does the team operate end-to-end on a target?',
    primaryUser: 'CTI + SOC + IR',
    platformPage: '/threatintel/f3ead',
    note: 'Closes the ops-intel feedback loop. Pairs with every other framework here.',
  },
  {
    name: 'Lockheed Kill Chain',
    kind: 'content',
    question: 'What phases did the intrusion pass through?',
    primaryUser: 'DFIR + SOC',
    platformPage: '/dfir/kill-chain',
    note: 'Linear, 7 phases. Criticised for being too sequential for modern intrusions.',
  },
  {
    name: 'MITRE ATT&CK',
    kind: 'content',
    question: 'Which specific techniques did the adversary use?',
    primaryUser: 'Detection eng + CTI',
    platformPage: '/threatintel/mitre',
    note: 'The shared vocabulary. F3EAD uses ATT&CK inside the Analyze phase.',
  },
  {
    name: 'Diamond Model',
    kind: 'content',
    question: 'Who did what to whom, and how?',
    primaryUser: 'CTI + IR',
    platformPage: '/dfir/diamond',
    note: 'Per-event reconstruction. Slots into Analyze.',
  },
  {
    name: 'ACH',
    kind: 'process',
    question: 'Which hypothesis best explains the evidence?',
    primaryUser: 'CTI analysts',
    platformPage: '/threatintel/ach',
    note: 'Structured analytic technique used inside the Analyze phase.',
  },
  {
    name: 'Insider Threat Matrix',
    kind: 'content',
    question: 'What motive, means, preparation, or infringement is in play?',
    primaryUser: 'Insider-threat teams',
    platformPage: '/threatintel/insider-threat-matrix',
    note: 'Domain-specific framework. Sits inside Fix for insider-led cases.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function F3ead(): JSX.Element {
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
      title="F3EAD: Find, Fix, Finish, Exploit, Analyze, Disseminate"
      description={
        <>
          Originally a US Special Operations Forces (USSOF) targeting doctrine, F3EAD fuses the operations side (Find
          &rarr; Fix &rarr; Finish) with the intelligence cycle (Exploit &rarr; Analyze &rarr; Disseminate). Adapted to
          Cyber Threat Intelligence to close the ops&ndash;intel gap. The key insight: the cycle is a <em>loop</em>, not
          a pipeline -- Disseminate feeds the Find of the next cycle.
        </>
      }
      maxWidthClass="max-w-7xl"
    >
      {/* ── The loop diagram ─────────────────────────────────────────── */}
      <section className="mb-12">
        <header className="flex items-end justify-between mb-4">
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-200">The F3EAD loop</h2>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 hidden sm:block">
            ops &rarr; intel &rarr; feedback to ops
          </p>
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
                  className={`w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 ring-1 ${p.ringClass} hover:shadow-e1 transition-shadow`}
                >
                  <div
                    className={`absolute inset-0 rounded-lg bg-gradient-to-br ${p.accent} pointer-events-none opacity-60`}
                  />
                  <div className="relative flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-600 dark:text-slate-300">
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
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{p.short}</p>
                  </div>
                </button>
                {/* Loop arrow back to Find on the last card. */}
                {isLast && (
                  <div className="hidden lg:flex absolute -bottom-3 left-1/2 -translate-x-1/2 items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
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
              <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className={`rounded-md p-2 ring-1 ${p.ringClass} bg-white dark:bg-slate-900`}>
                    <PIcon className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {p.number}. {p.name} &mdash; {p.short}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{p.description}</p>
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
                          className="inline-flex items-center gap-1.5 rounded border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/40 px-3 py-1.5 text-xs font-mono text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-950/60"
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
            Walk an incident through F3EAD
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
            A 6-step click-through using the Lazarus / Copperhedge sample already in the platform's
            <Link to="/threatintel/ai-report" className="text-brand-600 dark:text-brand-400 hover:underline mx-1">
              AI Report showcase
            </Link>
            as the running example. Click a step to jump to that phase.
          </p>
        </header>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
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
                  className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-mono transition-colors ${
                    active
                      ? 'border-brand-400 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
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
            <div className={`rounded-md p-2 ring-1 ${currentPhase.ringClass} bg-slate-50 dark:bg-slate-950`}>
              <WalkIcon className="h-5 w-5 text-slate-700 dark:text-slate-200" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Step {walkStep + 1} of {WALK.length} &middot; {currentPhase.name}
              </p>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{currentWalk.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{currentWalk.prompt}</p>
            </div>
          </div>

          <div className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
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
              className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 hover:border-brand-400 disabled:opacity-40 disabled:hover:border-slate-300 dark:disabled:hover:border-slate-700"
            >
              &larr; previous
            </button>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {walkStep < WALK.length - 1
                ? `next: ${PHASES.find((p) => p.id === WALK[walkStep + 1]!.phase)!.name}`
                : 'cycle complete -- loops back to Find'}
            </p>
            <button
              type="button"
              onClick={() => setWalkStep((s) => Math.min(WALK.length - 1, s + 1))}
              disabled={walkStep === WALK.length - 1}
              className="rounded border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/40 px-3 py-1 text-xs font-mono text-brand-700 dark:text-brand-300 hover:bg-brand-100 disabled:opacity-40"
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
            F3EAD vs. the other frameworks on the platform
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
            F3EAD is a <strong>process</strong> framework. It does not replace ATT&CK, the Kill Chain, or Diamond; it
            sits beside them as the loop that turns their outputs into action.
          </p>
        </header>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-left">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Framework
                </th>
                <th className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Kind
                </th>
                <th className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  What it answers
                </th>
                <th className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Primary user
                </th>
                <th className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  On the platform
                </th>
                <th className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr
                  key={row.name}
                  className={`border-b border-slate-100 dark:border-slate-900 ${i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-950/50'}`}
                >
                  <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${
                        row.kind === 'process'
                          ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {row.kind}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{row.question}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">{row.primaryUser}</td>
                  <td className="px-3 py-2">
                    <Link
                      to={row.platformPage}
                      className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline font-mono text-xs"
                    >
                      {row.platformPage.replace('/threatintel/', '/ti/').replace('/dfir/', '/d/')}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-xs">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── References ──────────────────────────────────────────────── */}
      <section>
        <header className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">References</h2>
        </header>
        <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
          <li>
            <strong className="text-slate-800 dark:text-slate-200">FM 3-05.40 (Army Special Operations Forces)</strong>{' '}
            &mdash; the doctrinal origin of the F2T2EA / F3EAD targeting cycle.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">JP 3-05.1 (Joint Special Operations)</strong> &mdash;
            joint doctrine for the targeting pipeline F3EAD is derived from.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              SANS FOR578 &mdash; Cyber Threat Intelligence
            </strong>{' '}
            &mdash; the canonical CTI adaptation of F3EAD taught in industry training.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              CREST (UK) &mdash; Cyber Threat Intelligence maturity guidance
            </strong>{' '}
            &mdash; the ops&ndash;intel feedback loop is treated as a maturity marker.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              MITRE ATT&CK Blog: "F3EAD: Operationalizing Cyber Threat Intelligence" (2018)
            </strong>{' '}
            &mdash; the write-up that pushed F3EAD from SOF doctrine into the CTI mainstream.
          </li>
          <li>
            <strong className="text-slate-800 dark:text-slate-200">
              NIST SP 800-61 rev 2 &mdash; Computer Security Incident Handling Guide
            </strong>{' '}
            &mdash; the IR phases (Preparation, Detection &amp; Analysis, Containment, Eradication, Recovery,
            Post-Incident Activity) that the Finish phase aligns to.
          </li>
        </ul>
      </section>
    </DataPageLayout>
  );
}
