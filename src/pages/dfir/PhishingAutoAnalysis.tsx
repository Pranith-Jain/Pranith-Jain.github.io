import { useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, AlertTriangle, Shield, Globe, FileText, ExternalLink, Lock, Eye } from 'lucide-react';

interface FormField {
  type: string;
  name: string;
  placeholder: string;
}

interface AnalysisReport {
  url: string;
  fetched: boolean;
  status?: number;
  title?: string;
  forms: FormField[];
  external_links: number;
  scripts: number;
  iframes: number;
  has_password_field: boolean;
  has_submit_button: boolean;
  suspicious_keywords: string[];
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  ip?: string;
  error?: string;
}

const RISK_COLORS: Record<string, string> = {
  critical: 'text-rose-500 border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20',
  high: 'text-orange-500 border-orange-300 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20',
  medium: 'text-amber-500 border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20',
  low: 'text-emerald-500 border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20',
};

export default function PhishingAutoAnalysis(): JSX.Element {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);

  const analyze = async () => {
    const u = url.trim();
    if (!u) return;
    setAnalyzing(true);
    setReport(null);
    try {
      const r = await fetch(`/api/v1/phishing/auto-analyze?url=${encodeURIComponent(u)}`);
      setReport((await r.json()) as AnalysisReport);
    } catch {
      /* ignore */
    }
    setAnalyzing(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
          <Eye size={28} className="text-brand-600 dark:text-brand-400" /> Phishing Auto-Analysis
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-2xl">
          Analyze a URL for phishing indicators — form extraction, risk scoring, DNS resolution.
        </p>
      </div>

      <div className="mb-8">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && analyze()}
            placeholder="https://example.com/login..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <button
            onClick={analyze}
            disabled={analyzing || !url.trim()}
            className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {analyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {report && (
        <div className="animate-fade-in-up space-y-4">
          {/* Header */}
          <div className={`rounded-xl border p-5 ${RISK_COLORS[report.risk_level] ?? ''}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-lg flex items-center gap-2">
                <Shield size={18} />
                Risk: {report.risk_level.toUpperCase()}
                <span className="text-sm font-mono opacity-70">({report.risk_score}/100)</span>
              </h2>
              <span
                className={`text-xs font-mono px-2 py-1 rounded ${report.fetched ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'}`}
              >
                {report.fetched ? `HTTP ${report.status}` : 'Unreachable'}
              </span>
            </div>

            <code className="text-xs font-mono text-slate-600 dark:text-slate-400 break-all block">{report.url}</code>
            {report.title && <p className="text-sm mt-2 font-semibold">{report.title}</p>}
          </div>

          {/* Key indicators */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 mb-1">
                <Lock size={12} /> Password field
              </div>
              <p className={`text-lg font-bold ${report.has_password_field ? 'text-rose-500' : 'text-emerald-500'}`}>
                {report.has_password_field ? 'YES' : 'NO'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 mb-1">
                <FileText size={12} /> Form fields
              </div>
              <p className="text-lg font-bold">{report.forms.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 mb-1">
                <ExternalLink size={12} /> Ext. links
              </div>
              <p className="text-lg font-bold">{report.external_links}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 mb-1">
                <Globe size={12} /> Hosting IP
              </div>
              <p className="text-lg font-bold font-mono text-xs">{report.ip || 'N/A'}</p>
            </div>
          </div>

          {/* Suspicious keywords */}
          {report.suspicious_keywords.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/10 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-amber-700 dark:text-amber-400 font-mono mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> Suspicious keywords ({report.suspicious_keywords.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {report.suspicious_keywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Forms */}
          {report.forms.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                Extracted Form Fields ({report.forms.length})
              </h3>
              <div className="space-y-1">
                {report.forms.slice(0, 10).map((f, i) => (
                  <div key={i} className="flex gap-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 uppercase">
                      {f.type}
                    </span>
                    <span className="text-brand-600 dark:text-brand-400">{f.name || '—'}</span>
                    <span className="text-slate-400">{f.placeholder || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!report && !analyzing && (
        <div className="text-center py-16 text-slate-500 dark:text-slate-400">
          <Eye size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm font-mono">Enter a URL to analyze for phishing indicators</p>
        </div>
      )}
    </div>
  );
}
