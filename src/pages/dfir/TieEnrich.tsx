import { useState, useRef } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Search, Globe, Link, FileDigit, AlertTriangle } from 'lucide-react';

type IocType = 'ip' | 'hash' | 'domain' | 'url';

interface GeoData {
  country?: string;
  city?: string;
  org?: string;
  asn?: string;
  is_vpn?: boolean;
  [key: string]: unknown;
}

interface EnrichResult {
  ioc: string;
  iocType: IocType;
  reputation?: Record<string, unknown>;
  geo?: GeoData;
  phantomcandle?: Record<string, unknown>;
  domainIntel?: Record<string, unknown>;
  phishingAnalysis?: Record<string, unknown>;
  malpedia?: Record<string, unknown>;
  mitre?: Record<string, unknown>;
  diagnostics: Array<{ provider: string; status: string; ms: number; error?: string }>;
  report?: string;
  status?: string;
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  if (!data) return null;
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-cyan-700 dark:text-cyan-400 hover:text-cyan-600">
        {label} <span className="text-xs opacity-50">(click to expand)</span>
      </summary>
      <pre className="mt-1 max-h-96 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-[rgb(var(--surface-100))]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

function DiagnosticBadge({ d }: { d: { provider: string; status: string; ms: number; error?: string } }) {
  const color =
    d.status === 'ok'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300'
      : d.status === 'skipped'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
      title={d.error}
    >
      {d.provider}
      <span className="opacity-60">{d.ms}ms</span>
    </span>
  );
}

const IOC_LABELS: Record<IocType, string> = { ip: 'IP Address', hash: 'File Hash', domain: 'Domain', url: 'URL' };
const IOC_ICONS: Record<IocType, typeof Search> = { ip: Globe, hash: FileDigit, domain: Link, url: AlertTriangle };

export default function TieEnrich() {
  const [ioc, setIoc] = useState('');
  const [iocType, setIocType] = useState<IocType>('ip');
  const [deep, setDeep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnrichResult | null>(null);
  const [error, setError] = useState('');

  const submitRef = useRef<AbortController | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ioc.trim()) return;
    submitRef.current?.abort();
    const ctrl = new AbortController();
    submitRef.current = ctrl;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/v1/tie/enrich', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ioc: ioc.trim(), ioc_type: iocType, deep }),
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(30_000)]),
      });
      if (ctrl.signal.aborted) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      if (deep && data.id) {
        setResult({ ioc: ioc.trim(), iocType, status: 'running', diagnostics: [] });
        const evtSource = new EventSource(`/api/v1/tie/enrich/${data.id}/stream`);
        evtSource.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'done') {
              setResult({
                ioc: ioc.trim(),
                iocType,
                status: 'done',
                report: msg.report,
                diagnostics: [],
              });
              evtSource.close();
            } else if (msg.type === 'error') {
              setError(msg.error);
              evtSource.close();
            }
          } catch (_catchErr) {
            console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
            /* ignore parse errors */
          }
        };
        evtSource.onerror = () => {
          setError('Stream connection lost');
          evtSource.close();
        };
        setLoading(false);
        return;
      }

      setResult(data);
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  const Icon = IOC_ICONS[iocType];

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Shield size={28} />}
      title="Threat Intel Enrichment Agent"
      description="Enrich any IOC (IP, hash, domain, or URL) using 30+ threat intel providers. Fast deterministic mode for quick checks, deep autonomous mode for full investigation with report generation."
      maxWidthClass="max-w-4xl"
    >
      <form onSubmit={handleSubmit} className="mb-6 space-y-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={iocType}
            onChange={(e) => setIocType(e.target.value as IocType)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-[rgb(var(--surface-200))]"
          >
            {(['ip', 'hash', 'domain', 'url'] as IocType[]).map((t) => (
              <option key={t} value={t}>
                {IOC_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={ioc}
            onChange={(e) => setIoc(e.target.value)}
            placeholder={
              iocType === 'ip'
                ? '8.8.8.8'
                : iocType === 'hash'
                  ? 'sha256 hash...'
                  : iocType === 'domain'
                    ? 'example.com'
                    : 'https://...'
            }
            className="flex-1 min-w-[200px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-[rgb(var(--surface-200))]"
          />
          <button
            type="submit"
            disabled={loading || !ioc.trim()}
            className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            <Search size={16} />
            {loading ? 'Enriching...' : deep ? 'Deep Enrich' : 'Enrich'}
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} className="rounded" />
          Deep analysis (autonomous investigator — runs 3-5 steps, 10-30s, generates full report)
        </label>
      </form>

      {loading && !deep && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[rgb(var(--surface-200))]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
          <span className="text-sm text-slate-500">Running enrichment across providers...</span>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {result && result.status === 'done' && result.report && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-[rgb(var(--surface-200))]">
          <h2 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-200">Investigation Report</h2>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {result.report.split('\n').map((line, i) => (
              <p key={i} className="text-sm text-slate-700 dark:text-slate-300">
                {line || '\u00A0'}
              </p>
            ))}
          </div>
        </div>
      )}

      {result && result.status === 'running' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[rgb(var(--surface-200))]">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
            Investigation in progress...
          </div>
        </div>
      )}

      {result && !result.report && result.status !== 'running' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Icon size={20} className="text-cyan-600" />
            <span className="font-mono text-sm text-slate-800 dark:text-slate-200">{result.ioc}</span>
            <span className="text-xs text-slate-400">{IOC_LABELS[result.iocType]}</span>
          </div>

          {result.diagnostics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.diagnostics.map((d, i) => (
                <DiagnosticBadge key={i} d={d} />
              ))}
            </div>
          )}

          {result.geo && (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-[rgb(var(--surface-200))]/50">
              {result.geo.country && (
                <div>
                  <span className="font-medium">Country:</span> {result.geo.country}
                </div>
              )}
              {result.geo.city && (
                <div>
                  <span className="font-medium">City:</span> {result.geo.city}
                </div>
              )}
              {result.geo.org && (
                <div className="col-span-2">
                  <span className="font-medium">Org:</span> {result.geo.org}
                </div>
              )}
              {result.geo.asn && (
                <div>
                  <span className="font-medium">ASN:</span> {result.geo.asn}
                </div>
              )}
              {result.geo.is_vpn !== undefined && (
                <div>
                  <span className="font-medium">VPN/Proxy:</span> {String(result.geo.is_vpn)}
                </div>
              )}
            </div>
          )}

          {result.phantomcandle ? <JsonBlock label="PhantomCandle Attribution" data={result.phantomcandle} /> : null}

          {result.domainIntel ? <JsonBlock label="Domain Intelligence" data={result.domainIntel} /> : null}

          {result.phishingAnalysis ? <JsonBlock label="Phishing URL Analysis" data={result.phishingAnalysis} /> : null}

          {result.malpedia ? <JsonBlock label="Malpedia Lookup" data={result.malpedia} /> : null}

          {result.reputation ? <JsonBlock label="IOC Reputation (30+ providers)" data={result.reputation} /> : null}

          {result.mitre ? <JsonBlock label="MITRE ATT&CK Mapping" data={result.mitre} /> : null}
        </div>
      )}
    </DataPageLayout>
  );
}
