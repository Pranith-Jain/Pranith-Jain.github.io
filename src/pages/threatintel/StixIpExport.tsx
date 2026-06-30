import { useCallback, useState } from 'react';
import { FileText, Search, Download, Copy, Check, AlertTriangle } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { fetchJson } from '../../lib/fetch-helpers';

interface EnrichResult {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  org?: string;
  asn?: string;
  is_vpn?: boolean;
  vpn_network?: string;
  abuse_confidence_score?: number;
  total_reports?: number;
  isp?: string;
  usage_type?: string;
  threat_detected?: boolean;
  shodan_ports?: number[];
  shodan_tags?: string[];
  shodan_vulns?: string[];
  shodan_hostnames?: string[];
  diagnostics: Array<{ provider: string; status: string; ms: number; error?: string }>;
}

interface StixBundle {
  type: string;
  id: string;
  spec_version: string;
  created: string;
  objects: Array<Record<string, unknown>>;
}

interface StixEnrichResponse {
  enrichment: EnrichResult;
  stix_bundle: StixBundle;
  stix_object_count: number;
}

interface StixBatchResponse {
  enrichments: EnrichResult[];
  invalid_ips: string[];
  stix_bundle: StixBundle;
  stix_object_count: number;
}

function confidenceColor(c: number): string {
  if (c >= 80) return 'text-red-600 dark:text-red-400';
  if (c >= 60) return 'text-amber-600 dark:text-amber-400';
  if (c >= 40) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}

function computeConfidence(r: EnrichResult): number {
  const ok = r.diagnostics.filter((d) => d.status === 'ok').length;
  const total = r.diagnostics.length || 1;
  let base = Math.round((ok / total) * 80);
  if (r.abuse_confidence_score && r.abuse_confidence_score > 50) base = Math.max(base, 70);
  if (r.threat_detected) base = Math.max(base, 80);
  if (r.is_vpn) base = Math.max(base, 60);
  return Math.min(base, 100);
}

function downloadStixJson(bundle: StixBundle, filename: string) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StixIpExport() {
  const [ipInput, setIpInput] = useState('');
  const [tlp, setTlp] = useState<'WHITE' | 'GREEN' | 'AMBER' | 'RED'>('GREEN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StixEnrichResponse | null>(null);
  const [batchResult, setBatchResult] = useState<StixBatchResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const enrichSingle = useCallback(async () => {
    const ip = ipInput.trim();
    if (!ip) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setBatchResult(null);
    try {
      const r = await fetchJson<StixEnrichResponse>(
        `/api/v1/si/enrich-ip-stix?ip=${encodeURIComponent(ip)}&tlp=${tlp}`
      );
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrichment failed.');
    } finally {
      setLoading(false);
    }
  }, [ipInput, tlp]);

  const enrichBatch = useCallback(async () => {
    const ips = ipInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ips.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setBatchResult(null);
    try {
      const r = await fetchJson<StixBatchResponse>('/api/v1/si/enrich-ip-stix-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips, tlp }),
      });
      setBatchResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch enrichment failed.');
    } finally {
      setLoading(false);
    }
  }, [ipInput, tlp]);

  const bundle = result?.stix_bundle ?? batchResult?.stix_bundle;
  const enrichments = batchResult?.enrichments ?? (result ? [result.enrichment] : []);

  const copyJson = () => {
    if (!bundle) return;
    navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isBatch = ipInput.includes('\n') || ipInput.includes(',');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<FileText size={28} />}
      title="STIX IP Enrichment & Export"
      maxWidthClass="max-w-6xl"
      description={
        <>
          Enrich IP addresses via IPinfo/AbuseIPDB/Shodan/VPNAPI and export as a STIX 2.1 bundle. Import into OpenCTI,
          MISP, or any TAXII 2.1 consumer.
        </>
      }
      loading={loading}
      error={error}
      onRetry={() => {
        setError(null);
        void enrichSingle();
      }}
    >
      <div className="space-y-6">
        {/* Input panel */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[250px]">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                IP address{isBatch ? 'es (one per line or comma-separated)' : ''}
              </label>
              <textarea
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder={isBatch ? '203.0.113.42&#10;198.51.100.7' : '203.0.113.42'}
                rows={isBatch ? 4 : 1}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">TLP</label>
              <select
                value={tlp}
                onChange={(e) => setTlp(e.target.value as typeof tlp)}
                className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
              >
                <option value="WHITE">TLP:WHITE</option>
                <option value="GREEN">TLP:GREEN</option>
                <option value="AMBER">TLP:AMBER</option>
                <option value="RED">TLP:RED</option>
              </select>
            </div>
            <button
              onClick={isBatch ? enrichBatch : enrichSingle}
              disabled={loading || !ipInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              <Search size={14} />{' '}
              {loading
                ? 'Enriching...'
                : isBatch
                  ? `Enrich ${ipInput.split(/[\n,]+/).filter(Boolean).length} IPs`
                  : 'Enrich & Export'}
            </button>
          </div>
        </div>

        {/* Results */}
        {enrichments.length > 0 && (
          <div className="space-y-4">
            {/* Enrichment cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {enrichments.map((r) => {
                const conf = computeConfidence(r);
                return (
                  <div
                    key={r.ip}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{r.ip}</span>
                      <span className={`text-xs font-bold ${confidenceColor(conf)}`}>{conf}% confidence</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      {r.org && (
                        <div>
                          <span className="text-slate-400">Org:</span> {r.org}
                        </div>
                      )}
                      {r.country && (
                        <div>
                          <span className="text-slate-400">Country:</span> {r.country}
                        </div>
                      )}
                      {r.isp && (
                        <div>
                          <span className="text-slate-400">ISP:</span> {r.isp}
                        </div>
                      )}
                      {r.asn && (
                        <div>
                          <span className="text-slate-400">ASN:</span> {r.asn}
                        </div>
                      )}
                      {r.is_vpn && (
                        <div className="text-amber-600 dark:text-amber-400">
                          <AlertTriangle size={10} className="inline" /> VPN: {r.vpn_network ?? 'yes'}
                        </div>
                      )}
                      {r.abuse_confidence_score != null && (
                        <div className={r.abuse_confidence_score > 50 ? 'text-red-600 dark:text-red-400' : ''}>
                          Abuse: {r.abuse_confidence_score}%
                        </div>
                      )}
                      {r.shodan_ports?.length && (
                        <div>
                          <span className="text-slate-400">Ports:</span> {r.shodan_ports.join(', ')}
                        </div>
                      )}
                      {r.shodan_vulns?.length && (
                        <div className="col-span-2">
                          <span className="text-slate-400">Vulns:</span>{' '}
                          {r.shodan_vulns.slice(0, 5).map((v) => (
                            <a
                              key={v}
                              href={`https://nvd.nist.gov/vuln/detail/${v}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 dark:text-brand-400 hover:underline mr-2"
                            >
                              {v}
                            </a>
                          ))}
                          {r.shodan_vulns.length > 5 && (
                            <span className="text-slate-400">+{r.shodan_vulns.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* STIX bundle actions */}
            {bundle && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">STIX 2.1 Bundle</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {bundle.objects.length} objects · {bundle.id}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={copyJson}
                      className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      {copied ? 'Copied' : 'Copy JSON'}
                    </button>
                    <button
                      onClick={() =>
                        downloadStixJson(bundle, `stix-ip-export-${new Date().toISOString().slice(0, 10)}.json`)
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/70 transition-colors"
                    >
                      <Download size={12} /> Download .stix.json
                    </button>
                  </div>
                </div>
                {/* Object type breakdown */}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(
                    bundle.objects.reduce<Record<string, number>>((acc, o) => {
                      const t = String(o.type ?? 'unknown');
                      acc[t] = (acc[t] ?? 0) + 1;
                      return acc;
                    }, {})
                  ).map(([type, count]) => (
                    <span
                      key={type}
                      className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                    >
                      {type}: {String(count)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DataPageLayout>
  );
}
