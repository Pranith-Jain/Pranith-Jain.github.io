import { useEffect, useState } from 'react';

/**
 * "In the feed right now" — three live counts pulled from the same
 * endpoints the rest of /threatintel uses. Replaces the static
 * "N tools / N feeds" StatBar with concrete numbers from the data.
 *
 * Honest framing — these are counts of what the platform's ingested in
 * its window. Not "what we caught," not "industry-leading." A reviewer
 * can click through and verify every number.
 *
 * SSR-safe: numbers fade in client-side; the layout reserves space so
 * there's no shift when they land.
 */

interface RansomwareResponse {
  victims?: { discovered: string }[];
}
interface CveResponse {
  cves?: { published: string; kev?: boolean }[];
  kev_count?: number;
}
interface PulseResponse {
  entities?: { source_count: number }[];
}

function withinDays(iso: string | undefined, days: number, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return now - t < days * 24 * 60 * 60 * 1000;
}

export function FeedSnapshot() {
  const [counts, setCounts] = useState<{
    ransom7d: number | null;
    cve7d: number | null;
    kev7d: number | null;
    crossSrc: number | null;
  }>({ ransom7d: null, cve7d: null, kev7d: null, crossSrc: null });

  useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    const opts = { signal: ctrl.signal } as const;
    const now = Date.now();
    Promise.allSettled([
      fetch('/api/v1/ransomware-recent', opts).then(
        (r) => (r.ok ? r.json() : Promise.reject(r.status)) as Promise<RansomwareResponse>
      ),
      fetch('/api/v1/cve-recent', opts).then(
        (r) => (r.ok ? r.json() : Promise.reject(r.status)) as Promise<CveResponse>
      ),
      fetch('/api/v1/threat-pulse', opts).then(
        (r) => (r.ok ? r.json() : Promise.reject(r.status)) as Promise<PulseResponse>
      ),
    ]).then(([r, c, p]) => {
      if (!alive) return;
      const ransom7d =
        r.status === 'fulfilled'
          ? (r.value.victims ?? []).filter((v) => withinDays(v.discovered, 7, now)).length
          : null;
      const cveResp = c.status === 'fulfilled' ? c.value : null;
      const cve7d = cveResp?.cves ? cveResp.cves.filter((v) => withinDays(v.published, 7, now)).length : null;
      const kev7d = cveResp?.cves ? cveResp.cves.filter((v) => v.kev && withinDays(v.published, 7, now)).length : null;
      const crossSrc =
        p.status === 'fulfilled' ? (p.value.entities ?? []).filter((e) => e.source_count >= 3).length : null;
      setCounts({ ransom7d, cve7d, kev7d, crossSrc });
    });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, []);

  return (
    <section
      aria-label="What's in the feed right now"
      className="mb-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[11px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          In the feed right now · last 7 days
        </h2>
        <p className="text-[10px] font-mono text-slate-400">live · click through to verify</p>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 sm:[&>div+div]:border-l sm:[&>div+div]:border-slate-200/80 sm:[&>div+div]:pl-5 sm:[&>div+div]:dark:border-slate-800">
        <Cell label="Ransomware claims" value={counts.ransom7d} href="/threatintel/ransomware-activity" />
        <Cell label="New CVEs (published)" value={counts.cve7d} href="/threatintel/cve-list" />
        <Cell label="of those in KEV" value={counts.kev7d} href="/threatintel/cve-list?filter=kev" />
        <Cell label="Multi-source entities" value={counts.crossSrc} href="/threatintel/pulse" suffix="≥3 surfaces" />
      </dl>
    </section>
  );
}

function Cell({ label, value, href, suffix }: { label: string; value: number | null; href: string; suffix?: string }) {
  const display = value === null ? '—' : value.toLocaleString();
  return (
    <div>
      <dt className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1.5">
        {value === null ? (
          <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" aria-hidden="true" />
        ) : (
          <a
            href={href}
            className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums hover:text-brand-600 dark:hover:text-brand-400"
          >
            {display}
          </a>
        )}
        {suffix && <span className="text-[11px] font-mono text-slate-500">{suffix}</span>}
      </dd>
    </div>
  );
}
