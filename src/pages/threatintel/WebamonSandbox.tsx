import { useState, type FormEvent } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Send, ExternalLink, FileImage, Loader2, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface ScanResult {
  status?: string;
  report_id?: string;
  message?: string;
  error?: string;
}

interface ReportData {
  id?: string;
  status?: string;
  submission_url?: string;
  risk_score?: number;
  screenshot?: string;
  [key: string]: unknown;
}

export default function WebamonSandbox(): JSX.Element {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    setReportId(null);
    setReportData(null);
    setScreenshotUrl(null);

    try {
      const res = await fetch('/api/v1/webamon/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ submission_url: url.trim() }),
      });
      const data = (await res.json()) as ScanResult;
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(data);
      if (data.report_id) {
        setReportId(data.report_id);
        void fetchReport(data.report_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchReport = async (rid: string) => {
    setLoadingReport(true);
    try {
      const res = await fetch(`/api/v1/webamon/report/${encodeURIComponent(rid)}`);
      if (res.ok) {
        const data = (await res.json()) as ReportData;
        setReportData(data);
      }
    } catch {
      /* degraded */
    } finally {
      setLoadingReport(false);
    }
  };

  const loadScreenshot = async (rid: string) => {
    setScreenshotLoading(true);
    try {
      const res = await fetch(`/api/v1/webamon/screenshot/${encodeURIComponent(rid)}`);
      if (res.ok) {
        const blob = await res.blob();
        setScreenshotUrl(URL.createObjectURL(blob));
      }
    } catch {
      /* degraded */
    } finally {
      setScreenshotLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Send size={28} className="text-brand-600 dark:text-brand-400" /> Webamon Sandbox
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
          Submit a URL or domain to the Webamon scanning sandbox. Returns 1st & 3rd party resources, networks, DNS,
          technology stack, screenshot, certificates, and risk assessment.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-2 max-w-2xl">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com or example.com"
            aria-label="URL or domain to scan"
            className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!url.trim() || submitting}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 inline-flex items-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submitting ? 'Submitting…' : 'Scan'}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-4 py-3 mb-6 text-sm text-red-700 dark:text-red-400 font-mono flex items-center gap-2">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Scan result */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
              <CheckCircle size={18} className="text-emerald-500" />
              Scan Submitted
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm font-mono">
              {result.status && (
                <div>
                  <span className="text-slate-500">Status</span>
                  <p className="text-slate-900 dark:text-slate-100">{result.status}</p>
                </div>
              )}
              {result.report_id && (
                <div>
                  <span className="text-slate-500">Report ID</span>
                  <p className="text-brand-600 dark:text-brand-400 text-[12px] break-all">{result.report_id}</p>
                </div>
              )}
              {result.message && (
                <div className="col-span-2">
                  <span className="text-slate-500">Message</span>
                  <p className="text-slate-900 dark:text-slate-100">{result.message}</p>
                </div>
              )}
            </div>
          </section>

          {/* Report data */}
          {loadingReport && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
                <Loader2 size={14} className="animate-spin" />
                Loading report…
              </div>
            </section>
          )}

          {reportData && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                <FileImage size={18} className="text-brand-600 dark:text-brand-400" />
                Scan Report
              </h2>
              <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 overflow-x-auto max-h-96">
                {JSON.stringify(reportData, null, 2)}
              </pre>
            </section>
          )}

          {/* Screenshot */}
          {reportId && !screenshotUrl && !screenshotLoading && (
            <button
              onClick={() => loadScreenshot(reportId)}
              className="px-4 py-2 rounded-lg text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40 transition-colors inline-flex items-center gap-2"
            >
              <FileImage size={14} />
              Load Screenshot
            </button>
          )}

          {screenshotLoading && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
                <Loader2 size={14} className="animate-spin" />
                Loading screenshot…
              </div>
            </section>
          )}

          {screenshotUrl && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h2 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
                <FileImage size={18} className="text-brand-600 dark:text-brand-400" />
                Screenshot
              </h2>
              <img
                src={screenshotUrl}
                alt="Webamon scan screenshot"
                className="rounded-lg border border-slate-200 dark:border-slate-800 w-full max-w-3xl"
              />
            </section>
          )}
        </div>
      )}

      {!result && !error && (
        <div className="text-center py-16 text-slate-400">
          <Send size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-1">Submit a URL for Sandbox Analysis</p>
          <p className="text-sm max-w-md mx-auto">Enter a URL above to scan it through Webamon's sandbox.</p>
        </div>
      )}
    </div>
  );
}
