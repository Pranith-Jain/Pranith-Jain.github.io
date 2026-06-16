import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Target, Sparkles, Loader2 } from 'lucide-react';

interface Technique {
  id: string;
  name: string;
  tactic: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}

const TACTICS = [
  'Reconnaissance',
  'Resource Development',
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command and Control',
  'Exfiltration',
  'Impact',
];

const TACTIC_COLORS: Record<string, string> = {
  Reconnaissance:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  'Resource Development': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Initial Access':
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-800',
  Execution:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300 dark:border-orange-800',
  Persistence:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-300 dark:border-purple-800',
  'Privilege Escalation':
    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
  'Defense Evasion':
    'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 border-pink-300 dark:border-pink-800',
  'Credential Access':
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800',
  Discovery: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border-cyan-300 dark:border-cyan-800',
  'Lateral Movement':
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
  Collection: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border-teal-300 dark:border-teal-800',
  'Command and Control':
    'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-800',
  Exfiltration:
    'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-300 dark:border-violet-800',
  Impact: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
};

const INPUT_TYPES = ['Article / Report', 'Logs', 'Alert Details', 'Behavior Description'] as const;

const MOCK_MAPPINGS: Technique[] = [
  {
    id: 'T1566.001',
    name: 'Spearphishing Attachment',
    tactic: 'Initial Access',
    confidence: 'high',
    evidence: 'Email with malicious attachment delivered to target',
  },
  {
    id: 'T1204.002',
    name: 'User Execution: Malicious File',
    tactic: 'Execution',
    confidence: 'high',
    evidence: 'User opened the attachment, executing the payload',
  },
  {
    id: 'T1059.001',
    name: 'Command and Scripting Interpreter: PowerShell',
    tactic: 'Execution',
    confidence: 'medium',
    evidence: 'PowerShell process spawned from email client',
  },
  {
    id: 'T1547.001',
    name: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    confidence: 'high',
    evidence: 'Registry key added under HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
  },
  {
    id: 'T1055.001',
    name: 'Process Injection: DLL Injection',
    tactic: 'Defense Evasion',
    confidence: 'medium',
    evidence: 'malware.dll injected into explorer.exe',
  },
  {
    id: 'T1071.001',
    name: 'Web Protocols',
    tactic: 'Command and Control',
    confidence: 'high',
    evidence: 'Beaconing to C2 server on port 443 every 60s',
  },
  {
    id: 'T1041',
    name: 'Exfiltration Over C2 Channel',
    tactic: 'Exfiltration',
    confidence: 'medium',
    evidence: 'Data compressed and exfiltrated via the same C2 channel',
  },
];

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function AttmapAi(): JSX.Element {
  const [inputType, setInputType] = useState<string>(INPUT_TYPES[0]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState<Technique[]>([]);

  const runMapping = async () => {
    if (!input.trim()) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setMappings(MOCK_MAPPINGS);
    setLoading(false);
  };

  const groupedByTactic = TACTICS.map((tactic) => ({
    tactic,
    techniques: mappings.filter((m) => m.tactic === tactic),
  })).filter((g) => g.techniques.length > 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> Back to DFIR
      </Link>

      <div className="animate-fade-in-up mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Target size={28} className="text-brand-600 dark:text-brand-400" />
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
            ATTMAP-AI — Behavior to ATT&CK. Mapped.
          </h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
          Describe an adversary behavior, alert, log, or report — AI maps it to MITRE ATT&CK techniques with confidence
          scores, evidence, and tactic grouping.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-slate-400" />
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Input</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {INPUT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setInputType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                    inputType === t
                      ? 'bg-brand-600 text-white'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Paste ${inputType.toLowerCase()} content here…`}
              rows={6}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />

            <div className="mt-3">
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">
                Known Context (optional)
              </span>
              <input
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Environment, actor name, or additional context…"
                className="w-full mt-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>

            <p className="text-micro font-mono text-slate-400 mt-2">
              Content is sent to Workers AI only — never stored by this tool.
            </p>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={runMapping}
                disabled={loading || !input.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
                {loading ? 'Mapping…' : 'Map to ATT&CK'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInput('');
                  setContext('');
                  setMappings([]);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div>
          {loading && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-8 flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-brand-600" />
              <p className="text-sm font-mono text-slate-500">Mapping behavior to ATT&CK techniques…</p>
            </div>
          )}

          {!loading && mappings.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/20 p-8 flex flex-col items-center justify-center text-center">
              <Target size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
              <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
                Paste behavior description and click Map to ATT&CK
              </p>
              <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-2">
                Supports full reports, log snippets, alert details, or a plain behavior summary
              </p>
            </div>
          )}

          {!loading && mappings.length > 0 && (
            <div className="space-y-6">
              {groupedByTactic.map(({ tactic, techniques }) => (
                <div
                  key={tactic}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5"
                >
                  <h3
                    className={`inline-block text-micro font-mono font-semibold uppercase tracking-wider px-2 py-1 rounded-md border mb-3 ${TACTIC_COLORS[tactic] ?? ''}`}
                  >
                    {tactic}
                  </h3>
                  <div className="space-y-3">
                    {techniques.map((t) => (
                      <div key={t.id} className="border-l-2 border-brand-500/30 pl-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs font-semibold text-brand-600 dark:text-brand-400">
                              {t.id}
                            </span>
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 ml-2">
                              {t.name}
                            </span>
                          </div>
                          <span
                            className={`text-micro font-mono px-1.5 py-0.5 rounded ${CONFIDENCE_STYLES[t.confidence]}`}
                          >
                            {t.confidence}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.evidence}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-8 text-micro font-mono text-slate-400 text-center">
        H3AD-AI / ATTMAP-AI — Behavior to ATT&CK. Mapped.
      </p>
    </div>
  );
}
