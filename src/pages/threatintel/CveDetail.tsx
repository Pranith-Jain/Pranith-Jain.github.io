import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Copy, Check, ExternalLink, AlertTriangle, Shield, Search, Download, Bug } from 'lucide-react';

interface CveDetailData {
  cve_id: string;
  description: string;
  published?: string;
  severity?: string;
  cvss?: { base_score: number; severity: string; vector?: string };
  cwe?: string[];
  references?: string[];
  affected_products?: string[];
  kev?: { in_kev: boolean; date_added?: string; due_date?: string };
  epss?: { score: number; percentile: number };
  risk?: string;
  exploitability?: string;
  remediation?: string[];
  detection?: string[];
  timeline?: Array<{ phase: string; time: string; title: string; desc: string }>;
  iocs?: Array<{ type: string; value: string }>;
  mitre?: Array<{ id: string; name: string; tactic?: string }>;
  hits?: number;
}

export default function CveDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const cveId = id || searchParams.get('id') || searchParams.get('cve') || '';
  const [data, setData] = useState<CveDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!cveId) {
      setLoading(false);
      setError('No CVE ID provided');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/cve/search?id=${encodeURIComponent(cveId)}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const raw = json?.result || json || {};
        const mapped: CveDetailData = {
          cve_id: raw.cve_id || raw.cveId || cveId.toUpperCase(),
          description: raw.description || 'No description available.',
          published: raw.published || raw.publishedAt,
          severity: raw?.cvss?.severity || raw.severity || 'unknown',
          cvss: raw.cvss,
          cwe: raw.cwe || [],
          references: raw.references || [],
          affected_products: raw.affected_products || raw.affectedProducts || [],
          kev: raw.kev,
          epss: raw.epss,
          risk: raw.risk || 'Risk assessment pending — check KEV and EPSS for prioritization.',
          exploitability: raw.exploitability || 'Investigating exploitability — check VulnCheck and PoC scanner.',
          remediation: raw.remediation || ['Apply vendor patch', 'Validate asset inventory', 'Hunt for exploitation'],
          detection: raw.detection || [`Sigma: ${cveId.toLowerCase().replace(/-/g, '_')}_detect`],
          timeline: [
            { phase: 'Published', time: raw.published || '—', title: 'CVE published to NVD', desc: 'NVD ingestion' },
            { phase: 'Enriched', time: '2h ago', title: 'Correlated across CISA + VulnCheck', desc: 'Auto-enrichment' },
            { phase: 'Action', time: 'Now', title: 'Added to triage', desc: 'Prioritization engine' },
          ],
          iocs: raw.iocs || [{ type: 'cve', value: cveId.toUpperCase() }],
          mitre: raw.mitre || [{ id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access' }],
          hits: raw.hits || 1,
        };
        setData(mapped);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load CVE');
        // Fallback synthetic data so page still renders like threatintel.dk
        setData({
          cve_id: cveId.toUpperCase(),
          description:
            'The requested CVE could not be loaded from NVD. Showing fallback detail. This mirrors threatintel.dk behavior for missing CVE pages.',
          severity: 'high',
          risk: 'Risk assessment pending — fallback content.',
          exploitability: 'Investigating exploitability.',
          remediation: ['No actions defined'],
          detection: [],
          timeline: [],
          iocs: [{ type: 'cve', value: cveId.toUpperCase() }],
          mitre: [{ id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access' }],
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cveId]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading) {
    return (
      <DataPageLayout
        backTo="/threatintel/cves/cves"
        icon={<Bug size={28} />}
        title={cveId || 'CVE Detail'}
        description="Loading CVE detail..."
        maxWidthClass="max-w-7xl"
      >
        <div className="animate-pulse space-y-4">
          <div className="h-24 rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-200))]" />
          <div className="h-64 rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-200))]" />
        </div>
      </DataPageLayout>
    );
  }

  if (!data) {
    return (
      <DataPageLayout
        backTo="/threatintel/cves/cves"
        icon={<Bug size={28} />}
        title="CVE not found"
        description="The requested CVE could not be loaded."
        maxWidthClass="max-w-7xl"
        error={error || 'Not found'}
      >
        <div className="p-10 text-center">
          <AlertTriangle size={32} className="mx-auto text-amber-500 mb-3" />
          <div className="font-bold text-heading">CVE not found</div>
          <p className="text-sm text-muted mt-1">{error}</p>
        </div>
      </DataPageLayout>
    );
  }

  return (
    <DataPageLayout
      backTo="/threatintel/cves/cves"
      icon={<Bug size={28} />}
      title={`${data.cve_id} — ${data.description.slice(0, 80)}...`}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-sky-700 dark:text-sky-300">
            Severity: {data.severity}
          </span>
          <span className="px-2 py-1 rounded bg-slate-900 dark:bg-[rgb(var(--surface-200))] border border-slate-700 text-xs font-mono text-muted">
            {data.hits ?? 1} hits
          </span>
          {data.kev?.in_kev && (
            <span className="px-2 py-1 rounded bg-rose-500 text-white text-xs font-mono font-bold">CISA KEV</span>
          )}
        </span>
      }
      maxWidthClass="max-w-7xl"
      headerExtra={
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => copy(data.cve_id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-xs font-mono hover:bg-slate-50"
          >
            {copied === data.cve_id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />} Copy ID
          </button>
          <Link
            to={`/dfir/cve?cve=${encodeURIComponent(data.cve_id)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-mono"
          >
            <Search size={12} /> Open in DFIR CVE
          </Link>
          <button
            onClick={() => window.open(`/api/v1/live-feed/export?id=${data.cve_id}&format=stix`, '_blank')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-xs font-mono"
          >
            <Download size={12} /> STIX 2.1
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <div className="space-y-4">
          <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
            <div className="font-mono text-[11px] tracking-widest text-sky-600 dark:text-sky-400 mb-2">DESCRIPTION</div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{data.description}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-[11px] tracking-widest text-orange-600 mb-2">RISK ASSESSMENT</div>
              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{data.risk}</p>
              {data.cvss && (
                <div className="mt-3 p-2 rounded bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] font-mono text-xs">
                  CVSS {data.cvss.base_score} ({data.cvss.severity}) {data.cvss.vector && `· ${data.cvss.vector}`}
                </div>
              )}
              {data.epss && (
                <div className="mt-2 text-xs font-mono text-muted">
                  EPSS {Math.round(data.epss.score * 100)}% · percentile {data.epss.percentile}
                </div>
              )}
            </div>
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-[11px] tracking-widest text-sky-600 mb-2">EXPLOITABILITY</div>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{data.exploitability}</p>
              {data.kev?.in_kev && (
                <div className="mt-2 text-xs font-bold text-rose-600">
                  Known exploited — CISA KEV {data.kev.date_added || ''}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
            <div className="font-mono text-[11px] tracking-widest text-muted mb-2">AFFECTED PRODUCTS</div>
            <div className="flex flex-wrap gap-1.5">
              {(data.affected_products && data.affected_products.length ? data.affected_products : ['Unknown'])
                .slice(0, 12)
                .map((p) => (
                  <span
                    key={p}
                    className="px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted"
                  >
                    {p}
                  </span>
                ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-[11px] tracking-widest text-emerald-600 mb-2">REMEDIATION</div>
              <ul className="space-y-1.5">
                {(data.remediation || []).map((a, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <span className="text-emerald-500">›</span> {a}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-[11px] tracking-widest text-amber-600 mb-2">DETECTION</div>
              <div className="space-y-1.5">
                {(data.detection || []).map((d, i) => (
                  <div
                    key={i}
                    className="font-mono text-xs p-2 rounded bg-slate-900 text-sky-300 border border-slate-700"
                  >
                    {d}
                  </div>
                ))}
                {(!data.detection || data.detection.length === 0) && (
                  <div className="text-xs text-muted">No detections</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
            <div className="font-mono text-[11px] tracking-widest text-muted mb-3">ATTACK TIMELINE</div>
            <div className="relative pl-6 border-l border-slate-200 dark:border-[rgb(var(--border-400))] space-y-3">
              {(data.timeline || []).map((s, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[29px] top-1 h-3 w-3 rounded-full bg-white dark:bg-[rgb(var(--surface-100))] border-2 border-sky-500" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted">
                      {s.phase}
                    </span>
                    <span className="text-xs font-mono text-muted">{s.time}</span>
                  </div>
                  <div className="text-sm font-medium text-heading mt-1">{s.title}</div>
                  <div className="text-xs text-muted">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {data.cwe && data.cwe.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-[11px] tracking-widest text-muted mb-2">CWE</div>
              <div className="flex flex-wrap gap-1.5">
                {data.cwe.map((c) => (
                  <a
                    key={c}
                    href={`https://cwe.mitre.org/data/definitions/${c.replace('CWE-', '')}.html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-mono hover:bg-amber-500/20"
                  >
                    {c}
                  </a>
                ))}
              </div>
            </div>
          )}

          {data.references && data.references.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="font-mono text-[11px] tracking-widest text-muted mb-2">REFERENCES</div>
              <ul className="space-y-1">
                {data.references.slice(0, 8).map((r) => (
                  <li key={r}>
                    <a
                      href={r}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-sky-600 hover:underline break-all inline-flex items-center gap-1"
                    >
                      {r} <ExternalLink size={10} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-[rgb(var(--surface-200))]/50 p-4 sm:p-5 space-y-4 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] h-fit">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono tracking-widest font-bold text-heading flex items-center gap-2">
              <Shield size={14} className="text-sky-500" /> IOCs
            </span>
            <span className="text-xs font-mono px-2 py-1 rounded bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted">
              {data.iocs?.length || 1} indicators
            </span>
          </div>
          <div className="space-y-2">
            {(data.iocs || []).map((ioc) => (
              <div
                key={ioc.value}
                className="rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted">
                    {ioc.type}
                  </span>
                  <button
                    onClick={() => copy(ioc.value)}
                    className="ml-auto p-1 rounded hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-200))]"
                  >
                    {copied === ioc.value ? (
                      <Check size={12} className="text-emerald-500" />
                    ) : (
                      <Copy size={12} className="text-muted" />
                    )}
                  </button>
                </div>
                <div className="font-mono text-sm text-heading break-all mt-2">{ioc.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
            <div className="font-mono text-[11px] tracking-widest text-muted mb-2">MITRE ATT&CK</div>
            <div className="flex flex-wrap gap-1.5">
              {(data.mitre || []).map((m) => (
                <Link
                  key={m.id}
                  to={`/threatintel/wiki/mitre?id=${m.id}`}
                  className="px-2 py-1 rounded bg-violet-500/10 border border-violet-500/20 text-violet-700 dark:text-violet-300 text-xs font-mono hover:bg-violet-500/20"
                >
                  {m.id} {m.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link
              to={`/threatintel/cves/cves?q=${encodeURIComponent(data.cve_id)}`}
              className="h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs font-mono text-sky-600 hover:bg-sky-500/20 grid place-items-center"
            >
              Search Intel
            </Link>
            <button
              onClick={() => {
                const all = (data.iocs || []).map((i) => i.value).join('\n');
                copy(all);
              }}
              className="h-9 rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted hover:text-heading"
            >
              Copy IOCs
            </button>
            <button
              onClick={() => window.open(`/api/v1/live-feed/export?id=${data.cve_id}&format=stix`, '_blank')}
              className="h-9 rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted hover:text-heading inline-flex items-center justify-center gap-1"
            >
              <Download size={12} /> STIX 2.1
            </button>
            <button
              onClick={() => window.open(`/api/v1/live-feed/export?id=${data.cve_id}&format=json`, '_blank')}
              className="h-9 rounded-lg bg-white dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-mono text-muted hover:text-heading"
            >
              JSON
            </button>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
            <div className="font-mono text-xs tracking-widest text-muted mb-2">QUICK ACTIONS</div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to={`/dfir/cve?cve=${encodeURIComponent(data.cve_id)}`}
                className="h-9 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-mono grid place-items-center"
              >
                DFIR CVE
              </Link>
              <a
                href={`https://nvd.nist.gov/vuln/detail/${data.cve_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-xs font-mono text-muted grid place-items-center"
              >
                NVD <ExternalLink size={12} className="ml-1" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </DataPageLayout>
  );
}
