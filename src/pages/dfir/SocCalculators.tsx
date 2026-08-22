import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Calculator, Gauge, ShieldAlert, BellOff, HardDrive } from 'lucide-react';

function fmt(n: number, digits = 1): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function NumberField({
  value,
  onChange,
  suffix,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-micro font-mono uppercase tracking-wider text-slate-400">{placeholder ?? 'Input'}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full px-2.5 py-1.5 rounded-lg text-sm font-mono bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-heading focus:outline-none focus:border-brand-500"
        />
        {suffix && <span className="text-xs font-mono text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function Result({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const tones = {
    default: 'text-heading',
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-rose-600 dark:text-rose-400',
  };
  return (
    <div className="surface-card p-4 text-center">
      <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-mono font-bold ${tones[tone]}`}>{value}</div>
      {hint && <div className="text-micro font-mono text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function Panel({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="font-display font-semibold text-sm text-heading">{title}</h2>
      </div>
      <p className="text-xs font-mono text-muted mb-4">{hint}</p>
      {children}
    </section>
  );
}

export default function SocCalculators() {
  // Alert fatigue
  const [alertsPerDay, setAlertsPerDay] = useState('2500');
  const [investigateMin, setInvestigateMin] = useState('10');
  const [analysts, setAnalysts] = useState('5');
  const [shiftHrs, setShiftHrs] = useState('8');

  // SOAR ROI
  const [monthlyEscalations, setMonthlyEscalations] = useState('1200');
  const [autoRate, setAutoRate] = useState('55');
  const [minutesPerAlert, setMinutesPerAlert] = useState('18');
  const [securityHourlyRate, setSecurityHourlyRate] = useState('85');
  const [platformCost, setPlatformCost] = useState('4500');

  // EDR maturity
  const [endpoints, setEndpoints] = useState('2000');
  const [mttrHrs, setMttrHrs] = useState('72');
  const [breakouts, setBreakouts] = useState('14');
  const [coveragePct, setCoveragePct] = useState('80');

  // Log volume
  const [eps, setEps] = useState('5000');
  const [daysRetained, setDaysRetained] = useState('90');
  const [daysPerDay, setDaysPerDay] = useState('30');
  const [avgBytesLogged, setAvgBytesLogged] = useState('800');

  const fatigue = useMemo(() => {
    const a = Number(alertsPerDay) || 0;
    const m = Number(investigateMin) || 0;
    const n = Number(analysts) || 1;
    const h = Number(shiftHrs) || 8;
    const minsNeeded = (a * m) / 60;
    const capacity = n * h;
    const pct = ((a * m) / (n * h * 60)) * 100;
    return { alerts: a, minsNeeded, capacity, pct };
  }, [alertsPerDay, investigateMin, analysts, shiftHrs]);

  const roi = useMemo(() => {
    const e = Number(monthlyEscalations) || 0;
    const r = (Number(autoRate) || 0) / 100;
    const m = Number(minutesPerAlert) || 0;
    const rate = Number(securityHourlyRate) || 0;
    const cost = Number(platformCost) || 0;
    const automated = e * r;
    const savedHrs = (automated * m) / 60;
    const saved = savedHrs * rate;
    const net = saved - cost;
    const roiPct = cost > 0 ? (net / cost) * 100 : 0;
    return { automated, savedHrs, saved, net, roiPct };
  }, [monthlyEscalations, autoRate, minutesPerAlert, securityHourlyRate, platformCost]);

  const edr = useMemo(() => {
    const e = Number(endpoints) || 0;
    const m = Number(mttrHrs) || 0;
    const b = Number(breakouts) || 0;
    const c = (Number(coveragePct) || 0) / 100;
    const ifr = b / Math.max(1, m / 24); // incident frequency rate per day
    const exposure = e * (1 - c);
    const score = Math.max(
      0,
      Math.min(100, Math.round(80 * c + 10 * Math.max(0, 1 - m / 168) - ifr * 6 + (b === 0 ? 10 : 0)))
    );
    const verdict: 'Strong' | 'Developing' | 'Risky' = score >= 70 ? 'Strong' : score >= 45 ? 'Developing' : 'Risky';
    return { ifr, exposure, score, verdict };
  }, [endpoints, mttrHrs, breakouts, coveragePct]);

  const volume = useMemo(() => {
    const epsN = Number(eps) || 0;
    const d = Number(daysRetained) || 0;
    const perDay = Number(daysPerDay) || 1;
    const consumedPerDay = (epsN * perDay * 86400) / 1024 ** 3;
    const total = consumedPerDay * (d / perDay);
    const bytesWritten = (epsN * 86400 * (Number(avgBytesLogged) || 0)) / 1024 ** 4;
    return { consumedPerDay, total, bytesWritten };
  }, [eps, daysRetained, daysPerDay, avgBytesLogged]);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Calculator />}
      title="SOC Calculators"
      description="Four analyst-facing estimators — alert fatigue, SOAR ROI, EDR maturity score, and log volume — all computed in your browser."
      maxWidthClass="max-w-5xl"
    >
      <div className="space-y-6">
        <Panel
          icon={<BellOff size={15} className="text-amber-500" />}
          title="Alert Fatigue"
          hint="How hard is your queue to clear with today's headcount? SANS guidance: analysts triage ~10 alerts/hour effectively."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <NumberField
              value={alertsPerDay}
              onChange={setAlertsPerDay}
              suffix="alerts/day"
              placeholder="Alerts per day"
            />
            <NumberField value={investigateMin} onChange={setInvestigateMin} suffix="min" placeholder="Min per alert" />
            <NumberField value={analysts} onChange={setAnalysts} suffix="FTEs" placeholder="Analysts" />
            <NumberField value={shiftHrs} onChange={setShiftHrs} suffix="hrs" placeholder="Shift hours" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Result label="Workload" value={`${fmt(fatigue.minsNeeded, 0)} min/day`} />
            <Result label="Team capacity" value={`${fmt(fatigue.capacity * 60, 0)} min/day`} />
            <Result
              label="Queue coverage"
              value={`${fmt(fatigue.pct, 0)}%`}
              tone={fatigue.pct > 100 ? 'bad' : fatigue.pct > 85 ? 'warn' : 'good'}
              hint={
                fatigue.pct > 100 ? 'overflowing — triage will slip' : fatigue.pct > 85 ? 'near saturation' : 'cleared'
              }
            />
          </div>
        </Panel>

        <Panel
          icon={<Gauge size={15} className="text-emerald-500" />}
          title="SOAR ROI"
          hint="Automated triage saves analyst minutes on every auto-resolved alert (pattern: 50–70% auto-rate is reachable)."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-4">
            <NumberField
              value={monthlyEscalations}
              onChange={setMonthlyEscalations}
              suffix="alerts"
              placeholder="Escalations/month"
            />
            <NumberField value={autoRate} onChange={setAutoRate} suffix="%" placeholder="Auto-rate" />
            <NumberField
              value={minutesPerAlert}
              onChange={setMinutesPerAlert}
              suffix="min"
              placeholder="Min per alert"
            />
            <NumberField
              value={securityHourlyRate}
              onChange={setSecurityHourlyRate}
              suffix="$/hr"
              placeholder="Analyst rate"
            />
            <NumberField value={platformCost} onChange={setPlatformCost} suffix="$/mo" placeholder="Platform cost" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Result label="Auto-resolved" value={`${fmt(roi.automated, 0)}/mo`} />
            <Result label="Hours saved" value={`${fmt(roi.savedHrs, 0)} hrs/mo`} />
            <Result label="Value saved" value={`$${fmt(roi.saved, 0)}/mo`} />
            <Result
              label="Net ROI"
              value={`${fmt(roi.roiPct, 0)}%`}
              tone={roi.roiPct <= 0 ? 'bad' : roi.roiPct < 100 ? 'warn' : 'good'}
              hint={`net $${fmt(roi.net, 0)}/mo`}
            />
          </div>
        </Panel>

        <Panel
          icon={<ShieldAlert size={15} className="text-rose-500" />}
          title="EDR Maturity Score"
          hint="A single 0–100 readiness number from coverage, MTTR and breakout frequency — 70+ roughly means 'respond before mid-game'."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <NumberField value={endpoints} onChange={setEndpoints} suffix="devices" placeholder="Endpoints" />
            <NumberField value={mttrHrs} onChange={setMttrHrs} suffix="hrs" placeholder="MTTR (hours)" />
            <NumberField value={breakouts} onChange={setBreakouts} suffix="events/30d" placeholder="Breakouts / 30d" />
            <NumberField value={coveragePct} onChange={setCoveragePct} suffix="%" placeholder="Coverage" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Result
              label="Maturity score"
              value={`${edr.score}/100`}
              tone={edr.score >= 70 ? 'good' : edr.score >= 45 ? 'warn' : 'bad'}
            />
            <Result
              label="Verdict"
              value={edr.verdict}
              tone={edr.score >= 70 ? 'good' : edr.score >= 45 ? 'warn' : 'bad'}
            />
            <Result label="Unprotected" value={`${fmt(edr.exposure, 0)} devices`} hint="coverage gap" />
          </div>
        </Panel>

        <Panel
          icon={<HardDrive size={15} className="text-sky-500" />}
          title="Log Volume"
          hint="Estimate daily ingest and retention footprint from events-per-second — watch 100GB/day ≈ 1TB/10 days creep."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <NumberField value={eps} onChange={setEps} suffix="EPS" placeholder="Events / second" />
            <NumberField value={daysRetained} onChange={setDaysRetained} suffix="days" placeholder="Retention" />
            <NumberField value={daysPerDay} onChange={setDaysPerDay} suffix="GB/day" placeholder="Inbound GB/day" />
            <NumberField value={avgBytesLogged} onChange={setAvgBytesLogged} suffix="B" placeholder="Avg bytes/event" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Result
              label="Daily ingest"
              value={`${fmt(volume.consumedPerDay, 1)} GB/day`}
              hint={`or ${fmt(volume.bytesWritten, 1)} TB/day raw write-out`}
            />
            <Result
              label="Retention footprint"
              value={`${fmt(volume.total, 1)} GB`}
              tone={volume.total > 5000 ? 'warn' : 'default'}
              hint={`at ${daysRetained} days retention`}
            />
          </div>
        </Panel>

        <div className="text-center pt-2 pb-2 text-xs text-muted border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Estimates only — plug in your own averages (your EPS, your analyst wage, your auto-rate) for planning
          conversations, not commitments.
        </div>
      </div>
    </DataPageLayout>
  );
}
