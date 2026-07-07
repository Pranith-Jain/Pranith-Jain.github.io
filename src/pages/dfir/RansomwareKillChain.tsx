import { useState, useEffect, useCallback, useRef } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  ShieldAlert,
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Swords,
  Shield,
  ShieldCheck,
  Eye,
  Lock,
  HardDrive,
} from 'lucide-react';

interface Stage {
  id: number;
  name: string;
  mitre: string;
  durationMin: number;
  baseProb: number;
  description: string;
}

const STAGES: Stage[] = [
  {
    id: 1,
    name: 'Initial Access',
    mitre: 'T1133',
    durationMin: 15,
    baseProb: 0.7,
    description: 'External Remote Services — VPN credential abuse or exposed RDP',
  },
  {
    id: 2,
    name: 'Execution',
    mitre: 'T1059.001',
    durationMin: 5,
    baseProb: 0.85,
    description: 'PowerShell — living-off-the-land binary execution',
  },
  {
    id: 3,
    name: 'Persistence',
    mitre: 'T1547.001',
    durationMin: 3,
    baseProb: 0.9,
    description: 'Registry Run Key — survives reboot via HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  },
  {
    id: 4,
    name: 'Privilege Escalation',
    mitre: 'T1548.002',
    durationMin: 10,
    baseProb: 0.6,
    description: 'UAC Bypass — bypass user account control for admin-level access',
  },
  {
    id: 5,
    name: 'Defense Evasion',
    mitre: 'T1562.001',
    durationMin: 5,
    baseProb: 0.75,
    description: 'Disable Defender — tamper with Windows Defender real-time monitoring',
  },
  {
    id: 6,
    name: 'Credential Access',
    mitre: 'T1003.001',
    durationMin: 8,
    baseProb: 0.8,
    description: 'LSASS Dump — dump process memory to extract plaintext credentials',
  },
  {
    id: 7,
    name: 'Discovery',
    mitre: 'T1087.002',
    durationMin: 10,
    baseProb: 0.9,
    description: 'Domain Enumeration — enumerate AD groups, users, shares, SPNs',
  },
  {
    id: 8,
    name: 'Lateral Movement',
    mitre: 'T1021.002',
    durationMin: 20,
    baseProb: 0.65,
    description: 'SMB Lateral Movement — use stolen creds to spread via file shares',
  },
  {
    id: 9,
    name: 'Collection',
    mitre: 'T1560',
    durationMin: 15,
    baseProb: 0.85,
    description: 'Archive Collected Data — compress and stage sensitive files for exfil',
  },
  {
    id: 10,
    name: 'Command & Control',
    mitre: 'T1071.001',
    durationMin: 5,
    baseProb: 0.8,
    description: 'Web Protocol C2 — HTTPS reverse tunnel to operator infrastructure',
  },
  {
    id: 11,
    name: 'Exfiltration',
    mitre: 'T1567.002',
    durationMin: 30,
    baseProb: 0.55,
    description: 'Exfil to Cloud — upload archives to cloud storage for double-extortion leverage',
  },
  {
    id: 12,
    name: 'Staging',
    mitre: 'T1074.001',
    durationMin: 10,
    baseProb: 0.9,
    description: 'Staging — position payloads on all target hosts before detonation',
  },
  {
    id: 13,
    name: 'Impact',
    mitre: 'T1486',
    durationMin: 20,
    baseProb: 0.7,
    description: 'Data Encrypted for Impact — ransomware payload encrypts all accessible files',
  },
  {
    id: 14,
    name: 'Ransom Note',
    mitre: 'T1489',
    durationMin: 2,
    baseProb: 0.99,
    description: 'Service Stop — drop ransom note, stop backup services, kill databases',
  },
  {
    id: 15,
    name: 'Dead',
    mitre: 'T1490',
    durationMin: 0,
    baseProb: 0.95,
    description: 'Inhibit System Recovery — delete shadow copies, disable recovery',
  },
];

const KILL_CONTROLS = [
  { key: 'defenderAv', label: 'Defender AV', icon: ShieldCheck },
  { key: 'edr', label: 'EDR', icon: Eye },
  { key: 'conditionalAccess', label: 'Conditional Access', icon: Lock },
  { key: 'mfa', label: 'MFA', icon: Shield },
  { key: 'backup', label: 'Backup', icon: HardDrive },
] as const;

type KillControlKey = (typeof KILL_CONTROLS)[number]['key'];

interface StageResult {
  stageId: number;
  status: 'running' | 'stopped' | 'compromised';
}

interface LogEntry {
  time: string;
  level: 'info' | 'warn' | 'critical';
  message: string;
}

const TOTAL_MINUTES = 300;
const SPEED_MAP = { 0.5: 400, 1: 200, 2: 100, 4: 50 };

function stageDetectionBonus(stage: Stage, controls: Record<KillControlKey, boolean>): number {
  let bonus = 0;
  if (controls.edr) {
    if ([1, 2, 3, 5, 6, 8, 13].includes(stage.id)) bonus += 0.4;
    else bonus += 0.15;
  }
  if (controls.defenderAv) {
    if ([2, 5, 13].includes(stage.id)) bonus += 0.35;
    else bonus += 0.1;
  }
  if (controls.mfa && stage.id === 1) bonus += 0.5;
  if (controls.conditionalAccess && stage.id === 1) bonus += 0.3;
  if (controls.backup && stage.id === 13) bonus += 0.2;
  return Math.min(0.9, bonus);
}

export default function RansomwareKillChain(): JSX.Element {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<'scripted' | 'probabilistic'>('probabilistic');
  const [speed, setSpeed] = useState<keyof typeof SPEED_MAP>(1);
  const [elapsedMin, setElapsedMin] = useState(0);
  const [controls, setControls] = useState<Record<KillControlKey, boolean>>({
    defenderAv: true,
    edr: false,
    conditionalAccess: false,
    mfa: true,
    backup: false,
  });
  const [stageResults, setStageResults] = useState<StageResult[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [currentStage, setCurrentStage] = useState(0);
  const [socOpen, setSocOpen] = useState(true);
  const [simDone, setSimDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleControl = (k: KillControlKey) => setControls((p) => ({ ...p, [k]: !p[k] }));

  const stats = {
    stopped: stageResults.filter((s) => s.status === 'stopped').length,
    compromised: stageResults.filter((s) => s.status === 'compromised').length,
    active: stageResults.filter((s) => s.status === 'running').length,
  };

  const addLog = (level: LogEntry['level'], message: string) => {
    const mins = Math.floor(elapsedMin);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    setLog((prev) => [{ time: `T+${h}h${String(m).padStart(2, '0')}m`, level, message }, ...prev].slice(0, 60));
  };

  const processTick = useCallback(() => {
    setElapsedMin((prev) => {
      const next = prev + 1;
      if (next >= TOTAL_MINUTES) {
        setRunning(false);
        setSimDone(true);
        return TOTAL_MINUTES;
      }
      return next;
    });

    setStageResults((prevResults) => {
      const stageIdx = currentStage;
      if (stageIdx >= STAGES.length) return prevResults;

      const stage = STAGES[stageIdx]!;
      const results = [...prevResults];

      const existing = results.find((r) => r.stageId === stage.id);
      if (!existing) {
        results.push({ stageId: stage.id, status: 'running' });
        addLog('info', `Stage ${stage.id}: ${stage.name} (${stage.mitre})`);
      }

      const runningStages = results.filter((r) => r.status === 'running');
      for (const rs of runningStages) {
        const s = STAGES.find((st) => st.id === rs.stageId)!;
        if (
          elapsedMin >=
          s.durationMin +
            (STAGES.slice(0, s.id - 1).reduce((a, b) => a + b.durationMin, 0) / TOTAL_MINUTES) * TOTAL_MINUTES * 0.6
        ) {
          let detected = false;
          if (mode === 'probabilistic') {
            const detBonus = stageDetectionBonus(s, controls);
            const detChance = 0.15 + detBonus;
            const roll = Math.random();
            detected = roll < detChance;
          }

          if (detected) {
            rs.status = 'stopped';
            addLog('warn', `BLOCKED at ${s.name}: Defense stack detected and stopped the attack`);
          } else {
            rs.status = 'compromised';
            addLog('critical', `BREACH at ${s.name}: Attacker advanced — ${s.mitre}`);
          }
        }
      }

      const allDone = results.filter((r) => r.status !== 'running').length;
      if (allDone >= stageIdx + 1 && stageIdx < STAGES.length) {
        setCurrentStage(stageIdx + 1);
      }

      return results;
    });
  }, [currentStage, controls, mode, elapsedMin]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(processTick, SPEED_MAP[speed]);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, speed, processTick]);

  const reset = () => {
    setRunning(false);
    setElapsedMin(0);
    setCurrentStage(0);
    setStageResults([]);
    setLog([]);
    setSimDone(false);
  };

  const getStageStatus = (id: number): 'pending' | 'running' | 'stopped' | 'compromised' => {
    const r = stageResults.find((s) => s.stageId === id);
    if (!r) return currentStage + 1 === id ? 'pending' : 'pending';
    return r.status as 'pending' | 'running' | 'stopped' | 'compromised';
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'running':
        return 'border-amber-500/60 bg-amber-500/10';
      case 'stopped':
        return 'border-emerald-500/60 bg-emerald-500/10';
      case 'compromised':
        return 'border-rose-500/60 bg-rose-500/10';
      default:
        return 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]';
    }
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'running':
        return <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />;
      case 'stopped':
        return <ShieldCheck size={14} className="text-emerald-500" />;
      case 'compromised':
        return <ShieldAlert size={14} className="text-rose-500" />;
      default:
        return <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />;
    }
  };

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
          <Swords size={28} className="text-violet-600 dark:text-violet-400" /> Ransomware Kill Chain — 15-Stage
          Intrusion
        </h1>
        <p className="text-muted mb-6 max-w-2xl text-sm font-mono">
          Walk through a ransomware intrusion from initial access to encryption. Toggle defenses and watch each MITRE
          ATT&CK stage succeed or get blocked by your controls.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setRunning(!running)}
          disabled={simDone}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm font-semibold bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-400 disabled:opacity-40"
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Pause' : elapsedMin === 0 ? 'Start' : 'Resume'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/60"
        >
          <RotateCcw size={14} /> Reset
        </button>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-xs font-mono text-muted mr-1">Speed:</span>
          {([0.5, 1, 2, 4] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-1 rounded text-xs font-mono ${speed === s ? 'bg-brand-600 dark:bg-brand-500 text-white' : 'border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/60'}`}
            >
              {s}x
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-xs font-mono text-muted mr-1">Mode:</span>
          {(['scripted', 'probabilistic'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                reset();
              }}
              className={`px-3 py-1 rounded text-xs font-mono capitalize ${mode === m ? 'bg-brand-600 dark:bg-brand-500 text-white' : 'border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/60'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
              Defenses
            </h2>
            <div className="flex flex-wrap gap-2">
              {KILL_CONTROLS.map((c) => {
                const Icon = c.icon;
                const active = controls[c.key];
                return (
                  <button
                    key={c.key}
                    onClick={() => toggleControl(c.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-sm border transition-all ${
                      active
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-slate-300 dark:hover:border-[rgb(var(--border-500))] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon size={14} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
              Kill Chain
            </h2>
            <div className="space-y-2">
              {STAGES.map((stage, i) => {
                const status = getStageStatus(stage.id);
                const prevStatus = i > 0 ? getStageStatus(STAGES[i - 1]!.id) : 'compromised';
                return (
                  <div key={stage.id}>
                    {i > 0 && (
                      <div className="flex justify-center py-0.5">
                        <div
                          className={`w-px h-3 ${
                            prevStatus === 'compromised'
                              ? 'bg-rose-500/40'
                              : prevStatus === 'stopped'
                                ? 'bg-emerald-500/40'
                                : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                        />
                      </div>
                    )}
                    <div
                      className={`flex items-center gap-3 p-3 rounded-xl border ${statusColor(status)} transition-all`}
                    >
                      {statusIcon(status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{stage.name}</span>
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--input-200))] text-muted">
                            {stage.mitre}
                          </span>
                        </div>
                        <div className="text-xs text-muted font-mono mt-0.5">{stage.description}</div>
                      </div>
                      <span className="text-xs font-mono text-muted whitespace-nowrap">{stage.durationMin}m</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside
          className={`rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden ${socOpen ? 'p-5' : 'p-3'}`}
        >
          <button onClick={() => setSocOpen(!socOpen)} className="w-full flex items-center justify-between mb-3">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              SOC Panel
            </h2>
            {socOpen ? (
              <ChevronUp size={14} className="text-muted" />
            ) : (
              <ChevronDown size={14} className="text-muted" />
            )}
          </button>
          {socOpen && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center p-2 rounded bg-emerald-50 dark:bg-emerald-900/20">
                  <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {stats.stopped}
                  </div>
                  <div className="text-xs font-mono text-muted">Stopped</div>
                </div>
                <div className="text-center p-2 rounded bg-rose-50 dark:bg-rose-900/20">
                  <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400">
                    {stats.compromised}
                  </div>
                  <div className="text-xs font-mono text-muted">Compromised</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-muted">Elapsed</span>
                  <span>
                    {Math.floor(elapsedMin / 60)}h {elapsedMin % 60}m / 5h
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-[rgb(var(--input-200))] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${(elapsedMin / TOTAL_MINUTES) * 100}%` }}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-[rgb(var(--input-200))] pt-3">
                <h3 className="text-xs font-mono text-muted mb-2">Event Log</h3>
                <div className="h-56 overflow-y-auto space-y-1 font-mono text-xs">
                  {log.length === 0 && <div className="text-muted italic">No events — start the simulation.</div>}
                  {log.map((entry, i) => (
                    <div
                      key={i}
                      className={`leading-relaxed ${
                        entry.level === 'critical'
                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                          : entry.level === 'warn'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <span className="text-muted">{entry.time}</span> {entry.message}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-[rgb(var(--input-200))] pt-3">
                <div className="text-xs font-mono text-muted mb-2">Legend</div>
                <div className="flex flex-wrap gap-3 text-xs font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Running
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Stopped
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> Compromised
                  </span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
