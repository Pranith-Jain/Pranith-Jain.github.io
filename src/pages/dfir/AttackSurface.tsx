import { useState, useEffect, useCallback, useRef } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Shield,
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Network,
  Lock,
  Server,
} from 'lucide-react';

interface Cve {
  id: string;
  cvss: number;
  disclosed: number;
  description: string;
}

const CVES: Cve[] = [
  {
    id: 'CVE-2018-13379',
    cvss: 9.8,
    disclosed: Date.parse('2018-08-02'),
    description: 'Pre-auth path traversal — reads /etc/passwd and session files over HTTPS without authentication.',
  },
  {
    id: 'CVE-2019-5591',
    cvss: 7.5,
    disclosed: Date.parse('2019-07-24'),
    description: 'Default configuration leak — sends sensitive system files to peer FortiGate via FortiGuard.',
  },
  {
    id: 'CVE-2020-12812',
    cvss: 9.8,
    disclosed: Date.parse('2020-07-23'),
    description: 'MFA bypass — logging in with a blank space as the second factor succeeds on certain configurations.',
  },
  {
    id: 'CVE-2022-40684',
    cvss: 9.8,
    disclosed: Date.parse('2022-10-10'),
    description:
      'Auth bypass via crafted HTTP/HTTPS request — reads configs, keys, and session tokens without credentials.',
  },
];

const CONTROLS = [
  { key: 'defenderAv', label: 'Defender AV', icon: ShieldCheck, desc: 'Endpoint antivirus running on VPN gateway' },
  { key: 'edr', label: 'EDR', icon: Eye, desc: 'Endpoint detection & response — behavioral monitoring' },
  { key: 'conditionalAccess', label: 'Conditional Access', icon: Lock, desc: 'Geo/IP/device-based access policies' },
  {
    key: 'vpnPatching',
    label: 'SSL-VPN Patching',
    icon: Server,
    desc: 'Apply vendor patches within configured window',
  },
  {
    key: 'segmentation',
    label: 'Network Segmentation',
    icon: Network,
    desc: 'VPN in isolated DMZ, no lateral reach into core',
  },
  { key: 'monitoring', label: 'Monitoring', icon: Shield, desc: 'SIEM correlation, IDS/IPS, log forwarding' },
] as const;

type ControlKey = (typeof CONTROLS)[number]['key'];

interface SimEvent {
  tick: number;
  month: string;
  type: 'attempt' | 'stopped' | 'breach';
  cve: string;
  detail: string;
}

const TIMELINE_START = Date.parse('2018-01-01');
const TIMELINE_END = Date.parse('2025-12-31');
const TOTAL_TICKS = 96;
const MS_PER_TICK = (TIMELINE_END - TIMELINE_START) / TOTAL_TICKS;

function tickToDate(tick: number): Date {
  return new Date(TIMELINE_START + tick * MS_PER_TICK);
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function exploitationProb(
  cve: Cve,
  tick: number,
  controls: Record<ControlKey, boolean>,
  patchHours: number,
  targetProfile: 'low' | 'typical' | 'high'
): number {
  const t = tickToDate(tick).getTime();
  if (t < cve.disclosed) return 0;

  let base = 0.15;
  if (cve.cvss >= 9.0) base = 0.25;
  if (targetProfile === 'high') base *= 1.5;
  if (targetProfile === 'low') base *= 0.5;

  if (controls.vpnPatching) {
    const daysSince = (t - cve.disclosed) / (1000 * 60 * 60);
    if (daysSince > patchHours / 24) base *= 0.05;
    else base *= 0.6;
  }

  if (controls.segmentation) base *= 0.3;
  if (controls.conditionalAccess) base *= 0.4;
  if (controls.defenderAv) base *= 0.7;
  if (controls.edr) base *= 0.5;
  if (controls.monitoring) base *= 0.6;

  return clamp01(base);
}

function defenseDetectionProb(controls: Record<ControlKey, boolean>): number {
  let det = 0.1;
  if (controls.edr) det += 0.35;
  if (controls.defenderAv) det += 0.15;
  if (controls.monitoring) det += 0.25;
  if (controls.segmentation) det += 0.1;
  return clamp01(det);
}

export default function AttackSurface(): JSX.Element {
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const [controls, setControls] = useState<Record<ControlKey, boolean>>({
    defenderAv: false,
    edr: false,
    conditionalAccess: false,
    vpnPatching: false,
    segmentation: false,
    monitoring: false,
  });
  const [patchHours, setPatchHours] = useState(720);
  const [targetProfile, setTargetProfile] = useState<'low' | 'typical' | 'high'>('typical');
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [socOpen, setSocOpen] = useState(true);
  const [siemLog, setSiemLog] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleControl = (k: ControlKey) => setControls((p) => ({ ...p, [k]: !p[k] }));

  const stats = {
    attempts: events.filter((e) => e.type === 'attempt').length,
    stopped: events.filter((e) => e.type === 'stopped').length,
    breaches: events.filter((e) => e.type === 'breach').length,
  };

  const processTick = useCallback(() => {
    setTick((prev) => {
      const next = prev + 1;
      if (next > TOTAL_TICKS) {
        setRunning(false);
        return prev;
      }
      const d = tickToDate(next);
      const label = fmtMonth(d);

      for (const cve of CVES) {
        const prob = exploitationProb(cve, next, controls, patchHours, targetProfile);
        if (Math.random() < prob) {
          const det = defenseDetectionProb(controls);
          const ev: SimEvent = { tick: next, month: label, cve: cve.id, type: 'attempt', detail: '' };
          if (Math.random() < det) {
            ev.type = 'stopped';
            ev.detail = `Blocked by defense stack`;
          } else {
            ev.type = 'breach';
            ev.detail = `Exploitation successful — ${cve.id}`;
          }
          setEvents((prev) => [...prev, ev]);
          setSiemLog((prev) => {
            const entry = `[${label}] ${ev.type === 'breach' ? 'CRITICAL' : 'INFO'} ${ev.cve}: ${ev.detail}`;
            return [entry, ...prev].slice(0, 50);
          });
        }
      }
      return next;
    });
  }, [controls, patchHours, targetProfile]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(processTick, 800 / speed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, speed, processTick]);

  const reset = () => {
    setRunning(false);
    setTick(0);
    setEvents([]);
    setSiemLog([]);
  };

  const timelineEvents = events;

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
          <ShieldAlert size={28} className="text-rose-600 dark:text-rose-400" /> Attack Surface — SSL-VPN CVE Model
        </h1>
        <p className="text-muted mb-6 max-w-2xl text-sm font-mono">
          Simulate exploitation of Fortinet SSL-VPN appliances across 8 years. Toggle defenses, adjust patch cadence,
          and watch how real CVEs are exploited against your security posture.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setRunning(!running)}
          disabled={tick >= TOTAL_TICKS && !running}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm font-semibold bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-400 disabled:opacity-40"
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Pause' : tick === 0 ? 'Start' : 'Resume'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/60"
        >
          <RotateCcw size={14} /> Reset
        </button>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-xs font-mono text-muted mr-1">Speed:</span>
          {[0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-1 rounded text-xs font-mono ${speed === s ? 'bg-brand-600 dark:bg-brand-500 text-white' : 'border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/60'}`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
              Controls
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {CONTROLS.map((c) => {
                const Icon = c.icon;
                const active = controls[c.key];
                return (
                  <button
                    key={c.key}
                    onClick={() => toggleControl(c.key)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left font-mono text-sm transition-all ${
                      active
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-slate-300 dark:hover:border-[rgb(var(--border-500))] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon size={16} />
                    <div>
                      <div className="font-semibold">{c.label}</div>
                      <div className="text-xs text-muted">{c.desc}</div>
                    </div>
                    <span
                      className={`ml-auto w-2 h-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
              Parameters
            </h2>
            <div className="space-y-4">
              <div>
                <label className="flex items-center justify-between text-sm font-mono mb-1">
                  <span>Avg Patch Time</span>
                  <span className="text-muted">
                    {patchHours >= 24 ? `${Math.round(patchHours / 24)} days` : `${patchHours} hrs`}
                  </span>
                </label>
                <input
                  type="range"
                  min={24}
                  max={2160}
                  step={24}
                  value={patchHours}
                  onChange={(e) => setPatchHours(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
                <div className="flex justify-between text-xs font-mono text-muted">
                  <span>1 day</span>
                  <span>90 days</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-mono mb-2 block">Target Profile</label>
                <div className="flex gap-2">
                  {(['low', 'typical', 'high'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setTargetProfile(p)}
                      className={`flex-1 px-3 py-2 rounded-lg font-mono text-sm capitalize border ${
                        targetProfile === p
                          ? 'bg-brand-600 dark:bg-brand-500 text-white border-brand-600 dark:border-brand-500'
                          : 'border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/60'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
              Timeline
            </h2>
            <div className="relative h-12 bg-slate-100 dark:bg-[rgb(var(--input-200))] rounded-lg overflow-hidden">
              {CVES.map((cve) => {
                const startPct = ((cve.disclosed - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100;
                return (
                  <div
                    key={cve.id}
                    className="absolute top-1 bottom-1 rounded"
                    style={{
                      left: `${startPct}%`,
                      width: `${100 - startPct}%`,
                      backgroundColor: 'rgb(var(--border-400))',
                      opacity: 0.3,
                    }}
                  />
                );
              })}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-brand-500"
                style={{ left: `${(tick / TOTAL_TICKS) * 100}%` }}
              />
              {timelineEvents.slice(-20).map((ev, i) => {
                const x = (ev.tick / TOTAL_TICKS) * 100;
                const color =
                  ev.type === 'breach' ? 'bg-rose-500' : ev.type === 'stopped' ? 'bg-emerald-500' : 'bg-amber-400';
                return (
                  <div
                    key={i}
                    className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${color}`}
                    style={{ left: `${x}%` }}
                    title={`${ev.month} ${ev.cve}: ${ev.detail}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs font-mono text-muted mt-2">
              <span>Jan 2018</span>
              <span>Jan 2020</span>
              <span>Jan 2022</span>
              <span>Jan 2024</span>
              <span>Dec 2025</span>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
              CVE Details
            </h2>
            <div className="space-y-3">
              {CVES.map((cve) => {
                const disclosed = tickToDate(Math.floor((cve.disclosed - TIMELINE_START) / MS_PER_TICK));
                const cvssColor =
                  cve.cvss >= 9 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400';
                return (
                  <div
                    key={cve.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 dark:border-[rgb(var(--input-200))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
                  >
                    <div className={`font-mono text-sm font-bold ${cvssColor}`}>{cve.cvss}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm font-semibold">{cve.id}</div>
                      <div className="text-xs text-muted font-mono mt-0.5">
                        {fmtMonth(disclosed)} · {cve.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside
          className={`rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden ${socOpen ? 'p-5' : 'p-3'}`}
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
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded bg-slate-50 dark:bg-[rgb(var(--input-200))]">
                  <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">{stats.attempts}</div>
                  <div className="text-xs font-mono text-muted">Attempts</div>
                </div>
                <div className="text-center p-2 rounded bg-slate-50 dark:bg-[rgb(var(--input-200))]">
                  <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {stats.stopped}
                  </div>
                  <div className="text-xs font-mono text-muted">Stopped</div>
                </div>
                <div className="text-center p-2 rounded bg-slate-50 dark:bg-[rgb(var(--input-200))]">
                  <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400">{stats.breaches}</div>
                  <div className="text-xs font-mono text-muted">Breaches</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-mono text-muted mb-1">
                  Tick {tick}/{TOTAL_TICKS}
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-[rgb(var(--input-200))] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${(tick / TOTAL_TICKS) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-xs font-mono text-muted mb-2">SIEM Feed</h3>
                <div className="h-64 overflow-y-auto space-y-1 font-mono text-xs">
                  {siemLog.length === 0 && (
                    <div className="text-muted italic">No events yet — start the simulation.</div>
                  )}
                  {siemLog.map((line, i) => {
                    const isCrit = line.startsWith('[S') ? false : line.includes('CRITICAL');
                    return (
                      <div
                        key={i}
                        className={`leading-relaxed ${isCrit ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}
                      >
                        {line}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-[rgb(var(--input-200))] pt-3">
                <div className="text-xs font-mono text-muted mb-2">Legend</div>
                <div className="flex flex-wrap gap-3 text-xs font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Attempt
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Stopped
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> Breach
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
