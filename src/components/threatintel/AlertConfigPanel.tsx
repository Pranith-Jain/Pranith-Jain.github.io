import { useState, useCallback } from 'react';
import { Bell, RefreshCw, Plus, Trash2 } from 'lucide-react';

interface AlertRule {
  id: string;
  name: string;
  keywords: string[];
  webhook_url: string;
  enabled: boolean;
}

interface AlertMatch {
  event_index: number;
  matched_keywords: string[];
  relevance: string;
  reason: string;
  suggested_action: string;
}

interface AlertCheckResult {
  alerts: AlertMatch[];
  total_checked: number;
  alert_count: number;
}

const STORAGE_KEY = 'cti:alert-rules';

function loadRules(): AlertRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRules(rules: AlertRule[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* */
  }
}

interface AlertConfigPanelProps {
  events: Array<{ title: string; description?: string; kind: string; severity: string; source: string }>;
}

export function AlertConfigPanel({ events }: AlertConfigPanelProps) {
  const [rules, setRules] = useState<AlertRule[]>(loadRules);
  const [newName, setNewName] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [newWebhook, setNewWebhook] = useState('');
  const [results, setResults] = useState<AlertCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  const addRule = () => {
    if (!newName || !newKeywords) return;
    const rule: AlertRule = {
      id: crypto.randomUUID(),
      name: newName,
      keywords: newKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      webhook_url: newWebhook,
      enabled: true,
    };
    const next = [...rules, rule];
    setRules(next);
    saveRules(next);
    setNewName('');
    setNewKeywords('');
    setNewWebhook('');
  };

  const removeRule = (id: string) => {
    const next = rules.filter((r) => r.id !== id);
    setRules(next);
    saveRules(next);
  };

  const checkAlerts = useCallback(async () => {
    const allKeywords = rules.filter((r) => r.enabled).flatMap((r) => r.keywords);
    if (!allKeywords.length || !events.length) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/alert-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: allKeywords, events: events.slice(0, 30) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [rules, events]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-brand-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Alert Rules</h3>
        </div>
        <button
          onClick={checkAlerts}
          disabled={loading || !rules.some((r) => r.enabled)}
          className="text-xs font-mono px-3 py-1.5 rounded-lg border border-brand-500/30 text-brand-500 hover:bg-brand-500/10 disabled:opacity-50"
        >
          {loading ? <RefreshCw size={12} className="animate-spin inline" /> : 'Check Now'}
        </button>
      </div>

      {/* Existing rules */}
      {rules.length > 0 && (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-[rgb(var(--surface-300)/0.5)] p-2"
            >
              <span className={`w-2 h-2 rounded-full ${rule.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex-1">{rule.name}</span>
              <span className="text-micro font-mono text-slate-500">{rule.keywords.join(', ')}</span>
              <button onClick={() => removeRule(rule.id)} className="text-slate-400 hover:text-rose-400">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new rule */}
      <div className="space-y-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Rule name (e.g., APT28 watch)"
          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-700 dark:text-slate-300"
        />
        <input
          type="text"
          value={newKeywords}
          onChange={(e) => setNewKeywords(e.target.value)}
          placeholder="Keywords (comma-separated)"
          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-700 dark:text-slate-300"
        />
        <input
          type="text"
          value={newWebhook}
          onChange={(e) => setNewWebhook(e.target.value)}
          placeholder="Webhook URL (optional)"
          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-700 dark:text-slate-300"
        />
        <button
          onClick={addRule}
          disabled={!newName || !newKeywords}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border border-brand-500/30 text-brand-500 hover:bg-brand-500/10 disabled:opacity-50"
        >
          <Plus size={12} /> Add Rule
        </button>
      </div>

      {/* Alert results */}
      {results && results.alert_count > 0 && (
        <div className="space-y-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-3">
          <span className="text-micro font-mono text-slate-500">
            {results.alert_count} alerts from {results.total_checked} events
          </span>
          {results.alerts.map((alert, i) => (
            <div key={i} className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                  {alert.relevance}
                </span>
                <span className="text-micro font-mono text-slate-500">
                  matched: {alert.matched_keywords.join(', ')}
                </span>
              </div>
              <p className="text-xs text-slate-300">{alert.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
