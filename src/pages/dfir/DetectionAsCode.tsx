import { useState, useEffect, useCallback } from 'react';
import { FileCode, Loader2, Copy, Check } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { SEVERITY_TONE, type Severity } from '../../components/severity';

const toSeverity = (s: string): Severity => {
  const k = s.toLowerCase();
  if (k === 'informational') return 'info';
  if (k === 'none' || k === 'unknown' || k === 'unrated') return 'low';
  if (k === 'critical' || k === 'high' || k === 'medium' || k === 'low' || k === 'info') return k;
  return 'low';
};

interface DetectionRule {
  id: string;
  name: string;
  format: string;
  rule_text: string;
  status: string;
  severity: string;
  mitre_techniques: string[];
  version: number;
  false_positive_rate: number;
  true_positive_count: number;
}
interface CoverageReport {
  total_techniques: number;
  covered_techniques: number;
  coverage_percentage: number;
  gaps: Array<{ technique_id: string }>;
  by_format: Record<string, number>;
  by_status: Record<string, number>;
}

export default function DetectionAsCode(): JSX.Element {
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, coverageRes] = await Promise.all([
        fetch(`/api/v1/detection-rules${filter !== 'all' ? `?status=${filter}` : ''}`),
        fetch('/api/v1/detection-rules/coverage/report'),
      ]);
      if (rulesRes.ok) setRules(await rulesRes.json());
      if (coverageRes.ok) setCoverage(await coverageRes.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const copyRule = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800',
    testing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30',
    staging: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30',
    production: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
    disabled: 'bg-slate-100 text-slate-400 dark:bg-slate-800',
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 mb-6"
      >
        ← back to DFIR
      </BackLink>
      <h1 className="text-3xl font-display font-bold flex items-center gap-3 mb-2">
        <FileCode className="text-brand-600" /> Detection-as-Code
      </h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8">
        Version-controlled detection rules with coverage analysis and deployment pipeline
      </p>

      {coverage && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500 mb-1">Coverage</div>
            <div className="text-2xl font-mono font-bold">{coverage.coverage_percentage}%</div>
          </div>
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500 mb-1">Techniques</div>
            <div className="text-2xl font-mono font-bold">
              {coverage.covered_techniques}/{coverage.total_techniques}
            </div>
          </div>
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500 mb-1">Production</div>
            <div className="text-2xl font-mono font-bold">{coverage.by_status?.production ?? 0}</div>
          </div>
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500 mb-1">Gaps</div>
            <div className="text-2xl font-mono font-bold text-rose-600">{coverage.gaps?.length ?? 0}</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {['all', 'draft', 'testing', 'staging', 'production'].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === s ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-brand-600" size={32} />
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-20">
          <FileCode size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-slate-500">No detection rules found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <div
              key={r.id}
              className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-400">v{r.version}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-micro font-semibold uppercase ${STATUS_COLORS[r.status]}`}
                    >
                      {r.status}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded border text-micro font-semibold uppercase ${SEVERITY_TONE[toSeverity(r.severity)]}`}
                    >
                      {r.severity}
                    </span>
                    <span className="px-2 py-0.5 rounded text-micro font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {r.format}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm">{r.name}</h3>
                </div>
                <button onClick={() => copyRule(r.rule_text, r.id)} className="text-slate-400 hover:text-brand-600">
                  {copied === r.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
              <pre className="p-3 rounded bg-slate-50 dark:bg-slate-950 text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-auto">
                {r.rule_text}
              </pre>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                <span>TP: {r.true_positive_count}</span>
                <span>FP rate: {(r.false_positive_rate * 100).toFixed(1)}%</span>
                {r.mitre_techniques.length > 0 && (
                  <span className="font-mono">{r.mitre_techniques.slice(0, 3).join(', ')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
