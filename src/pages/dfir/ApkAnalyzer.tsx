import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  ShieldAlert,
  Hash,
  FileCode2,
  Loader2,
  Globe,
  ExternalLink,
  Smartphone,
  AlertTriangle,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { CopyChip } from '../../components/dfir/CopyButton';
import { analyzeApk, type ApkAnalysis } from '../../lib/dfir/apk-analysis';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function ApkAnalyzer(): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    analysis: ApkAnalysis;
    sha256: string;
    sha1: string;
    md5: string;
    size: number;
    entropy: number;
    fileName: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    if (!file.name.endsWith('.apk')) {
      setError('Only .apk files are supported.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await analyzeApk(file);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Smartphone size={28} className="text-brand-600 dark:text-brand-400" /> APK Analyzer
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Drop an Android APK for static analysis. Extracts package info, permissions, components, strings, and IOCs.
          Computes SHA-256/SHA-1/MD5 hashes. Flags suspicious patterns and dangerous permissions. 100% client-side.
        </p>
      </div>

      {/* File drop */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <button
          type="button"
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void onFile(f);
          }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center cursor-pointer hover:border-brand-500/40 focus-visible:outline-none focus-visible:border-brand-500/60"
          aria-label="Drop an APK file or click to choose"
        >
          <Upload size={32} className="mx-auto mb-2 text-slate-500" />
          <p className="text-sm font-mono text-slate-700 dark:text-slate-300">Drop an APK here, or click to choose</p>
          <p className="text-[11px] font-mono text-slate-500 mt-1">100% client-side. No upload. Max 50 MB.</p>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".apk"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
      </section>

      {loading && (
        <p className="text-sm font-mono text-slate-500 mb-4 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Analyzing APK...
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-mono text-rose-600 dark:text-rose-400 mb-4">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="font-display font-bold text-lg">{result.fileName}</h2>
              <span className="text-xs font-mono text-slate-500">{fmtBytes(result.size)}</span>
            </div>
            <dl className="grid sm:grid-cols-[140px_1fr] gap-x-4 gap-y-1 text-[12px] font-mono mb-3">
              <dt className="text-slate-500">Package</dt>
              <dd className="text-slate-900 dark:text-slate-100 break-all">
                {result.analysis.packageName || 'unknown'}
              </dd>
              {result.analysis.versionName && (
                <>
                  <dt className="text-slate-500">Version</dt>
                  <dd className="text-slate-900 dark:text-slate-100">
                    {result.analysis.versionName} ({result.analysis.versionCode})
                  </dd>
                </>
              )}
              {result.analysis.minSdk && (
                <>
                  <dt className="text-slate-500">Min SDK</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{result.analysis.minSdk}</dd>
                </>
              )}
              {result.analysis.targetSdk && (
                <>
                  <dt className="text-slate-500">Target SDK</dt>
                  <dd className="text-slate-900 dark:text-slate-100">{result.analysis.targetSdk}</dd>
                </>
              )}
              <dt className="text-slate-500">Entropy</dt>
              <dd className="text-slate-900 dark:text-slate-100">
                {result.entropy.toFixed(3)} / 8{' '}
                {result.entropy > 7.5 && <span className="text-rose-600 dark:text-rose-400">(likely packed)</span>}
              </dd>
              <dt className="text-slate-500">DEX files</dt>
              <dd className="text-slate-900 dark:text-slate-100">{result.analysis.dexCount}</dd>
              <dt className="text-slate-500">Files</dt>
              <dd className="text-slate-900 dark:text-slate-100">{result.analysis.fileCount} entries</dd>
            </dl>
          </section>

          {/* Hashes + IOC Check */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
              <Hash size={12} /> File hashes
            </h3>
            <div className="space-y-1.5 text-[12px] font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-20 shrink-0">SHA-256</span>
                <code className="text-slate-900 dark:text-slate-100 break-all flex-1">{result.sha256}</code>
                <CopyChip value={result.sha256} label="copy" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-20 shrink-0">SHA-1</span>
                <code className="text-slate-900 dark:text-slate-100 break-all flex-1">{result.sha1}</code>
                <CopyChip value={result.sha1} label="copy" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 w-20 shrink-0">MD5</span>
                <code className="text-slate-900 dark:text-slate-100 break-all flex-1">{result.md5}</code>
                <CopyChip value={result.md5} label="copy" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                to={`/dfir/ioc-check?indicator=${result.sha256}`}
                className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20"
              >
                <Search size={11} /> Check hash in IOC Checker
              </Link>
              <Link
                to={`/dfir/malware-scan?hash=${result.sha256}`}
                className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
              >
                <ExternalLink size={10} /> Malware Scanner
              </Link>
            </div>
          </section>

          {/* Permissions */}
          {result.analysis.permissions.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
                <ShieldAlert size={12} /> Permissions ({result.analysis.permissions.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {result.analysis.permissions.map((p) => (
                  <span
                    key={p.name}
                    className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border ${p.dangerous ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'}`}
                  >
                    {p.dangerous ? (
                      <AlertTriangle size={10} aria-hidden="true" />
                    ) : (
                      <ShieldCheck size={10} aria-hidden="true" />
                    )}
                    {p.name.split('.').pop()}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Suspicious */}
          {result.analysis.suspicious.length > 0 && (
            <section className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400 font-mono mb-3 inline-flex items-center gap-2">
                <AlertTriangle size={12} /> Suspicious indicators ({result.analysis.suspicious.length})
              </h3>
              <ul className="space-y-1 text-[11px] font-mono text-rose-800 dark:text-rose-200">
                {result.analysis.suspicious.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="opacity-50 select-none">!</span>
                    <span className="break-all">{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* IOCs */}
          {(result.analysis.urls.length > 0 ||
            result.analysis.ips.length > 0 ||
            result.analysis.domains.length > 0 ||
            result.analysis.apiKeys.length > 0) && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
                <Globe size={12} /> Extracted IOCs
              </h3>
              <div className="space-y-3">
                {result.analysis.urls.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                      URLs ({result.analysis.urls.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {result.analysis.urls.map((u) => (
                        <span
                          key={u}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30 break-all"
                        >
                          {u}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.analysis.ips.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                      IPs ({result.analysis.ips.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {result.analysis.ips.map((ip) => (
                        <span
                          key={ip}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                        >
                          {ip}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Components */}
          {(result.analysis.activities.length > 0 || result.analysis.services.length > 0) && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
                <FileCode2 size={12} /> Components
              </h3>
              {result.analysis.activities.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] font-mono text-slate-500 mb-1">
                    Activities ({result.analysis.activities.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.analysis.activities.map((a) => (
                      <span
                        key={a}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      >
                        {a.split('.').pop()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
