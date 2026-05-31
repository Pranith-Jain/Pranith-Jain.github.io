import { useState, useCallback } from 'react';
import { CopyButton } from '../../components/dfir/CopyButton';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Crosshair, Loader2, AlertTriangle, Shield } from 'lucide-react';

interface HuntingQuery {
  siem: string;
  query: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

interface HuntingResult {
  threat: string;
  queries: HuntingQuery[];
  mitre_techniques: string[];
  recommended_actions: string[];
}

const SIEM_COLORS: Record<string, string> = {
  Splunk: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  KQL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Sigma: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Elastic: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  YARA: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  Snort: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  Suricata: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
};

const EXAMPLE_PROMPTS = [
  'APT28 using Cobalt Strike beacon',
  'Lazarus Group targeting cryptocurrency exchanges',
  'LockBit ransomware lateral movement via PsExec',
  'Emotet dropper with macro-enabled Office documents',
  'Credential dumping with Mimikatz or similar tools',
  'DNS tunneling for data exfiltration',
  'Suspicious PowerShell encoded commands',
  'Web shell deployment on compromised servers',
];

export default function HuntingQueryGenerator(): JSX.Element {
  const [threat, setThreat] = useState('');
  const [platforms, setPlatforms] = useState<Set<string>>(new Set(['Splunk', 'KQL', 'Sigma', 'Elastic']));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HuntingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglePlatform = (p: string) => {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const handleGenerate = useCallback(async () => {
    if (!threat.trim() || platforms.size === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/hunting-queries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threat, platforms: [...platforms] }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try {
          const p = JSON.parse(body) as { error?: string };
          msg = p.error ?? msg;
        } catch {
          /* ok */
        }
        throw new Error(msg);
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [threat, platforms]);

  const ALL_PLATFORMS = ['Splunk', 'KQL', 'Sigma', 'Elastic', 'YARA', 'Snort', 'Suricata'];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Crosshair size={28} className="text-brand-600 dark:text-brand-400" /> Hunting Query Generator
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Describe a threat and generate detection queries for 7 SIEM platforms. Each query is tailored to the
          platform's syntax and data model.
        </p>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 mb-6">
        <h2 className="font-display font-bold text-sm mb-3">Threat Description</h2>
        <textarea
          value={threat}
          onChange={(e) => setThreat(e.target.value)}
          placeholder="Describe the threat or adversary behavior…"
          className="w-full h-24 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 resize-y font-mono"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {EXAMPLE_PROMPTS.slice(0, 4).map((ex) => (
            <button
              key={ex}
              onClick={() => setThreat(ex)}
              className="text-[11px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-brand-500/30 transition-colors"
            >
              {ex.slice(0, 45)}…
            </button>
          ))}
        </div>

        <h3 className="font-display font-bold text-sm mt-4 mb-2">Target Platforms</h3>
        <div className="flex flex-wrap gap-1.5">
          {ALL_PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors ${platforms.has(p) ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:border-brand-500/30'}`}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !threat.trim() || platforms.size === 0}
          className="mt-4 w-full px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Crosshair size={14} />}
          {loading ? 'Generating…' : 'Generate Hunting Queries'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 mb-6 flex items-center gap-3">
          <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-5 animate-fade-in-up">
          {/* MITRE Techniques */}
          {result.mitre_techniques.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
              <h2 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                <Shield size={14} className="text-brand-600 dark:text-brand-400" /> MITRE ATT&CK
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {result.mitre_techniques.map((t) => (
                  <a
                    key={t}
                    href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-300/50 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 hover:border-amber-500/60 transition-colors"
                  >
                    {t}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Queries by Platform */}
          {result.queries.map((q) => (
            <div
              key={`${q.siem}-${q.description}`}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${SIEM_COLORS[q.siem] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                  >
                    {q.siem}
                  </span>
                  <span className="text-sm font-medium">{q.description}</span>
                </div>
                <CopyButton value={q.query} />
              </div>
              <pre className="bg-slate-50 dark:bg-slate-950 rounded-lg p-4 overflow-x-auto text-xs text-slate-700 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-800 whitespace-pre-wrap">
                {q.query}
              </pre>
            </div>
          ))}

          {/* Recommended Actions */}
          {result.recommended_actions.length > 0 && (
            <div className="rounded-xl border border-emerald-300/50 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20 p-5">
              <h2 className="font-display font-bold text-sm mb-2 text-emerald-700 dark:text-emerald-300">
                Recommended Actions
              </h2>
              <ul className="space-y-1">
                {result.recommended_actions.map((a) => (
                  <li key={a} className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2">
                    <span className="mt-1">•</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
