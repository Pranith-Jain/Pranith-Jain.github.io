// src/pages/dfir/ReportIngest.tsx
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, Loader2, AlertTriangle, Download, Copy, Check } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { StixObjectTable, StixRelationshipGraph, type StixBundle } from '../../components/StixBundleViewer';
import { adminAuthHeaders } from '../../lib/admin-token';
import type { IntelBundleResponse } from '../../hooks/useIntelBundle';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // mirror the server's own cap
const ACCEPT = '.txt,.md,.html,.htm,.png,.jpg,.jpeg,.pdf,.docx';

interface IngestResponse extends IntelBundleResponse {
  ingest?: { kind: string; method: string; truncated: boolean; pages?: number };
}

const ERROR_BY_STATUS: Record<number, string> = {
  400: 'No file received — try again.',
  401: 'Admin session required — authenticate in the admin console, then retry.',
  413: 'File too large (max 10 MB).',
  415: 'Unsupported file type. Use PDF, DOCX, image, HTML, or text.',
  422: "Couldn't extract readable text from this file — try another format.",
  429: 'Image OCR is rate-limited right now — try again later, or upload text/HTML.',
  502: 'Failed to build the STIX bundle — try again.',
  503: 'PDF/DOCX extraction needs the optional bridge.',
};

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function ReportIngest(): JSX.Element {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setResult(null);
    setError(null);
    setErrorStatus(null);
    setFileName(file.name);

    if (file.size > MAX_FILE_BYTES) {
      setStatus('error');
      setError('File too large (max 10 MB).');
      return;
    }

    setStatus('loading');
    try {
      const fd = new FormData();
      fd.set('file', file);
      // No explicit content-type: the browser sets the multipart boundary.
      const res = await fetch('/api/v1/report/ingest', {
        method: 'POST',
        headers: { ...adminAuthHeaders() },
        body: fd,
      });
      if (!res.ok) {
        setStatus('error');
        setErrorStatus(res.status);
        setError(ERROR_BY_STATUS[res.status] ?? `Upload failed (${res.status}).`);
        return;
      }
      const json = (await res.json()) as IngestResponse;
      setResult(json);
      setStatus('done');
    } catch {
      setStatus('error');
      setError('Network error — try again.');
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const onInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const download = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(result.bundle.id || 'report').replace(/[^a-z0-9-]/gi, '_')}.stix.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.bundle, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const view = result?.view;
  const bundle = result?.bundle as unknown as StixBundle | undefined;
  const hasIntel =
    !!view &&
    (view.iocs.length ||
      view.cves.length ||
      view.threatActors.length ||
      view.malware.length ||
      view.attackPatterns.length);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Upload size={28} className="text-brand-600 dark:text-brand-400" /> Report Ingest
        </h1>
        <p className="text-muted mb-8 max-w-2xl">
          Upload a threat report (text, HTML, or image). It is parsed, indicators are enriched across providers, and a
          STIX 2.1 bundle is built. PDF/DOCX require the optional extraction bridge.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={`relative rounded-lg border-2 border-dashed p-12 text-center cursor-pointer transition-colors mb-8 ${
          dragOver
            ? 'border-brand-500 bg-brand-500/5'
            : 'border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))]/50 hover:border-brand-400 hover:bg-brand-500/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onInput}
          className="hidden"
          aria-label="Upload a report file"
        />
        <Upload size={28} className="mx-auto mb-3 text-slate-400" />
        <p className="font-mono text-sm text-muted">{fileName ? fileName : 'Drop a file here, or click to choose'}</p>
        <p className="font-mono text-xs text-slate-400 mt-1">txt · md · html · png · jpg · pdf · docx — max 10 MB</p>
      </div>

      {status === 'loading' && (
        <p className="font-mono text-sm text-muted flex items-center gap-2" role="status">
          <Loader2 size={14} className="animate-spin" /> extracting text → enriching indicators → building STIX bundle…
        </p>
      )}

      {status === 'error' && error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 font-mono text-sm text-rose-600 dark:text-rose-400"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </span>
          {errorStatus === 503 && (
            <span className="block mt-2 text-muted">
              Upload text/HTML/an image instead, or paste text into{' '}
              <Link to="/dfir/report-analyzer" className="underline text-brand-600 dark:text-brand-400">
                Report Parser
              </Link>
              .
            </span>
          )}
        </div>
      )}

      {status === 'done' && view && (
        <div className="animate-fade-in-up space-y-6">
          <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-display font-bold">{view.title}</h2>
                {view.summary && <p className="text-sm text-muted mt-1">{view.summary}</p>}
              </div>
              <span className="shrink-0 font-mono text-xs px-2 py-1 rounded border border-amber-500/40 text-amber-600">
                TLP:{view.tlp}
              </span>
            </div>
            {result?.ingest && (
              <p className="font-mono text-xs text-slate-400 mt-3">
                extraction: {result.ingest.method}
                {result.ingest.truncated ? ' · truncated' : ''}
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={download}
                className="inline-flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-400"
              >
                <Download size={13} /> .stix.json
              </button>
              <button
                onClick={copyJson}
                className="inline-flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-400"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'copied' : 'copy JSON'}
              </button>
            </div>
          </div>

          {!hasIntel && (
            <p className="font-mono text-sm text-slate-500">
              No indicators, CVEs, actors, or techniques found in this document.
            </p>
          )}

          {view.iocs.length > 0 && (
            <section>
              <h3 className="font-mono text-xs font-bold uppercase text-slate-500 mb-2">
                Indicators ({view.iocs.length})
              </h3>
              <div className="space-y-1">
                {view.iocs.map((ioc) => (
                  <div key={`${ioc.type}:${ioc.value}`} className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-slate-400 w-12">{ioc.type}</span>
                    <span className="break-all">{ioc.value}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded border ${
                        ioc.verdict === 'malicious'
                          ? 'border-rose-500/40 text-rose-600'
                          : ioc.verdict === 'suspicious'
                            ? 'border-amber-500/40 text-amber-600'
                            : 'border-slate-400/40 text-slate-500'
                      }`}
                    >
                      {ioc.verdict} · {ioc.riskScore}
                    </span>
                    {ioc.listedIn.length > 0 && <span className="text-slate-400">{ioc.listedIn.length} src</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {view.cves.length > 0 && (
            <section>
              <h3 className="font-mono text-xs font-bold uppercase text-slate-500 mb-2">CVEs ({view.cves.length})</h3>
              <div className="space-y-1">
                {view.cves.map((cve) => (
                  <div key={cve.id} className="flex items-center gap-3 font-mono text-xs">
                    <span>{cve.id}</span>
                    {cve.kevListed && (
                      <span className="px-1.5 py-0.5 rounded border border-rose-500/40 text-rose-600">KEV</span>
                    )}
                    {typeof cve.epssScore === 'number' && (
                      <span className="text-slate-400">EPSS {(cve.epssScore * 100).toFixed(1)}%</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {(view.threatActors.length > 0 || view.malware.length > 0) && (
            <section className="font-mono text-xs space-y-1">
              <h3 className="font-bold uppercase text-slate-500 mb-2">Attribution</h3>
              {view.threatActors.map((a) => (
                <div key={a.name}>
                  actor: <span className="text-rose-600">{a.name}</span> {a.mitreId ? `(${a.mitreId})` : ''}
                </div>
              ))}
              {view.malware.map((m) => (
                <div key={m.name}>
                  malware: <span className="text-orange-600">{m.name}</span> {m.mitreId ? `(${m.mitreId})` : ''}
                </div>
              ))}
            </section>
          )}

          {view.attackPatterns.length > 0 && (
            <section className="font-mono text-xs">
              <h3 className="font-bold uppercase text-slate-500 mb-2">ATT&CK</h3>
              <div className="flex flex-wrap gap-2">
                {view.attackPatterns.map((t) => (
                  <span key={t.mitreId} className="px-1.5 py-0.5 rounded border border-violet-500/40 text-violet-600">
                    {t.mitreId} {t.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {bundle && (
            <section>
              <h3 className="font-mono text-xs font-bold uppercase text-slate-500 mb-2">STIX 2.1 Bundle</h3>
              <StixRelationshipGraph bundle={bundle} />
              <StixObjectTable bundle={bundle} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
