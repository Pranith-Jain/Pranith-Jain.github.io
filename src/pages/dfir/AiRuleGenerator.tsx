import { useState, useCallback } from 'react';
import { Wand2, Loader2, Download, Shield, FileCode, Database, AlertTriangle, Code } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { CopyButton } from '../../components/dfir/CopyButton';
import { adminAuthHeaders } from '../../lib/admin-token';

type RuleType = 'yara' | 'sigma' | 'kql' | 'splunk' | 'lucene' | 'eql' | 'snort' | 'powershell' | 'dlp' | 'supplychain';

interface GeneratedRule {
  rule_id: string;
  rule_type: RuleType;
  rule_name: string;
  rule_content: string;
  description: string;
  detection_logic: string[];
  syntax_confidence: 'high' | 'medium' | 'low';
  detection_confidence: 'high' | 'medium' | 'low';
  testing_notes: string;
  mitre_techniques: string[];
  meta: {
    generated_at: string;
    model: string;
    complexity: string;
  };
}

const RULE_TYPES: Array<{
  type: RuleType;
  label: string;
  icon: React.ReactNode;
  description: string;
  category: string;
}> = [
  {
    type: 'yara',
    label: 'YARA',
    icon: <FileCode size={16} />,
    description: 'File pattern matching',
    category: 'endpoint',
  },
  { type: 'sigma', label: 'Sigma', icon: <Shield size={16} />, description: 'SIEM-agnostic rules', category: 'siem' },
  { type: 'kql', label: 'KQL', icon: <Database size={16} />, description: 'Sentinel / Defender', category: 'siem' },
  { type: 'splunk', label: 'Splunk', icon: <Database size={16} />, description: 'SPL queries', category: 'siem' },
  {
    type: 'lucene',
    label: 'Lucene',
    icon: <Database size={16} />,
    description: 'Elasticsearch / Kibana',
    category: 'siem',
  },
  { type: 'eql', label: 'EQL', icon: <Database size={16} />, description: 'Elastic EQL', category: 'siem' },
  { type: 'snort', label: 'Snort', icon: <Shield size={16} />, description: 'Network IDS rules', category: 'network' },
  {
    type: 'powershell',
    label: 'PowerShell',
    icon: <Code size={16} />,
    description: 'Hunting scripts',
    category: 'endpoint',
  },
  { type: 'dlp', label: 'DLP', icon: <Shield size={16} />, description: 'Data loss prevention', category: 'data' },
  {
    type: 'supplychain',
    label: 'Supply Chain',
    icon: <FileCode size={16} />,
    description: 'Semgrep rules',
    category: 'supply-chain',
  },
];

const COMPLEXITY_OPTIONS = [
  { value: 'basic', label: 'Basic' },
  { value: 'standard', label: 'Standard' },
  { value: 'advanced', label: 'Advanced' },
];

const EXAMPLE_PROMPTS: Record<RuleType, string[]> = {
  yara: [
    'Detect Cobalt Strike beacon DLL with named pipes',
    'Find Emotet dropper with encoded PowerShell',
    'Identify LockBit ransomware encrypted files',
  ],
  sigma: [
    'Detect suspicious PowerShell execution with encoded commands',
    'Find credential dumping using Mimikatz',
    'Identify lateral movement via PsExec or WMI',
  ],
  kql: [
    'Find failed login attempts followed by successful auth',
    'Detect anomalous process creation from Office apps',
    'Identify DNS queries to known C2 domains',
  ],
  splunk: [
    'Detect brute force login attempts',
    'Find suspicious PowerShell downloads',
    'Identify new service creation for persistence',
  ],
  lucene: [
    'Detect connections to known C2 IPs',
    'Find suspicious process from temp dirs',
    'Identify large data transfers to external IPs',
  ],
  eql: [
    'Detect process injection followed by network connection',
    'Find file creation in startup after email attachment',
    'Identify credential access then lateral movement',
  ],
  snort: [
    'Detect Cobalt Strike beacon C2 traffic',
    'Find DNS tunneling with long subdomain queries',
    'Identify exploit kit landing page traffic',
  ],
  powershell: [
    'Hunt for suspicious scheduled task creation',
    'Detect process injection via process trees',
    'Find recently modified files in startup locations',
  ],
  dlp: [
    'Detect credit card numbers in documents',
    'Find Social Security Numbers in text',
    'Identify API keys and access tokens',
  ],
  supplychain: [
    'Detect typosquatting in npm dependencies',
    'Find suspicious post-install scripts',
    'Identify obfuscated code in JavaScript libraries',
  ],
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
};

function DownloadButton({ content, filename }: { content: string; filename: string }) {
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
    >
      <Download size={13} /> Download
    </button>
  );
}

export default function AiRuleGenerator(): JSX.Element {
  const [ruleType, setRuleType] = useState<RuleType>('yara');
  const [description, setDescription] = useState('');
  const [strings, setStrings] = useState('');
  const [family, setFamily] = useState('');
  const [complexity, setComplexity] = useState<'basic' | 'standard' | 'advanced'>('standard');
  const [logsource, setLogsource] = useState('');
  const [table, setTable] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedRule | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = { type: ruleType, description, complexity };
      if (strings.trim())
        body.strings = strings
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
      if (family.trim()) body.family = family;
      if (ruleType === 'sigma' && logsource.trim()) body.logsource = logsource;
      if ((ruleType === 'kql' || ruleType === 'splunk') && table.trim()) body.table = table;

      const res = await fetch('/api/v1/rules/generate', {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: { ...adminAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try {
          const p = JSON.parse(errBody) as { error?: string };
          msg = p.error ?? msg;
        } catch (_catchErr) {
          console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
          /* ok */
        }
        throw new Error(msg);
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
      setResult(await res.json());
    } catch (err) {
      console.error('handler failed:', err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [ruleType, description, strings, family, complexity, logsource, table]);

  const fileExtensions: Record<RuleType, string> = {
    yara: '.yar',
    sigma: '.yml',
    kql: '.kql',
    splunk: '.spl',
    lucene: '.txt',
    eql: '.eql',
    snort: '.rules',
    powershell: '.ps1',
    dlp: '.json',
    supplychain: '.yml',
  };

  const categories = ['endpoint', 'siem', 'network', 'data', 'supply-chain'];
  const catLabel: Record<string, string> = {
    endpoint: 'Endpoint',
    siem: 'SIEM',
    network: 'Network',
    data: 'Data',
    'supply-chain': 'Supply Chain',
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Wand2 size={28} />}
      title="AI Rule Generator"
      description="Describe a detection in plain English and generate syntactically valid rules in 10 formats. Powered by Workers
          AI with Groq fallback."
      maxWidthClass="max-w-6xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-5">
          {/* Rule Type Selector */}
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <h2 className="font-display font-bold text-sm mb-3">Rule Format</h2>
            {categories.map((cat) => {
              const items = RULE_TYPES.filter((rt) => rt.category === cat);
              if (items.length === 0) return null;
              return (
                <div key={cat} className="mb-3">
                  <div className="text-micro font-mono uppercase tracking-[0.18em] text-slate-400 mb-2">
                    {catLabel[cat]}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((rt) => (
                      <button
                        key={rt.type}
                        onClick={() => {
                          setRuleType(rt.type);
                          setResult(null);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono border transition-colors ${
                          ruleType === rt.type
                            ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                            : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/30'
                        }`}
                      >
                        {rt.icon} {rt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Description */}
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <h2 className="font-display font-bold text-sm mb-3">Detection Description</h2>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Describe what to detect…\n\nExample: ${EXAMPLE_PROMPTS[ruleType]?.[0] ?? ''}`}
              className="w-full h-28 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl p-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 resize-y font-mono"
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {(EXAMPLE_PROMPTS[ruleType] ?? []).slice(0, 3).map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setDescription(ex)}
                  className="text-mini px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-brand-500/40 transition-colors"
                >
                  {ex.slice(0, 45)}…
                </button>
              ))}
            </div>
          </div>

          {/* Known Indicators */}
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <h2 className="font-display font-bold text-sm mb-3">
              Known Indicators <span className="font-normal text-slate-500">(optional)</span>
            </h2>
            <textarea
              value={strings}
              onChange={(e) => setStrings(e.target.value)}
              placeholder="Enter values, one per line…"
              className="w-full h-20 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl p-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 resize-y font-mono"
            />
          </div>

          {/* Options */}
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
            <h2 className="font-display font-bold text-sm mb-3">Options</h2>
            <div className="space-y-3">
              <div>
                <label htmlFor="airule-family" className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                  Malware Family
                </label>
                <input
                  id="airule-family"
                  type="text"
                  value={family}
                  onChange={(e) => setFamily(e.target.value)}
                  placeholder="e.g., Cobalt Strike, Emotet"
                  className="w-full bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                />
              </div>
              {ruleType === 'sigma' && (
                <div>
                  <label htmlFor="airule-logsource" className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                    Log Source
                  </label>
                  <input
                    id="airule-logsource"
                    type="text"
                    value={logsource}
                    onChange={(e) => setLogsource(e.target.value)}
                    placeholder="e.g., windows/sysmon"
                    className="w-full bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  />
                </div>
              )}
              {(ruleType === 'kql' || ruleType === 'splunk') && (
                <div>
                  <label htmlFor="airule-table" className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">
                    Table / Index
                  </label>
                  <input
                    id="airule-table"
                    type="text"
                    value={table}
                    onChange={(e) => setTable(e.target.value)}
                    placeholder={ruleType === 'kql' ? 'e.g., SecurityEvent' : 'e.g., index=windows'}
                    className="w-full bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                  />
                </div>
              )}
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 mb-2 block">Complexity</span>
                <div className="flex gap-1.5" role="group" aria-label="Complexity">
                  {COMPLEXITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setComplexity(opt.value as typeof complexity)}
                      className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-mono border transition-colors ${complexity === opt.value ? 'border-brand-500/60 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-brand-500/30'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !description.trim()}
            className="w-full px-6 py-3 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Wand2 size={16} /> Generate {ruleType.toUpperCase()} Rule
              </>
            )}
          </button>
        </div>

        {/* Output Panel */}
        <div className="space-y-5">
          {error && (
            <div className="rounded-xl border border-rose-300/70 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-950/30 p-4 flex items-center gap-3">
              <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
              <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
            </div>
          )}

          {result ? (
            <>
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display font-bold text-sm flex items-center gap-2">
                    <Code size={14} className="text-brand-600 dark:text-brand-400" /> Generated Rule
                  </h2>
                  <div className="flex gap-2">
                    <CopyButton value={result.rule_content} />
                    <DownloadButton
                      content={result.rule_content}
                      filename={`${result.rule_name}${fileExtensions[ruleType]}`}
                    />
                  </div>
                </div>
                <pre className="bg-slate-50 dark:bg-[rgb(var(--input-200))] rounded-xl p-4 overflow-x-auto text-xs text-slate-700 dark:text-slate-300 font-mono max-h-[500px] overflow-y-auto border border-slate-200 dark:border-[rgb(var(--border-400))]">
                  {result.rule_content}
                </pre>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                <h2 className="font-display font-bold text-sm mb-3">Metadata</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-0.5">Rule Name</div>
                    <div className="font-mono">{result.rule_name}</div>
                  </div>
                  <div>
                    <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-0.5">
                      Complexity
                    </div>
                    <div className="capitalize">{result.meta.complexity}</div>
                  </div>
                  <div>
                    <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-0.5">
                      Syntax Confidence
                    </div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${CONFIDENCE_BADGE[result.syntax_confidence] ?? ''}`}
                    >
                      {result.syntax_confidence}
                    </span>
                  </div>
                  <div>
                    <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-0.5">
                      Detection Confidence
                    </div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${CONFIDENCE_BADGE[result.detection_confidence] ?? ''}`}
                    >
                      {result.detection_confidence}
                    </span>
                  </div>
                </div>
              </div>

              {result.mitre_techniques.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                  <h2 className="font-display font-bold text-sm mb-3">MITRE ATT&CK</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {result.mitre_techniques.map((t, i) => (
                      <a
                        key={i}
                        href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-xl border border-amber-300/50 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 text-xs font-mono hover:border-amber-500/60 transition-colors"
                      >
                        {t}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {result.testing_notes && (
                <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
                  <h2 className="font-display font-bold text-sm mb-2">Testing Notes</h2>
                  <p className="text-sm text-muted leading-relaxed">{result.testing_notes}</p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-10 text-center">
              <Wand2 size={32} className="text-slate-300 dark:text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Select a format and describe what to detect</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">The generated rule will appear here</p>
            </div>
          )}
        </div>
      </div>
    </DataPageLayout>
  );
}
