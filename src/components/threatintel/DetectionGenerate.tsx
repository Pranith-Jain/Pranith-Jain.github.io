import { useState, useCallback } from 'react';
import { Shield, Loader2, Check, Copy, AlertTriangle, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { adminAuthHeaders } from '../../lib/admin-token';

type RuleType = 'yara' | 'sigma' | 'kql' | 'splunk';
const RULE_TYPES: { id: RuleType; label: string; color: string }[] = [
  { id: 'yara', label: 'YARA', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { id: 'sigma', label: 'Sigma', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { id: 'kql', label: 'KQL', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  { id: 'splunk', label: 'Splunk SPL', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
];

interface DetectionGenerateProps {
  context: string;
}

export function DetectionGenerate({ context }: DetectionGenerateProps) {
  const [open, setOpen] = useState(false);
  const [ruleType, setRuleType] = useState<RuleType>('yara');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const generate = useCallback(async () => {
    const desc = description.trim() || `Detection rule for: ${context.slice(0, 200)}`;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/v1/rules/generate', {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ type: ruleType, description: desc }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error(err.error ?? 'Generation failed');
      }
      const data = await res.json() as { rule_content?: string; rule_name?: string };
      setResult(data.rule_content ?? 'No content generated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }, [ruleType, description, context]);

  const handleCopy = useCallback(() => {
    if (result) {
      navigator.clipboard.writeText(result).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [result]);

  const handleSave = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/copilot/rules', {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          rule_type: ruleType,
          rule_content: result,
          description: description.trim() || `Rule for: ${context.slice(0, 200)}`,
          context: context.slice(0, 1000),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [result, ruleType, description, context]);

  return (
    <div className="mt-2 border-t border-slate-100 pt-2 dark:border-[rgb(var(--border-400))]">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-500 hover:text-brand-600 hover:bg-slate-50 transition-colors dark:hover:bg-[rgb(var(--surface-200))]"
      >
        <Shield size={12} />
        Generate detection rule
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))/0.3]">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Format:</span>
            {RULE_TYPES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRuleType(r.id)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                  ruleType === r.id
                    ? r.color
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what to detect (or leave blank for auto-detect)"
              className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300))] dark:text-white"
            />
            <button
              onClick={generate}
              disabled={loading}
              className="shrink-0 rounded bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : 'Generate'}
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
              <AlertTriangle size={11} />
              {error}
            </div>
          )}
          {result && (
            <div className="relative">
              <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-slate-100 p-2 font-mono text-[11px] dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300))]">
                {result}
              </pre>
              <div className="absolute right-1.5 top-1.5 flex gap-1">
                <button
                  onClick={handleSave}
                  disabled={saving || saved}
                  className="rounded bg-white/90 p-1 text-slate-400 hover:text-brand-600 disabled:opacity-50 dark:bg-[rgb(var(--surface-200))/0.9]"
                  aria-label="Save rule"
                >
                  {saved ? <Check size={12} className="text-emerald-500" /> : <Save size={12} />}
                </button>
                <button
                  onClick={handleCopy}
                  className="rounded bg-white/90 p-1 text-slate-400 hover:text-brand-600 dark:bg-[rgb(var(--surface-200))/0.9]"
                  aria-label="Copy rule"
                >
                  {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
