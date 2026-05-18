import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, ShieldAlert, ShieldX, Info, Loader2 } from 'lucide-react';

/**
 * CVE Exploit Prioritizer.
 *
 * Paste a list of CVE IDs. Each is enriched via the site's own
 * /api/v1/cve/lookup (NVD CVSS + FIRST EPSS + CISA KEV incl. known
 * ransomware use) and reduced to a single patch-priority verdict:
 *
 *   ACT NOW  — in CISA KEV (actively exploited) — ransomware-flagged first
 *   SCHEDULE — not KEV but very high exploitation likelihood / CVSS ≥ 9
 *   MONITOR  — elevated CVSS or EPSS
 *   DEFER    — low signal across all three sources
 *
 * The point: CVSS alone over-prioritises. KEV + EPSS + ransomware-use is
 * how you decide what to patch this week.
 */

type Sev = 'critical' | 'high' | 'medium' | 'low' | 'info';

const SEV_STYLE: Record<Sev, { text: string; chip: string; Icon: typeof ShieldAlert }> = {
  critical: {
    text: 'text-rose-700 dark:text-rose-300',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: ShieldX,
  },
  high: {
    text: 'text-rose-600 dark:text-rose-400',
    chip: 'border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400',
    Icon: ShieldAlert,
  },
  medium: {
    text: 'text-amber-700 dark:text-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  low: {
    text: 'text-sky-700 dark:text-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    Icon: Info,
  },
  info: {
    text: 'text-slate-600 dark:text-slate-400',
    chip: 'border-slate-400/30 bg-slate-400/10 text-slate-600 dark:text-slate-400',
    Icon: Info,
  },
};

interface CveLookup {
  cve_id: string;
  cvss?: { base_score: number; severity: string };
  kev: { in_kev: boolean; known_ransomware?: boolean; due_date?: string };
  epss?: { score: number; percentile: number };
}

type Verdict = 'ACT NOW' | 'SCHEDULE' | 'MONITOR' | 'DEFER';

interface Row {
  id: string;
  loading: boolean;
  error?: string;
  data?: CveLookup;
  verdict?: Verdict;
  sev?: Sev;
  rank?: number;
  why?: string;
}

const VERDICT_SEV: Record<Verdict, Sev> = { 'ACT NOW': 'critical', SCHEDULE: 'high', MONITOR: 'medium', DEFER: 'low' };
const VERDICT_RANK: Record<Verdict, number> = { 'ACT NOW': 0, SCHEDULE: 1, MONITOR: 2, DEFER: 3 };

function decide(d: CveLookup): { verdict: Verdict; why: string } {
  const cvss = d.cvss?.base_score ?? 0;
  const epssPct = d.epss?.percentile ?? 0;
  const epss = d.epss?.score ?? 0;
  if (d.kev.in_kev && d.kev.known_ransomware)
    return { verdict: 'ACT NOW', why: 'In CISA KEV and tied to known ransomware campaigns — actively exploited.' };
  if (d.kev.in_kev)
    return {
      verdict: 'ACT NOW',
      why: `In CISA KEV — confirmed active exploitation${d.kev.due_date ? ` (remediate by ${d.kev.due_date})` : ''}.`,
    };
  if (epssPct >= 0.95 || epss >= 0.5)
    return {
      verdict: 'SCHEDULE',
      why: `Very high exploitation likelihood (EPSS ${(epss * 100).toFixed(1)}%, top ${((1 - epssPct) * 100).toFixed(1)}%).`,
    };
  if (cvss >= 9)
    return { verdict: 'SCHEDULE', why: `Critical CVSS ${cvss.toFixed(1)} — patch in the next cycle even without KEV.` };
  if (cvss >= 7 || epssPct >= 0.7)
    return {
      verdict: 'MONITOR',
      why: `Elevated severity (CVSS ${cvss.toFixed(1)}, EPSS pct ${(epssPct * 100).toFixed(0)}%) but no active-exploitation signal.`,
    };
  return { verdict: 'DEFER', why: 'No KEV, low EPSS, sub-high CVSS — low real-world risk; patch on normal cadence.' };
}

const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;
const MAX = 60;

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

export default function CvePrioritizer(): JSX.Element {
  const [input, setInput] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    const ids = Array.from(new Set((input.toUpperCase().match(CVE_RE) ?? []).map((s) => s.toUpperCase()))).slice(
      0,
      MAX
    );
    if (ids.length === 0) {
      setRows([]);
      return;
    }
    setRunning(true);
    setRows(ids.map((id) => ({ id, loading: true })));
    const results = await pool(ids, 5, async (id): Promise<Row> => {
      try {
        const r = await fetch(`/api/v1/cve/lookup?id=${encodeURIComponent(id)}`);
        if (!r.ok) return { id, loading: false, error: `lookup HTTP ${r.status}` };
        const data = (await r.json()) as CveLookup;
        const { verdict, why } = decide(data);
        return { id, loading: false, data, verdict, sev: VERDICT_SEV[verdict], rank: VERDICT_RANK[verdict], why };
      } catch (e) {
        return { id, loading: false, error: (e as Error).message };
      }
    });
    results.sort(
      (a, b) => (a.rank ?? 9) - (b.rank ?? 9) || (b.data?.cvss?.base_score ?? 0) - (a.data?.cvss?.base_score ?? 0)
    );
    setRows(results);
    setRunning(false);
  };

  const counts = rows.reduce<Record<Verdict, number>>(
    (acc, r) => {
      if (r.verdict) acc[r.verdict] += 1;
      return acc;
    },
    { 'ACT NOW': 0, SCHEDULE: 0, MONITOR: 0, DEFER: 0 }
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2">CVE Exploit Prioritizer</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-2xl">
          Paste CVE IDs (any format — IDs are extracted). Each is enriched with NVD CVSS + FIRST EPSS + CISA KEV (incl.
          known-ransomware use) and reduced to one patch-priority verdict. CVSS alone over-prioritises —
          KEV&nbsp;+&nbsp;EPSS is how you pick what to patch this week.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setInput('CVE-2021-44228, CVE-2023-23397\nCVE-2014-0160 CVE-2024-3094')}
            className="text-[12px] font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
          >
            load example
          </button>
          {input && (
            <button
              type="button"
              onClick={() => {
                setInput('');
                setRows([]);
              }}
              className="text-[12px] font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <label htmlFor="cve-input" className="sr-only">
        CVE IDs
      </label>
      <textarea
        id="cve-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="CVE-2021-44228, CVE-2023-23397, CVE-2024-3094 …"
        rows={6}
        spellCheck={false}
        aria-label="CVE IDs"
        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
      />
      <button
        type="button"
        onClick={() => void run()}
        disabled={running || !input.trim()}
        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 dark:bg-brand-500 text-white font-mono text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-brand-700 dark:hover:bg-brand-400"
      >
        {running && <Loader2 size={14} className="animate-spin" />}
        {running ? 'enriching…' : 'prioritize'}
      </button>

      {rows.length > 0 && (
        <div className="mt-8 space-y-6">
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex flex-wrap gap-1.5 text-sm">
              {(['ACT NOW', 'SCHEDULE', 'MONITOR', 'DEFER'] as Verdict[])
                .filter((v) => counts[v] > 0)
                .map((v) => (
                  <span
                    key={v}
                    className={`text-[11px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_STYLE[VERDICT_SEV[v]].chip}`}
                  >
                    {counts[v]} {v}
                  </span>
                ))}
              <span className="text-[11px] font-mono text-slate-500 px-1.5 py-0.5">{rows.length} CVE(s)</span>
            </div>
          </section>

          <section className="space-y-3">
            {rows.map((r) => {
              const st = SEV_STYLE[r.sev ?? 'info'];
              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
                >
                  <div className="flex items-start gap-2.5">
                    {r.loading ? (
                      <Loader2 size={16} className="mt-0.5 flex-shrink-0 animate-spin text-slate-400" />
                    ) : (
                      <st.Icon size={16} className={`mt-0.5 flex-shrink-0 ${st.text}`} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold">{r.id}</span>
                        {r.verdict && (
                          <span
                            className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${st.chip}`}
                          >
                            {r.verdict}
                          </span>
                        )}
                        {r.loading && <span className="text-[11px] font-mono text-slate-500">enriching…</span>}
                        {r.error && <span className="text-[11px] font-mono text-rose-500">{r.error}</span>}
                      </div>
                      {r.data && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] font-mono text-slate-600 dark:text-slate-400">
                          <span>
                            CVSS{' '}
                            <span className="text-slate-900 dark:text-slate-100">
                              {r.data.cvss ? `${r.data.cvss.base_score.toFixed(1)} ${r.data.cvss.severity}` : 'n/a'}
                            </span>
                          </span>
                          <span>
                            EPSS{' '}
                            <span className="text-slate-900 dark:text-slate-100">
                              {r.data.epss
                                ? `${(r.data.epss.score * 100).toFixed(1)}% · pct ${(r.data.epss.percentile * 100).toFixed(0)}`
                                : 'n/a'}
                            </span>
                          </span>
                          <span>
                            KEV{' '}
                            <span className={r.data.kev.in_kev ? st.text : 'text-slate-900 dark:text-slate-100'}>
                              {r.data.kev.in_kev ? 'yes' : 'no'}
                            </span>
                          </span>
                          <span>
                            Ransomware{' '}
                            <span
                              className={r.data.kev.known_ransomware ? st.text : 'text-slate-900 dark:text-slate-100'}
                            >
                              {r.data.kev.known_ransomware ? 'yes' : 'no'}
                            </span>
                          </span>
                        </div>
                      )}
                      {r.why && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{r.why}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}
