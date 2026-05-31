import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Upload,
  Shield,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe,
  Building2,
} from 'lucide-react';

interface IpEnrichment {
  org?: string;
  country?: string;
  country_code?: string;
  asn?: string;
  asname?: string;
  isp?: string;
}

interface DmarcRecord {
  sourceIp: string;
  count: number;
  disposition: string;
  spf: string;
  dkim: string;
  headerFrom: string;
  enrichment?: IpEnrichment;
}

interface DmarcReport {
  orgName: string;
  email: string;
  domain: string;
  policy: string;
  subdomainPolicy: string;
  pct: string;
  beginDate: string;
  endDate: string;
  records: DmarcRecord[];
}

function unzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const ds = new DecompressionStream('gzip');
    const blob = new Blob([buf]);
    const stream = blob.stream().pipeThrough(ds);
    new Response(stream).arrayBuffer().then(resolve).catch(reject);
  });
}

function parseDmarcXml(xml: string): DmarcReport {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) throw new Error('Invalid XML: ' + (parseError.textContent ?? '').slice(0, 200));

  const gte = (parent: Element | Document, tag: string): Element | null =>
    parent.getElementsByTagName(tag).length > 0 ? parent.getElementsByTagName(tag)[0] : null;

  const text = (parent: Element | Document, tag: string): string => gte(parent, tag)?.textContent?.trim() ?? '';

  const metadata = gte(doc, 'report_metadata');
  const policy = gte(doc, 'policy_published');
  const records = doc.getElementsByTagName('record');

  if (!metadata)
    throw new Error('Could not find <report_metadata> in XML — invalid or unsupported DMARC report format.');
  if (!policy)
    throw new Error('Could not find <policy_published> in XML — invalid or unsupported DMARC report format.');
  if (records.length === 0) throw new Error('No <record> elements found in XML — report may be empty.');

  const ipMap = new Map<string, DmarcRecord>();
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const row = gte(rec, 'row');
    if (!row) continue;
    const ip = text(row, 'source_ip');
    const count = parseInt(text(row, 'count'), 10) || 0;
    const evaluated = gte(row, 'policy_evaluated');
    if (!evaluated) continue;
    const disposition = text(evaluated, 'disposition');
    const spf = text(evaluated, 'spf');
    const dkim = text(evaluated, 'dkim');
    const headerFrom = text(rec, 'header_from');
    if (!ip) continue;

    const existing = ipMap.get(ip);
    if (existing) {
      existing.count += count;
      if (spf === 'pass' && existing.spf !== 'fail') existing.spf = 'pass';
      if (spf === 'fail') existing.spf = 'fail';
      if (dkim === 'pass' && existing.dkim !== 'fail') existing.dkim = 'pass';
      if (dkim === 'fail') existing.dkim = 'fail';
      if (disposition === 'reject' || disposition === 'quarantine') existing.disposition = disposition;
    } else {
      ipMap.set(ip, { sourceIp: ip, count, disposition, spf, dkim, headerFrom });
    }
  }

  const begin = parseInt(text(metadata, 'begin'), 10);
  const end = parseInt(text(metadata, 'end'), 10);

  return {
    orgName: text(metadata, 'org_name'),
    email: text(metadata, 'email'),
    domain: text(policy, 'domain'),
    policy: text(policy, 'p'),
    subdomainPolicy: text(policy, 'sp'),
    pct: text(policy, 'pct'),
    beginDate: begin ? new Date(begin * 1000).toISOString().slice(0, 10) : 'unknown',
    endDate: end ? new Date(end * 1000).toISOString().slice(0, 10) : 'unknown',
    records: Array.from(ipMap.values()).sort((a, b) => b.count - a.count),
  };
}

const RE_IP = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

async function enrichIp(ip: string, signal: AbortSignal): Promise<IpEnrichment | null> {
  try {
    const res = await fetch(`/api/v1/ip-geo?ip=${encodeURIComponent(ip)}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      geo?: { org?: string; country?: string; country_code?: string; asn?: string; asname?: string; isp?: string };
    };
    if (!data.geo || Object.keys(data.geo).length === 0) return null;
    return {
      org: data.geo?.org,
      country: data.geo?.country,
      country_code: data.geo?.country_code,
      asn: data.geo?.asn,
      asname: data.geo?.asname,
      isp: data.geo?.isp,
    };
  } catch {
    return null;
  }
}

export default function DmarcAnalyzer(): JSX.Element {
  const [report, setReport] = useState<DmarcReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const enrichAll = useCallback(async (records: DmarcRecord[]) => {
    const ips = records
      .map((r) => r.sourceIp)
      .filter((ip) => RE_IP.test(ip))
      .filter((ip, i, a) => a.indexOf(ip) === i);

    if (ips.length === 0) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setEnriching(true);

    const results = new Map<string, IpEnrichment>();
    const BATCH = 5;
    for (let i = 0; i < ips.length; i += BATCH) {
      if (ctrl.signal.aborted) break;
      const batch = ips.slice(i, i + BATCH);
      const enriched = await Promise.all(batch.map((ip) => enrichIp(ip, ctrl.signal)));
      for (let j = 0; j < batch.length; j++) {
        if (enriched[j]) results.set(batch[j], enriched[j]!);
      }
    }

    if (!ctrl.signal.aborted) {
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          records: prev.records.map((r) => ({
            ...r,
            enrichment: results.get(r.sourceIp),
          })),
        };
      });
    }
    setEnriching(false);
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      setLoading(true);
      setEnriching(false);
      setError(null);
      setReport(null);
      setFileName(file.name);

      try {
        const buf = await file.arrayBuffer();
        let xml: string;

        if (file.name.endsWith('.gz')) {
          const decompressed = await unzip(buf);
          xml = new TextDecoder().decode(decompressed);
        } else if (file.name.endsWith('.zip')) {
          const { default: JSZip } = await import('jszip');
          const zip = await JSZip.loadAsync(buf);
          const firstXml = Object.keys(zip.files).find((n) => n.endsWith('.xml'));
          if (!firstXml) throw new Error('No XML file found in zip archive');
          xml = await zip.files[firstXml].async('text');
        } else {
          xml = new TextDecoder().decode(buf);
        }

        const parsed = parseDmarcXml(xml);
        if (parsed.records.length === 0) throw new Error('No DMARC records found in the XML');
        setReport(parsed);
        enrichAll(parsed.records);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse DMARC report');
      } finally {
        setLoading(false);
      }
    },
    [enrichAll]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const exportCsv = () => {
    if (!report) return;
    const header = 'Source IP,Count,SPF,DKIM,Disposition,Header From,DMARC Pass,Organization,Country,ASN,ISP\n';
    const rows = report.records
      .map((r) => {
        const dmarcPass = r.spf === 'pass' || r.dkim === 'pass' ? 'PASS' : 'FAIL';
        const org = r.enrichment?.org?.replace(/,/g, ' ') ?? '';
        const country = r.enrichment?.country ?? '';
        const asn = r.enrichment?.asn ?? '';
        const isp = r.enrichment?.isp?.replace(/,/g, ' ') ?? '';
        return `${r.sourceIp},${r.count},${r.spf},${r.dkim},${r.disposition},${r.headerFrom},${dmarcPass},"${org}","${country}","${asn}","${isp}"`;
      })
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dmarc-${report.domain}-${report.beginDate}-${report.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalEmails = report?.records.reduce((s, r) => s + r.count, 0) ?? 0;
  const passCount =
    report?.records.filter((r) => r.spf === 'pass' || r.dkim === 'pass').reduce((s, r) => s + r.count, 0) ?? 0;
  const passRate = totalEmails ? ((passCount / totalEmails) * 100).toFixed(1) : '0';
  const failRecords = report?.records.filter((r) => r.spf === 'fail' && r.dkim === 'fail') ?? [];
  const enrichedCount = report?.records.filter((r) => r.enrichment).length ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Shield size={28} className="text-brand-600 dark:text-brand-400" /> DMARC RUA Analyzer
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
          Parse &amp; analyze your DMARC aggregate (RUA) XML reports — XML parsed in-browser, IPs enriched via real-time
          WHOIS/GeoIP.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Inspired by{' '}
          <a
            href="https://www.dmarclabsds1.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            DMARC Labs
          </a>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2 text-xs font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1">
          <CheckCircle2 size={12} /> No signup
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-full px-3 py-1">
          <CheckCircle2 size={12} /> Files never stored
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1">
          <Loader2 size={12} /> Up to 100 MB
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-fuchsia-700 dark:text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-full px-3 py-1">
          <CheckCircle2 size={12} /> .xml .gz .zip
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative rounded-lg border-2 border-dashed p-12 text-center cursor-pointer transition-colors mb-8 ${
          dragOver
            ? 'border-brand-500 bg-brand-500/5'
            : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:border-brand-400 hover:bg-brand-500/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xml,.gz,.zip"
          onChange={handleFile}
          className="hidden"
          aria-label="Upload DMARC XML report"
        />
        <Upload size={36} className="mx-auto mb-3 text-slate-400 dark:text-slate-400" />
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mb-1">
          Drag &amp; drop your DMARC XML report here
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          or click to browse — .xml, .gz, .zip up to 100 MB
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 mb-8 flex items-start gap-3">
          <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-mono text-sm text-rose-700 dark:text-rose-300">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-brand-600 dark:text-brand-400" />
          <span className="ml-3 font-mono text-sm text-slate-600 dark:text-slate-400">Parsing DMARC report...</span>
        </div>
      )}

      {report && (
        <div className="animate-fade-in-up space-y-6">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-display font-bold">{report.domain}</h2>
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-2 text-xs font-mono border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Total Emails</p>
                <p className="text-2xl font-bold">{totalEmails.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">DMARC Pass Rate</p>
                <p className="text-2xl font-bold">{passRate}%</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Unique IPs</p>
                <p className="text-2xl font-bold">{report.records.length}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Report Period</p>
                <p className="text-sm font-bold">
                  {report.beginDate} — {report.endDate}
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono space-y-1">
              <p>
                Report from: <span className="text-slate-700 dark:text-slate-300">{report.orgName}</span>
              </p>
              <p>
                Policy:{' '}
                <span className="text-slate-700 dark:text-slate-300">
                  p={report.policy || 'none'} sp={report.subdomainPolicy || 'none'} pct={report.pct || 100}%
                </span>
              </p>
              <p>
                File: <span className="text-slate-700 dark:text-slate-300">{fileName}</span>
              </p>
            </div>
          </div>

          {failRecords.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-amber-800 dark:text-amber-200">
                  {failRecords.length} IP{failRecords.length > 1 ? 's' : ''} with both SPF and DKIM failing
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 font-mono mt-1">
                  These senders are not authorized to send email for {report.domain}. Total failing volume:{' '}
                  {failRecords.reduce((s, r) => s + r.count, 0).toLocaleString()} emails.
                </p>
              </div>
            </div>
          )}

          {enriching && (
            <div className="flex items-center gap-2 text-xs font-mono text-sky-700 dark:text-sky-300">
              <Loader2 size={12} className="animate-spin" />
              Enriching IPs with WHOIS/GeoIP data ({enrichedCount}/{report.records.length})...
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                    <th
                      scope="col"
                      className="text-left px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium"
                    >
                      Source IP
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium"
                    >
                      Organization
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium"
                    >
                      Country
                    </th>
                    <th
                      scope="col"
                      className="text-right px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium"
                    >
                      Volume
                    </th>
                    <th
                      scope="col"
                      className="text-center px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium"
                    >
                      SPF
                    </th>
                    <th
                      scope="col"
                      className="text-center px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium"
                    >
                      DKIM
                    </th>
                    <th
                      scope="col"
                      className="text-center px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium"
                    >
                      DMARC
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium"
                    >
                      Header From
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.records.map((r, i) => {
                    const dmarcPass = r.spf === 'pass' || r.dkim === 'pass';
                    return (
                      <tr
                        key={r.sourceIp}
                        className={`border-b border-slate-100 dark:border-slate-800 ${
                          i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-950/50'
                        }`}
                      >
                        <td className="px-4 py-3 text-xs font-medium">{r.sourceIp}</td>
                        <td className="px-4 py-3 text-xs max-w-[200px] truncate" title={r.enrichment?.org}>
                          {r.enrichment?.org ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 size={12} className="text-slate-400 shrink-0" />
                              {r.enrichment.org}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {r.enrichment?.country ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Globe size={12} className="text-slate-400 shrink-0" />
                              {r.enrichment.country}
                              {r.enrichment.country_code && ` (${r.enrichment.country_code})`}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">{r.count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          {r.spf === 'pass' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                              <CheckCircle2 size={12} /> pass
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 text-xs">
                              <XCircle size={12} /> {r.spf}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {r.dkim === 'pass' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                              <CheckCircle2 size={12} /> pass
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 text-xs">
                              <XCircle size={12} /> {r.dkim}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              dmarcPass ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {dmarcPass ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs max-w-[160px] truncate" title={r.headerFrom}>
                          {r.headerFrom}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-4">
            <h3 className="text-sm font-display font-semibold mb-2">Privacy</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              DMARC XML is parsed entirely in your browser. IPs are enriched server-side via the same edge API used by
              the{' '}
              <Link to="/dfir/ip-geo" className="text-brand-600 dark:text-brand-400 hover:underline">
                IP Geo
              </Link>{' '}
              tool — no file content is uploaded. Results are ephemeral and disappear on page refresh.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
