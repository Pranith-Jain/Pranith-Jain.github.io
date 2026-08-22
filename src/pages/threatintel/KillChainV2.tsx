/**
 * /threatintel/kill-chain-v2 -- Cyber Kill Chain v2.
 *
 * Lockheed Martin's 2015 extension of the original 2011 Cyber Kill Chain
 * (Hutchins, Cloppert, Amin). The original seven phases describe a single
 * intrusion; v2 adds an explicit Lateral Movement phase (post-exploitation
 * is where modern intrusions actually live) and a Campaign overlay -- one
 * actor runs multiple concurrent intrusions, so defenders must track the
 * chain per-intrusion AND across the campaign.
 *
 * This page is static (no backend roundtrip) -- the value is the
 * structured doctrine, the platform cross-links, and the concrete
 * incident walkthrough that makes the chain visible. It follows the
 * same pattern as F3ead.tsx, F2t2ea.tsx, Ooda.tsx, and the other
 * framework pages in the `frameworks` catalog group.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Crosshair,
  Search,
  FlaskConical,
  Send,
  Bug,
  Wrench,
  MoveHorizontal,
  Radio,
  Flag,
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

type PhaseId = 'recon' | 'weaponize' | 'deliver' | 'exploit' | 'install' | 'lateral' | 'c2' | 'actions';

interface Phase {
  id: PhaseId;
  number: number;
  name: string;
  short: string;
  icon: typeof Search;
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
    id: 'recon',
    number: 1,
    name: 'Reconnaissance',
    short: 'Research, identify, select targets',
    icon: Search,
    accent: 'bg-sky-500/10',
    ringClass: 'ring-sky-400/60 dark:ring-sky-500/40',
    who: 'Intel + SOC (detection is mostly passive here)',
    defenderGoal: 'Reduce attack surface and detect targeted scanning that crosses into active recon.',
    description:
      'The attacker harvests information about the target -- people, technology, infrastructure, partner networks, exposed services. Most of this is passive (OSINT) and indistinguishable from legitimate research, which is why the phase is so hard to detect.',
    deliverables: [
      'Named target profile (people, tech, infra)',
      "Exposed-service inventory (from the attacker's perspective)",
      'Likely initial-access vectors',
    ],
    pitfalls: [
      'Treating passive OSINT as undetectable -- it is, but the planning it feeds is not.',
      'Ignoring brand-impersonation prep (lookalike domains, IDN homographs).',
    ],
    attackMapping: 'Maps to ATT&CK Reconnaissance (TA0043) + Resource Development (TA0042).',
    platformTool: { to: '/threatintel/external/awesome', label: 'OSINT / recon resources' },
  },
  {
    id: 'weaponize',
    number: 2,
    name: 'Weaponization',
    short: 'Couple a payload with a deliverable',
    icon: FlaskConical,
    accent: 'bg-amber-500/10',
    ringClass: 'ring-amber-400/60 dark:ring-amber-500/40',
    who: 'Intel (mostly invisible to the defender)',
    defenderGoal: 'Make weaponized artifacts ineffective by hardening the runtime they target.',
    description:
      'Attacker pairs an exploit / capability with a deliverable artifact -- a maldoc, an HTML-smuggling page, a malicious LNK, a poisoned package, an ISO. This phase happens almost entirely on attacker infrastructure, so the defender rarely sees it directly.',
    deliverables: [
      'Weaponized artifact inventory (maldoc, ISO, LNK, package)',
      'YARA / static signatures for known weaponization',
      'Hardening checklist for the targeted runtime',
    ],
    pitfalls: [
      'Skipping sandbox detonation of unknown attachments at the boundary.',
      'Assuming application allowlisting covers everything -- LOLBins still slip through.',
    ],
    attackMapping: 'Maps to ATT&CK Execution (TA0002) + Defense Evasion (TA0005) technique prep.',
    platformTool: { to: '/dfir/sandbox', label: 'Malware sandbox' },
  },
  {
    id: 'deliver',
    number: 3,
    name: 'Delivery',
    short: 'Transmit the weapon to the target',
    icon: Send,
    accent: 'bg-cyan-500/10',
    ringClass: 'ring-cyan-400/60 dark:ring-cyan-500/40',
    who: 'SOC + mail/web security (first observable phase)',
    defenderGoal: 'Block at the boundary; if it reaches a user, give them the cues to refuse it.',
    description:
      'The artifact crosses the perimeter -- usually by email, less often by web download, removable media, supply-chain update, or trusted partner network. This is the first phase the defender can normally observe.',
    deliverables: [
      'Blocked / allowed delivery events',
      'Phishing-adjacent telemetry (DMARC, headers, sender lookalikes)',
      'User-facing cues (MOTW, browser isolation)',
    ],
    pitfalls: [
      'Blocking the known-bad but missing the novel -- the attacker just changes the TLD.',
      'Relying on the user to catch it; delivery is where humans are the control.',
    ],
    attackMapping:
      'Maps to ATT&CK Initial Access (TA0001): Phishing, Drive-by, Supply Chain, External Remote Services.',
    platformTool: { to: '/dfir/phishing', label: 'Phishing analyzer' },
  },
  {
    id: 'exploit',
    number: 4,
    name: 'Exploitation',
    short: 'Trigger the weapon to run code',
    icon: Bug,
    accent: 'bg-violet-500/10',
    ringClass: 'ring-violet-400/60 dark:ring-violet-500/40',
    who: 'SOC + EDR + IR',
    defenderGoal: 'Detect the moment-of-execution; minimise blast radius via sandboxing.',
    description:
      'A vulnerability -- software CVE, configuration weakness, or human decision -- is triggered. The artifact transitions from "data" to "running code" inside the victim environment. This is the point where endpoint telemetry becomes decisive.',
    deliverables: [
      'Execution event (process tree, parent-child chain)',
      'Vulnerability / CVE context (KEV status, EPSS)',
      'Blast-radius assessment',
    ],
    pitfalls: [
      'Missing the child-process anomaly (Office spawning cmd).',
      'Stopping at the alert without reconstructing the full process tree.',
    ],
    attackMapping: 'Maps to ATT&CK Execution (TA0002) techniques incl. T1204, T1190, T1203, T1528.',
    platformTool: { to: '/dfir/cve', label: 'CVE lookup (KEV + EPSS)' },
  },
  {
    id: 'install',
    number: 5,
    name: 'Installation',
    short: 'Establish persistence on the target',
    icon: Wrench,
    accent: 'bg-emerald-500/10',
    ringClass: 'ring-emerald-400/60 dark:ring-emerald-500/40',
    who: 'IR + DFIR (first clearly forensic phase)',
    defenderGoal: 'Catch persistence creation in real time; detect anomalies on next boot/login.',
    description:
      'Attacker installs persistence so they survive reboots, password resets, and short attention spans. Often the first phase that creates clearly forensic artifacts on disk / in identity stores.',
    deliverables: [
      'Persistence mechanisms (services, autoruns, accounts, webshells)',
      'Sysmon / audit-log deltas',
      'Forensic artifacts for later analysis',
    ],
    pitfalls: [
      'Missing the new account or scheduled task until it is too late.',
      'Assuming patching the entry vector removes the persistence.',
    ],
    attackMapping: 'Maps to ATT&CK Persistence (TA0003) + Privilege Escalation (TA0004) techniques.',
    platformTool: { to: '/dfir/winreg', label: 'Windows registry artifacts' },
  },
  {
    id: 'lateral',
    number: 6,
    name: 'Lateral Movement',
    short: 'Spread across the environment',
    icon: MoveHorizontal,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'SOC + threat hunting + IR',
    defenderGoal: 'Detect and sever east-west movement before the actor reaches the crown jewels.',
    description:
      'The phase v2 adds to the original chain: post-exploitation is where modern intrusions actually live. The attacker pivots from the beachhead to other hosts -- credential theft, pass-the-hash, remote services, scheduled-task hijacking -- to reach the objective. Most ransomware intrusions are lateral-movement-first.',
    deliverables: [
      'Movement timeline (host-to-host, account-to-account)',
      'Credential-reuse / exposure assessment',
      'Containment decision (segment, isolate, rotate)',
    ],
    pitfalls: [
      'Only hunting north-south (perimeter) traffic while the actor moves east-west.',
      'Leaving service accounts unmonitored -- the favourite lateral vehicle.',
    ],
    attackMapping: 'Maps to ATT&CK Lateral Movement (TA0008) + Credential Access (TA0006) techniques.',
    platformTool: { to: '/dfir/threat-hunt', label: 'Threat hunt workbench' },
  },
  {
    id: 'c2',
    number: 7,
    name: 'Command & Control (C2)',
    short: 'Open a channel back to attacker infrastructure',
    icon: Radio,
    accent: 'bg-cyan-500/10',
    ringClass: 'ring-cyan-400/60 dark:ring-cyan-500/40',
    who: 'SOC + network monitoring',
    defenderGoal: 'Detect beaconing patterns and unusual cloud traffic; sever the channel.',
    description:
      'The implant calls home for instructions. Modern C2 hides in HTTPS to popular CDNs, DNS, MQTT, or trusted SaaS (Slack, Discord, Telegram bots). This is the longest-duration phase of an intrusion and the one most reliably visible on egress telemetry.',
    deliverables: [
      'Beaconing timeline (jitter, intervals, JA3/JA4 fingerprints)',
      'C2 domain / IP inventory (incl. infra churn)',
      'Egress-block / sinkhole candidates',
    ],
    pitfalls: [
      'Missing low-and-slow beacons in the noise of legit CDN traffic.',
      'Blocking the beacon but not the actor -- they rotate infrastructure.',
    ],
    attackMapping: 'Maps to ATT&CK Command and Control (TA0011) incl. T1071, T1102, T1573.',
    platformTool: { to: '/threatintel/iocs/c2', label: 'C2 tracker' },
  },
  {
    id: 'actions',
    number: 8,
    name: 'Actions on Objectives',
    short: 'Achieve the goal -- exfil, ransom, sabotage, fraud',
    icon: Flag,
    accent: 'bg-severity-critical/10',
    ringClass: 'ring-rose-400/60 dark:ring-rose-500/40',
    who: 'IR + SecOps + leadership',
    defenderGoal: 'Detect mass-staging / encryption / exfil bursts; rapid isolation.',
    description:
      "The attacker pursues the actual mission -- data theft, ransomware deployment, fraudulent wire transfers, sabotage, or staging for the next victim. Detection here is too late but containment still matters, and v2's campaign overlay asks: which other intrusions is this actor running in parallel?",
    deliverables: [
      'Objective impact assessment (exfil, encryption, fraud)',
      'Isolation / containment executed',
      'Campaign linkage -- related intrusions to hunt',
    ],
    pitfalls: [
      'Declaring victory at the first objective -- the campaign may span multiple intrusions.',
      'Forgetting the feedback loop: actions feed the next cycle of reconnaissance.',
    ],
    attackMapping: 'Maps to ATT&CK Exfiltration (TA0010) + Impact (TA0040) incl. T1041, T1486, T1485.',
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
    phase: 'recon',
    title: 'Scanning the React/Next.js surface',
    prompt:
      'A partner feed + a CTF IoC report named Lazarus exploiting CVE-2025-55182. The WAF + load balancer logs show the list.txt scanning pattern hitting our Next.js 15.x prod apps.',
    artifacts: [
      'Target profile: 3 Next.js 15.x prod apps + 1 staging',
      'Initial-access vectors: RSC deserialization RCE',
    ],
  },
  {
    phase: 'weaponize',
    title: 'Payload prep (invisible to us)',
    prompt:
      'The loader (Manuscrypt variant) is pre-staged on attacker infrastructure with the brndlog.txt config and C2 chain. Nothing to detect on our side -- we harden the runtime instead.',
    artifacts: ['Runtime hardening: disable deserialization paths where possible'],
  },
  {
    phase: 'deliver',
    title: 'The inbound POST',
    prompt:
      'A follow-up POST to the Next.js app triggers the RSC deserialization RCE. The request looks like normal app traffic to WAF rules -- it is the delivery of the weapon.',
    artifacts: ['POST captured in app logs', 'WAF rule gap noted'],
  },
  {
    phase: 'exploit',
    title: 'Code execution on the origin',
    prompt:
      'The RCE lands on the origin host. EDR flags the child-process anomaly: the app spawning a shell. This is the moment-of-execution we train to catch.',
    artifacts: ['Process tree captured', 'CVE-2025-55182 + KEV/EPSS context'],
  },
  {
    phase: 'install',
    title: 'Persistence via MsSecurityObj mutex + registry',
    prompt:
      'The loader installs persistence: the MsSecurityObj mutex, a registry Run key, and the Akagi64 UAC-bypass binary. Sysmon Event ID 13 (registry) fires.',
    artifacts: ['Persistence inventory (mutex, registry key)', 'Sysmon delta for the host'],
  },
  {
    phase: 'lateral',
    title: 'MultiRelay lateral movement',
    prompt:
      'The actor pivots with the MultiRelay lateral-movement tool: SMB relay to other hosts, credential harvesting. This is the v2 phase that the original chain missed -- and where the intrusion becomes an incident.',
    artifacts: ['Movement timeline: beachhead -> 3 prod hosts', 'Credential-exposure assessment'],
  },
  {
    phase: 'c2',
    title: 'ChaCha20/HTTP beaconing',
    prompt:
      'The implant checks in over ChaCha20/HTTP to a rotating set of C2 domains. Egress telemetry shows the beacon jitter and JA3 fingerprint.',
    artifacts: ['C2 rotation timeline + JA3', 'Egress-block candidates'],
  },
  {
    phase: 'actions',
    title: 'Exfil prep + campaign linkage',
    prompt:
      'The actor stages data for exfiltration. We isolate the 3 prod apps, rotate secrets, and deploy the patch. The campaign overlay asks the harder question: is the staging app next? (It is -- 12h later.)',
    artifacts: ['Containment + eradication evidence', 'Campaign hypothesis: staging surface re-targeted'],
  },
];

// ---------------------------------------------------------------------------
// Comparison table: Kill Chain v2 vs. the other frameworks on the platform
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
    name: 'Cyber Kill Chain v2',
    kind: 'content',
    question: 'What phases did the intrusion pass through (incl. lateral movement)?',
    primaryUser: 'DFIR + SOC',
    platformPage: '/threatintel/kill-chain-v2',
    note: 'The 7-phase chain plus lateral movement and a campaign overlay.',
  },
  {
    name: 'Lockheed Kill Chain',
    kind: 'content',
    question: 'What phases did the intrusion pass through?',
    primaryUser: 'DFIR + SOC',
    platformPage: '/dfir/kill-chain',
    note: 'The original 7-phase chain -- v2 is the extension that fixes its blind spot.',
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
    name: 'F3EAD',
    kind: 'process',
    question: 'How does the team operate end-to-end on a target?',
    primaryUser: 'CTI + SOC + IR',
    platformPage: '/threatintel/f3ead',
    note: 'The workflow the team runs; the kill chain describes what the actor did.',
  },
  {
    name: 'F2T2EA',
    kind: 'process',
    question: 'How do we locate, track, and act on a target?',
    primaryUser: 'Ops + IR (targeting)',
    platformPage: '/threatintel/f2t2ea',
    note: 'Joint targeting cycle -- the ops side of the same fight.',
  },
  {
    name: 'OODA Loop',
    kind: 'process',
    question: 'How fast can we decide and act?',
    primaryUser: 'IR + SOC (tempo)',
    platformPage: '/threatintel/ooda',
    note: "Boyd's decision cycle -- the tempo at which the team runs the chain.",
  },
  {
    name: 'MITRE ATT&CK',
    kind: 'content',
    question: 'Which specific techniques did the adversary use?',
    primaryUser: 'Detection eng + CTI',
    platformPage: '/threatintel/mitre',
    note: 'The shared vocabulary -- each chain phase maps onto ATT&CK tactics.',
  },
  {
    name: 'Diamond Model',
    kind: 'content',
    question: 'Who did what to whom, and how?',
    primaryUser: 'CTI + IR',
    platformPage: '/dfir/diamond',
    note: 'Per-event reconstruction that fills in the who behind the chain.',
  },
  {
    name: 'ACH',
    kind: 'process',
    question: 'Which hypothesis best explains the evidence?',
    primaryUser: 'CTI analysts',
    platformPage: '/threatintel/ach',
    note: 'Structured analytic technique used when the chain looks like more than one actor.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KillChainV2(): JSX.Element {
  const [openPhase, setOpenPhase] = useState<PhaseId | null>('recon');
  const [walkStep, setWalkStep] = useState<number>(0);

  const currentWalk = WALK[walkStep]!;
  const currentPhase = PHASES.find((p) => p.id === currentWalk.phase)!;
  const WalkIcon = currentPhase.icon;

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Crosshair size={28} />}
      title="Cyber Kill Chain v2: Recon → Weaponize → Deliver → Exploit → Install → Move → C2 → Act"
      description={
        <>
          Lockheed Martin's 2015 extension of the 2011 Cyber Kill Chain. The original seven phases describe a{' '}
          <em>single</em> intrusion; v2 adds an explicit <strong>Lateral Movement</strong> phase -- post-exploitation is
          where modern intrusions actually live -- and a <strong>Campaign</strong> overlay, because one actor runs
          multiple intrusions in parallel. The key insight: the chain is <em>per-intrusion</em>, the campaign is{' '}
          <em>per-actor</em>.
        </>
      }
      maxWidthClass="max-w-7xl"
    >
      {/* ── The chain diagram ─────────────────────────────────────────── */}
      <section className="mb-12">
        <header className="flex items-end justify-between mb-4">
          <h2 className="text-xl font-display font-semibold text-heading">The Kill Chain v2 phases</h2>
          <p className="text-xs font-mono text-muted hidden sm:block">
            7 original phases + lateral movement &middot; campaign overlay on top
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
                {/* Campaign overlay note on the last card. */}
                {isLast && (
                  <div className="hidden lg:flex absolute -bottom-3 left-1/2 -translate-x-1/2 items-center gap-1 text-micro font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-300 bg-white dark:bg-[rgb(var(--surface-200))] px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))]">
                    <Sparkles className="h-3 w-3" /> campaign overlay
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
          <h2 className="text-xl font-display font-semibold text-heading">Walk an incident through Kill Chain v2</h2>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            An 8-step click-through using the Lazarus / Copperhedge sample already in the platform's
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
                  {phase.short.split(' ')[0]}
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
                : 'chain complete -- campaign overlay re-opens Recon'}
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
            Kill Chain v2 vs. the other frameworks on the platform
          </h2>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            The Kill Chain is a <strong>content</strong> framework -- it describes what the adversary did. It does not
            replace ATT&CK, Diamond, or the process frameworks (F3EAD, F2T2EA, OODA); it feeds them.
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
            <strong className="text-heading">
              Hutchins, Cloppert, Amin — "Intelligence-Driven Computer Network Defense Informed by Analysis of Adversary
              Campaigns and Intrusion Kill Chains" (2011)
            </strong>{' '}
            &mdash; the original paper that defined the 7-phase Cyber Kill Chain.
          </li>
          <li>
            <strong className="text-heading">Lockheed Martin — Cyber Kill Chain 2.0 (2015)</strong> &mdash; the
            extension adding Lateral Movement and the Campaign overlay to the original chain.
          </li>
          <li>
            <strong className="text-heading">Lockheed Martin — Cyber Kill Chain site</strong> &mdash; the vendor's
            current framing of the 7-phase model.
          </li>
          <li>
            <strong className="text-heading">MITRE ATT&CK</strong> &mdash; the technique-level vocabulary each chain
            phase maps onto.
          </li>
          <li>
            <strong className="text-heading">
              NIST SP 800-61 rev 2 &mdash; Computer Security Incident Handling Guide
            </strong>{' '}
            &mdash; the IR phases that Detection, Containment, Eradication, and Recovery align to.
          </li>
          <li>
            <strong className="text-heading">
              MITRE ATT&CK Blog: "F3EAD: Operationalizing Cyber Threat Intelligence" (2018)
            </strong>{' '}
            &mdash; connects chain-level content to the F3EAD process workflow on this platform.
          </li>
        </ul>
      </section>
    </DataPageLayout>
  );
}
