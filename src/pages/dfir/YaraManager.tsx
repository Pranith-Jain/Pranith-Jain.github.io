import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, FileDown, Edit2, X } from 'lucide-react';

interface YaraRule {
  id: string;
  name: string;
  author: string;
  description: string;
  category: string;
  rule: string;
  created: string;
  modified: string;
  tags: string[];
}

const STORAGE_KEY = 'dfir-yara-rules:v1';

const TEMPLATE_RULE = `rule NewRule
{
    meta:
        author = "analyst"
        description = "TODO"
    strings:
        $s1 = "malicious" nocase
    condition:
        $s1
}`;

const DEFAULT_CATEGORIES = ['malware', 'phishing', 'ransomware', 'c2', 'suspicious', 'custom'];

function loadRules(): YaraRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function YaraManager(): JSX.Element {
  const [rules, setRules] = useState<YaraRule[]>(() => loadRules());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    } catch {
      /* quota / private mode */
    }
  }, [rules]);

  const createRule = useCallback(() => {
    const id = `yara_${Date.now()}`;
    const newRule: YaraRule = {
      id,
      name: 'untitled_rule',
      author: 'analyst',
      description: '',
      category: 'custom',
      rule: TEMPLATE_RULE,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      tags: [],
    };
    setRules((prev) => [newRule, ...prev]);
    setEditingId(id);
  }, []);

  const updateRule = useCallback((id: string, updates: Partial<YaraRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates, modified: new Date().toISOString() } : r)));
  }, []);

  const deleteRule = useCallback(
    (id: string) => {
      if (!window.confirm('Delete this rule?')) return;
      setRules((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) setEditingId(null);
    },
    [editingId]
  );

  const exportAll = useCallback(() => {
    const text = rules.map((r) => r.rule).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yara-rules-export.yara';
    a.click();
    URL.revokeObjectURL(url);
  }, [rules]);

  const filtered = filter
    ? rules.filter(
        (r) =>
          r.name.toLowerCase().includes(filter.toLowerCase()) ||
          r.description.toLowerCase().includes(filter.toLowerCase()) ||
          r.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()))
      )
    : rules;

  const categories = [...new Set([...DEFAULT_CATEGORIES, ...rules.map((r) => r.category)])];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <Link to="/dfir" className="inline-flex items-center gap-2 text-sm text-ink-2 hover:text-accent mb-6 font-mono">
        <ArrowLeft size={14} /> /dfir
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold text-ink-1 uppercase tracking-[-0.02em]">YARA Rule Manager</h1>
          <p className="mt-1 text-sm text-ink-2">{rules.length} rules stored locally</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={createRule}
            className="inline-flex items-center gap-1.5 bg-accent px-3 py-1.5 font-mono text-xs font-medium text-surface-page transition-colors duration-enter hover:brightness-110"
          >
            <Plus className="h-3 w-3" /> new rule
          </button>
          {rules.length > 0 && (
            <button
              type="button"
              onClick={exportAll}
              className="inline-flex items-center gap-1.5 border border-rule px-3 py-1.5 font-mono text-xs text-ink-2 transition-colors duration-enter hover:border-accent hover:text-accent"
            >
              <FileDown className="h-3 w-3" /> export all
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, description, or tag…"
          className="w-full px-3 py-2 bg-surface-page border border-rule font-mono text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none"
        />
      </div>

      {filtered.length === 0 && (
        <div className="border border-rule p-8 text-center">
          <p className="font-mono text-sm text-ink-2">
            {rules.length === 0 ? 'No rules yet. Create one to get started.' : 'No rules match your filter.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((rule) => (
          <div key={rule.id} className="border border-rule bg-surface-raised">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-rule">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium text-ink-1">{rule.name}</span>
                  <span className="font-mono text-[9px] tracking-[0.1em] text-accent uppercase border border-accent/20 bg-accent-soft px-1">
                    {rule.category}
                  </span>
                </div>
                {rule.description && <p className="text-xs text-ink-2 mt-0.5">{rule.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingId(editingId === rule.id ? null : rule.id)}
                  className="p-1.5 text-ink-3 hover:text-accent transition-colors"
                  aria-label="Edit"
                >
                  {editingId === rule.id ? <X className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => deleteRule(rule.id)}
                  className="p-1.5 text-ink-3 hover:text-threat transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {editingId === rule.id && (
              <div className="p-4 space-y-3 border-b border-rule">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`yara-name-${rule.id}`} className="mono-label block mb-1">
                      Name
                    </label>
                    <input
                      id={`yara-name-${rule.id}`}
                      type="text"
                      value={rule.name}
                      onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                      className="w-full px-2 py-1.5 bg-surface-page border border-rule font-mono text-xs text-ink-1 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor={`yara-cat-${rule.id}`} className="mono-label block mb-1">
                      Category
                    </label>
                    <select
                      id={`yara-cat-${rule.id}`}
                      value={rule.category}
                      onChange={(e) => updateRule(rule.id, { category: e.target.value })}
                      className="w-full px-2 py-1.5 bg-surface-page border border-rule font-mono text-xs text-ink-1 focus:outline-none"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor={`yara-desc-${rule.id}`} className="mono-label block mb-1">
                    Description
                  </label>
                  <input
                    id={`yara-desc-${rule.id}`}
                    type="text"
                    value={rule.description}
                    onChange={(e) => updateRule(rule.id, { description: e.target.value })}
                    className="w-full px-2 py-1.5 bg-surface-page border border-rule font-mono text-xs text-ink-1 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <details className="group">
              <summary className="px-4 py-2 font-mono text-[10px] text-ink-3 cursor-pointer hover:text-ink-1 transition-colors select-none">
                rule source ({rule.rule.split('\n').length} lines)
              </summary>
              <pre className="px-4 pb-3 pt-1 overflow-x-auto text-[11px] font-mono text-ink-2 leading-relaxed whitespace-pre">
                {rule.rule}
              </pre>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
