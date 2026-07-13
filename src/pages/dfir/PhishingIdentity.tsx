import { useState, useEffect, useCallback, useRef } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Mail,
  ShieldCheck,
  Lock,
  Fingerprint,
  KeyRound,
} from 'lucide-react';

interface Era {
  year: number;
  label: string;
  technique: string;
  clickRate: number;
  filterEff: number;
  description: string;
}

const ERAS: Era[] = [
  {
    year: 2018,
    label: 'Bulk Credential Phishing',
    technique: 'T1566.002',
    clickRate: 0.1,
    filterEff: 0.4,
    description: 'Mass-sent credential harvesting — generic lures, low sophistication, ~1 in 10 clicks',
  },
  {
    year: 2019,
    label: 'Targeted BEC',
    technique: 'T1566.001',
    clickRate: 0.2,
    filterEff: 0.55,
    description: 'Spear-phishing BEC — impersonated executives, high click-rate due to urgency',
  },
  {
    year: 2020,
    label: 'MFA Fatigue',
    technique: 'T1621',
    clickRate: 0.15,
    filterEff: 0.6,
    description: 'Push-bombing MFA fatigue attacks — spam approvals until victim relents',
  },
  {
    year: 2021,
    label: 'AiTM Proxy Kits',
    technique: 'T1550.001',
    clickRate: 0.12,
    filterEff: 0.65,
    description: 'Adversary-in-the-Middle proxy kits (Tycoon 2FA) — steal session tokens bypassing MFA',
  },
  {
    year: 2022,
    label: 'OAuth Abuse',
    technique: 'T1528',
    clickRate: 0.08,
    filterEff: 0.7,
    description: 'OAuth device code flow abuse — grants persistent API access without password',
  },
  {
    year: 2023,
    label: 'AI-Generated Phishing',
    technique: 'T1566.002',
    clickRate: 0.18,
    filterEff: 0.7,
    description: 'LLM-crafted lures — near-perfect grammar, personalized at scale, hard to distinguish from legit',
  },
  {
    year: 2024,
    label: 'Passkey Era',
    technique: 'T1621',
    clickRate: 0.05,
    filterEff: 0.75,
    description: 'FIDO2 passkeys adoption — AiTM-resistant, phishing-resistant by design',
  },
  {
    year: 2025,
    label: 'Deepfake Voice',
    technique: 'T1598.003',
    clickRate: 0.1,
    filterEff: 0.8,
    description: 'Voice phishing with deepfake audio — new attack surface beyond email',
  },
];

const PHISH_CONTROLS = [
  {
    key: 'emailFilter',
    label: 'Email Filtering',
    icon: Mail,
    desc: 'Defender for Office 365 — AI-powered phishing detection',
  },
  { key: 'conditionalAccess', label: 'Conditional Access', icon: Lock, desc: 'Geo/IP/device compliance policies' },
  { key: 'mfa', label: 'MFA', icon: ShieldCheck, desc: 'Multi-factor authentication enforcement' },
] as const;

type PhishControlKey = (typeof PHISH_CONTROLS)[number]['key'];

type MfaType = 'none' | 'push' | 'number' | 'passkeys';

interface TickEvent {
  year: number;
  type: 'filtered' | 'delivered' | 'clicked' | 'blocked_mfa' | 'takeover';
  detail: string;
}

const TOTAL_TICKS = ERAS.length * 30;

export default function PhishingIdentity(): JSX.Element {
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tick, setTick] = useState(0);
  const [controls, setControls] = useState<Record<PhishControlKey, boolean>>({
    emailFilter: true,
    conditionalAccess: false,
    mfa: true,
  });
  const [mfaType, setMfaType] = useState<MfaType>('push');
  const [events, setEvents] = useState<TickEvent[]>([]);
  const [socOpen, setSocOpen] = useState(true);
  const [siemLog, setSiemLog] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentEra = ERAS[Math.min(Math.floor(tick / 30), ERAS.length - 1)]!;
  const toggleControl = (k: PhishControlKey) => setControls((p) => ({ ...p, [k]: !p[k] }));

  const stats = {
    filtered: events.filter((e) => e.type === 'filtered').length,
    delivered: events.filter((e) => e.type === 'delivered').length,
    clicked: events.filter((e) => e.type === 'clicked').length,
    blockedMfa: events.filter((e) => e.type === 'blocked_mfa').length,
    takeovers: events.filter((e) => e.type === 'takeover').length,
  };

  const processTick = useCallback(() => {
    setTick((prev) => {
      const next = prev + 1;
      if (next > TOTAL_TICKS) {
        setRunning(false);
        return prev;
      }

      const eraIdx = Math.min(Math.floor(next / 30), ERAS.length - 1);
      const era = ERAS[eraIdx]!;
      const emailsPerTick = 3 + Math.floor(Math.random() * 4);

      for (let i = 0; i < emailsPerTick; i++) {
        const filterEff = controls.emailFilter ? era.filterEff : era.filterEff * 0.3;
        if (Math.random() < filterEff) {
          const ev: TickEvent = {
            year: era.year,
            type: 'filtered',
            detail: `Email blocked by filtering — ${era.technique}`,
          };
          setEvents((prev) => [...prev, ev]);
          setSiemLog((prev) => [`[${era.year}] INFO Filtered: ${era.technique}`, ...prev].slice(0, 50));
          continue;
        }

        const clickProb = era.clickRate * (controls.conditionalAccess ? 0.5 : 1);
        if (Math.random() > clickProb) {
          setEvents((prev) => [
            ...prev,
            { year: era.year, type: 'delivered', detail: 'Email delivered — not clicked' },
          ]);
          setSiemLog((prev) => [`[${era.year}] INFO Delivered: not clicked`, ...prev].slice(0, 50));
          continue;
        }

        if (controls.mfa && mfaType !== 'none') {
          const mfaBlockChance = mfaType === 'passkeys' ? 0.95 : mfaType === 'number' ? 0.8 : 0.4;
          const adjusted = era.technique === 'T1550.001' ? mfaBlockChance * 0.3 : mfaBlockChance;
          if (Math.random() < adjusted) {
            setEvents((prev) => [
              ...prev,
              { year: era.year, type: 'blocked_mfa', detail: `Click caught by MFA (${mfaType})` },
            ]);
            setSiemLog((prev) => [`[${era.year}] WARN MFA blocked: ${mfaType}`, ...prev].slice(0, 50));
            continue;
          }
        }

        setEvents((prev) => [
          ...prev,
          { year: era.year, type: 'takeover', detail: `Account takeover via ${era.technique}` },
        ]);
        setSiemLog((prev) => [`[${era.year}] CRITICAL Account takeover: ${era.technique}`, ...prev].slice(0, 50));
      }
      return next;
    });
  }, [controls, mfaType]);

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

  const eraProgress = (tick / TOTAL_TICKS) * 100;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Mail size={28} className="text-amber-600 dark:text-amber-400" /> Phishing & Identity — Inbox Arms Race
        </h1>
        <p className="text-muted mb-6 max-w-2xl text-sm font-mono">
          Simulate 8 years of phishing evolution — from bulk credential phishing to deepfake voice. Watch how defenses
          evolve against increasingly sophisticated attacks.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setRunning(!running)}
          disabled={tick >= TOTAL_TICKS && !running}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm font-semibold bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-400 disabled:opacity-40"
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? 'Pause' : tick === 0 ? 'Start' : 'Resume'}
        </button>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/60"
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
          <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
              Defenses
            </h2>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {PHISH_CONTROLS.map((c) => {
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

              <div>
                <label className="text-sm font-mono mb-2 block">MFA Type</label>
                <div className="flex gap-2">
                  {(['none', 'push', 'number', 'passkeys'] as MfaType[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMfaType(m)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-sm border capitalize ${
                        mfaType === m
                          ? 'bg-brand-600 dark:bg-brand-500 text-white border-brand-600 dark:border-brand-500'
                          : 'border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/60'
                      }`}
                    >
                      {m === 'none' && <span className="text-xs">⊘</span>}
                      {m === 'push' && <KeyRound size={12} />}
                      {m === 'number' && <Fingerprint size={12} />}
                      {m === 'passkeys' && <ShieldCheck size={12} />}
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4">
              Timeline — Eras
            </h2>
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-200 dark:bg-[rgb(var(--border-400))]" />
              <div
                className="absolute left-0 top-0 bottom-0 w-px bg-brand-500 origin-top"
                style={{ transform: `scaleY(${eraProgress / 100})`, transition: 'transform 0.3s' }}
              />
              <div className="space-y-4 pl-6">
                {ERAS.map((era, i) => {
                  const eraStart = i * 30;
                  const eraEnd = (i + 1) * 30;
                  const isActive = tick >= eraStart && tick < eraEnd;
                  const isPast = tick >= eraEnd;
                  return (
                    <div
                      key={era.year}
                      className={`relative transition-all ${isActive ? 'opacity-100' : isPast ? 'opacity-60' : 'opacity-40'}`}
                    >
                      <div
                        className={`absolute -left-[29px] top-1 w-3 h-3 rounded-full border-2 transition-all ${
                          isActive
                            ? 'bg-brand-500 border-brand-500 scale-125'
                            : isPast
                              ? 'bg-emerald-500 border-emerald-500'
                              : 'bg-white dark:bg-[rgb(var(--surface-200))] border-slate-300 dark:border-slate-600'
                        }`}
                      />
                      <div className="flex items-start gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold">{era.year}</span>
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--input-200))] text-muted">
                              {era.technique}
                            </span>
                            {isActive && (
                              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="font-display font-semibold text-sm mt-0.5">{era.label}</div>
                          <div className="text-xs text-muted font-mono mt-0.5">{era.description}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
              Email Flow
            </h2>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {events.slice(-30).map((ev, i) => {
                const color =
                  ev.type === 'filtered'
                    ? 'bg-slate-400 dark:bg-slate-500'
                    : ev.type === 'delivered'
                      ? 'bg-amber-400'
                      : ev.type === 'blocked_mfa'
                        ? 'bg-emerald-500'
                        : ev.type === 'takeover'
                          ? 'bg-rose-500'
                          : 'bg-slate-300';
                return (
                  <div key={i} className={`w-3 h-3 rounded ${color} shrink-0`} title={`${ev.year}: ${ev.detail}`} />
                );
              })}
              {events.length === 0 && (
                <span className="text-xs font-mono text-muted italic">Emails will appear here...</span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-mono mt-2">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-slate-400" /> Filtered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-amber-400" /> Delivered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-emerald-500" /> MFA Blocked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-rose-500" /> Takeover
              </span>
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
                <div className="text-center p-2 rounded bg-slate-50 dark:bg-[rgb(var(--input-200))]">
                  <div className="text-lg font-bold font-mono text-slate-500">{stats.filtered}</div>
                  <div className="text-xs font-mono text-muted">Filtered</div>
                </div>
                <div className="text-center p-2 rounded bg-slate-50 dark:bg-[rgb(var(--input-200))]">
                  <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
                    {stats.delivered}
                  </div>
                  <div className="text-xs font-mono text-muted">Delivered</div>
                </div>
                <div className="text-center p-2 rounded bg-emerald-50 dark:bg-emerald-900/20">
                  <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {stats.blockedMfa}
                  </div>
                  <div className="text-xs font-mono text-muted">MFA Blocked</div>
                </div>
                <div className="text-center p-2 rounded bg-rose-50 dark:bg-rose-900/20">
                  <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400">{stats.takeovers}</div>
                  <div className="text-xs font-mono text-muted">Takeovers</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="text-muted">Progress</span>
                  <span>
                    {currentEra.year}: {currentEra.label}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 dark:bg-[rgb(var(--input-200))] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-500 rounded-full transition-all"
                    style={{ width: `${eraProgress}%` }}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-[rgb(var(--input-200))] pt-3">
                <h3 className="text-xs font-mono text-muted mb-2">SIEM Feed</h3>
                <div className="h-56 overflow-y-auto space-y-1 font-mono text-xs">
                  {siemLog.length === 0 && (
                    <div className="text-muted italic">No events yet — start the simulation.</div>
                  )}
                  {siemLog.map((line, i) => (
                    <div
                      key={i}
                      className={`leading-relaxed ${
                        line.includes('CRITICAL')
                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                          : line.includes('WARN')
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
