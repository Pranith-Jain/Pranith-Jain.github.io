import { useState } from 'react';
import { BackLink } from '../../components/BackLink';
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
    'bg-slate-100 text-slate-700 dark:bg-[rgb(var(--surface-300))] dark:text-slate-300 border-slate-300 dark:border-[rgb(var(--border-400))]',
  'Resource Development': 'bg-slate-100 text-slate-700 dark:bg-[rgb(var(--surface-300))] dark:text-slate-300',
  'Initial Access':
    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-800',
  Execution:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300 dark:border-orange-800',
  Persistence:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-300 dark:border-purple-800',
  'Privilege Escalation':
    'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-800',
  'Defense Evasion':
    'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300 border-pink-300 dark:border-pink-800',
  'Credential Access':
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  Discovery: 'bg-sky-100 text-sky-700 dark:bg-cyan-900/40 dark:text-sky-300 border-cyan-300 dark:border-cyan-800',
  'Lateral Movement':
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
  Collection: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border-teal-300 dark:border-teal-800',
  'Command and Control':
    'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-800',
  Exfiltration:
    'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-300 dark:border-violet-800',
  Impact: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300 dark:border-rose-800',
};

const INPUT_TYPES = ['Article / Report', 'Logs', 'Alert Details', 'Behavior Description'] as const;

interface TechniqueRule {
  id: string;
  name: string;
  tactic: string;
  keywords: string[];
  confidence: 'high' | 'medium' | 'low';
}

const TECHNIQUE_RULES: TechniqueRule[] = [
  // Initial Access
  {
    id: 'T1566.001',
    name: 'Spearphishing Attachment',
    tactic: 'Initial Access',
    keywords: ['phishing', 'email', 'attachment', 'macro', 'document', 'word', 'excel', 'pdf'],
    confidence: 'high',
  },
  {
    id: 'T1566.002',
    name: 'Spearphishing Link',
    tactic: 'Initial Access',
    keywords: ['phishing link', 'url', 'click', 'redirect', 'credential harvesting'],
    confidence: 'high',
  },
  {
    id: 'T1190',
    name: 'Exploit Public-Facing Application',
    tactic: 'Initial Access',
    keywords: ['exploit', 'vulnerability', 'cve', 'web app', 'rce', 'sqli', 'injection', 'xxe', 'ssrf'],
    confidence: 'high',
  },
  {
    id: 'T1133',
    name: 'External Remote Services',
    tactic: 'Initial Access',
    keywords: ['vpn', 'rdp', 'ssh', 'remote', 'brute force', 'credential stuffing'],
    confidence: 'medium',
  },
  {
    id: 'T1078',
    name: 'Valid Accounts',
    tactic: 'Initial Access',
    keywords: ['compromised account', 'stolen credentials', 'password spray', 'default password'],
    confidence: 'medium',
  },

  // Execution
  {
    id: 'T1204.002',
    name: 'User Execution: Malicious File',
    tactic: 'Execution',
    keywords: ['user opened', 'executed', 'ran', 'double-click', 'user action'],
    confidence: 'high',
  },
  {
    id: 'T1059.001',
    name: 'PowerShell',
    tactic: 'Execution',
    keywords: ['powershell', 'ps1', 'cmdlet', 'invoke-expression', 'iex', 'downloadstring'],
    confidence: 'high',
  },
  {
    id: 'T1059.003',
    name: 'Windows Command Shell',
    tactic: 'Execution',
    keywords: ['cmd.exe', 'command prompt', 'batch', 'bat file', 'cmd /c'],
    confidence: 'high',
  },
  {
    id: 'T1059.006',
    name: 'Python',
    tactic: 'Execution',
    keywords: ['python', 'py script', 'pip', 'requests', 'socket'],
    confidence: 'medium',
  },
  {
    id: 'T1059.007',
    name: 'JavaScript',
    tactic: 'Execution',
    keywords: ['javascript', 'js file', 'wscript', 'cscript', 'node.js'],
    confidence: 'medium',
  },
  {
    id: 'T1203',
    name: 'Exploitation for Client Execution',
    tactic: 'Execution',
    keywords: ['exploit', 'buffer overflow', 'use-after-free', 'memory corruption'],
    confidence: 'high',
  },
  {
    id: 'T1047',
    name: 'Windows Management Instrumentation',
    tactic: 'Execution',
    keywords: ['wmi', 'wmic', 'win32', 'powershell wmi'],
    confidence: 'high',
  },

  // Persistence
  {
    id: 'T1547.001',
    name: 'Registry Run Keys',
    tactic: 'Persistence',
    keywords: ['registry', 'run key', 'startup', 'hkcu', 'hklm', 'currentversion\\run'],
    confidence: 'high',
  },
  {
    id: 'T1543.003',
    name: 'Windows Service',
    tactic: 'Persistence',
    keywords: ['service', 'sc create', 'new-service', 'service install'],
    confidence: 'high',
  },
  {
    id: 'T1053.005',
    name: 'Scheduled Task',
    tactic: 'Persistence',
    keywords: ['scheduled task', 'cron', 'at.exe', 'schtasks', 'task scheduler'],
    confidence: 'high',
  },
  {
    id: 'T1546.003',
    name: 'WMI Event Subscription',
    tactic: 'Persistence',
    keywords: ['wmi event', 'event subscription', 'permanent wmi'],
    confidence: 'medium',
  },
  {
    id: 'T1136.001',
    name: 'Local Account',
    tactic: 'Persistence',
    keywords: ['new user', 'net user', 'add user', 'created account'],
    confidence: 'medium',
  },

  // Privilege Escalation
  {
    id: 'T1068',
    name: 'Exploitation for Privilege Escalation',
    tactic: 'Privilege Escalation',
    keywords: ['privilege escalation', 'kernel exploit', 'system root', 'admin', 'elevation'],
    confidence: 'high',
  },
  {
    id: 'T1055',
    name: 'Process Injection',
    tactic: 'Defense Evasion',
    keywords: ['injection', 'dll injection', 'process hollowing', 'reflective loading', 'inject'],
    confidence: 'high',
  },
  {
    id: 'T1134',
    name: 'Access Token Manipulation',
    tactic: 'Defense Evasion',
    keywords: ['token', 'impersonation', 'steal token', 'duplicate token'],
    confidence: 'medium',
  },

  // Credential Access
  {
    id: 'T1003.001',
    name: 'LSASS Memory',
    tactic: 'Credential Access',
    keywords: ['lsass', 'mimikatz', 'credential dump', 'sekurlsa', 'procdump'],
    confidence: 'high',
  },
  {
    id: 'T1003.002',
    name: 'Security Account Manager',
    tactic: 'Credential Access',
    keywords: ['sam', 'security account manager', 'sam database'],
    confidence: 'high',
  },
  {
    id: 'T1110',
    name: 'Brute Force',
    tactic: 'Credential Access',
    keywords: ['brute force', 'password spray', 'credential stuffing', 'login attempt'],
    confidence: 'high',
  },
  {
    id: 'T1558',
    name: 'Steal or Forge Kerberos Tickets',
    tactic: 'Credential Access',
    keywords: ['kerberos', 'golden ticket', 'silver ticket', 'kerberoasting', 'as-rep'],
    confidence: 'high',
  },
  {
    id: 'T1555',
    name: 'Credentials from Password Stores',
    tactic: 'Credential Access',
    keywords: ['password manager', 'keepass', 'browser credential', 'saved password'],
    confidence: 'medium',
  },

  // Discovery
  {
    id: 'T1046',
    name: 'Network Service Discovery',
    tactic: 'Discovery',
    keywords: ['port scan', 'nmap', 'service discovery', 'network scan'],
    confidence: 'high',
  },
  {
    id: 'T1082',
    name: 'System Information Discovery',
    tactic: 'Discovery',
    keywords: ['system info', 'os version', 'hostname', 'systeminfo', 'whoami'],
    confidence: 'medium',
  },
  {
    id: 'T1083',
    name: 'File and Directory Discovery',
    tactic: 'Discovery',
    keywords: ['dir listing', 'file enumeration', 'directory traversal', 'ls', 'dir'],
    confidence: 'medium',
  },

  // Lateral Movement
  {
    id: 'T1021.002',
    name: 'SMB/Windows Admin Shares',
    tactic: 'Lateral Movement',
    keywords: ['smb', 'psexec', 'wmic', 'admin share', 'c$', 'ipc$'],
    confidence: 'high',
  },
  {
    id: 'T1021.001',
    name: 'Remote Desktop Protocol',
    tactic: 'Lateral Movement',
    keywords: ['rdp', 'remote desktop', 'mstsc', 'terminal server'],
    confidence: 'high',
  },
  {
    id: 'T1021.006',
    name: 'Windows Remote Management',
    tactic: 'Lateral Movement',
    keywords: ['winrm', 'remoting', 'powershell remoting', 'enter-pssession'],
    confidence: 'high',
  },

  // Collection
  {
    id: 'T1005',
    name: 'Data from Local System',
    tactic: 'Collection',
    keywords: ['local file', 'collected', 'gathered', 'harvested', 'sensitive file'],
    confidence: 'medium',
  },
  {
    id: 'T1039',
    name: 'Data from Network Shared Drive',
    tactic: 'Collection',
    keywords: ['network share', 'unc path', 'mapped drive', 'smb share'],
    confidence: 'medium',
  },
  {
    id: 'T1113',
    name: 'Screen Capture',
    tactic: 'Collection',
    keywords: ['screenshot', 'screen capture', 'screen recording'],
    confidence: 'medium',
  },
  {
    id: 'T1056.001',
    name: 'Keylogging',
    tactic: 'Collection',
    keywords: ['keylog', 'keystroke', 'keyboard input', 'input capture'],
    confidence: 'high',
  },

  // C2
  {
    id: 'T1071.001',
    name: 'Web Protocols',
    tactic: 'Command and Control',
    keywords: ['http', 'https', 'beacon', 'c2', 'callback', 'reverse shell', 'port 443', 'port 80'],
    confidence: 'high',
  },
  {
    id: 'T1071.004',
    name: 'DNS',
    tactic: 'Command and Control',
    keywords: ['dns tunnel', 'dns query', 'dns beacon', 'dga', 'domain generation'],
    confidence: 'high',
  },
  {
    id: 'T1573',
    name: 'Encrypted Channel',
    tactic: 'Command and Control',
    keywords: ['encrypted', 'tls', 'ssl', 'certificate', 'channel encryption'],
    confidence: 'medium',
  },
  {
    id: 'T1095',
    name: 'Non-Application Layer Protocol',
    tactic: 'Command and Control',
    keywords: ['raw tcp', 'icmp tunnel', 'custom protocol', 'non-standard port'],
    confidence: 'medium',
  },
  {
    id: 'T1105',
    name: 'Ingress Tool Transfer',
    tactic: 'Command and Control',
    keywords: ['download', 'tool transfer', 'payload delivery', 'remote file'],
    confidence: 'medium',
  },

  // Exfiltration
  {
    id: 'T1041',
    name: 'Exfiltration Over C2 Channel',
    tactic: 'Exfiltration',
    keywords: ['exfiltrated', 'data theft', 'stole data', 'exfil', 'data out'],
    confidence: 'high',
  },
  {
    id: 'T1048',
    name: 'Exfiltration Over Alternative Protocol',
    tactic: 'Exfiltration',
    keywords: ['exfil dns', 'exfil icmp', 'alternative protocol', 'dns exfil'],
    confidence: 'medium',
  },
  {
    id: 'T1567',
    name: 'Exfiltration Over Web Service',
    tactic: 'Exfiltration',
    keywords: ['uploaded', 'cloud storage', 'pastebin', 'google drive', 'mega'],
    confidence: 'medium',
  },

  // Impact
  {
    id: 'T1486',
    name: 'Data Encrypted for Impact',
    tactic: 'Impact',
    keywords: ['ransomware', 'encrypted', 'ransom', 'decrypt', 'bitcoin', 'extortion'],
    confidence: 'high',
  },
  {
    id: 'T1489',
    name: 'Service Stop',
    tactic: 'Impact',
    keywords: ['service stop', 'stopped service', 'disabled service', 'service disruption'],
    confidence: 'high',
  },
  {
    id: 'T1485',
    name: 'Data Destruction',
    tactic: 'Impact',
    keywords: ['deleted', 'wiped', 'destroyed', 'overwritten', 'shredded'],
    confidence: 'high',
  },
  {
    id: 'T1490',
    name: 'Inhibit System Recovery',
    tactic: 'Impact',
    keywords: ['shadow copy', 'vss delete', 'backup delete', 'recovery prevention'],
    confidence: 'high',
  },
];

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-[rgb(var(--surface-300))] dark:text-slate-400',
};

function mapToTechniques(text: string, context: string): Technique[] {
  const combined = `${text} ${context}`.toLowerCase();
  const matched: Technique[] = [];
  const seen = new Set<string>();

  for (const rule of TECHNIQUE_RULES) {
    const matchCount = rule.keywords.filter((kw) => combined.includes(kw)).length;
    if (matchCount > 0 && !seen.has(rule.id)) {
      seen.add(rule.id);
      const matchedKeywords = rule.keywords.filter((kw) => combined.includes(kw));
      matched.push({
        id: rule.id,
        name: rule.name,
        tactic: rule.tactic,
        confidence: matchCount >= 2 ? rule.confidence : rule.confidence === 'high' ? 'medium' : 'low',
        evidence: `Matched: ${matchedKeywords.slice(0, 3).join(', ')}`,
      });
    }
  }

  matched.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.confidence] - order[b.confidence];
  });

  return matched;
}

export default function AttmapAi(): JSX.Element {
  const [inputType, setInputType] = useState<string>(INPUT_TYPES[0]);
  const [input, setInput] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState<Technique[]>([]);

  const runMapping = async () => {
    if (!input.trim()) return;
    setLoading(true);
    // Brief delay for UX
    await new Promise((r) => setTimeout(r, 300));
    const results = mapToTechniques(input, context);
    setMappings(results);
    setLoading(false);
  };

  const groupedByTactic = TACTICS.map((tactic) => ({
    tactic,
    techniques: mappings.filter((m) => m.tactic === tactic),
  })).filter((g) => g.techniques.length > 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-10">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Target size={28} className="text-brand-600 dark:text-brand-400" /> ATTMAP-AI
        </h1>
        <p className="text-muted max-w-2xl leading-relaxed">
          Describe an adversary behavior, alert, log, or report — maps to MITRE ATT&CK techniques with confidence
          scores, evidence, and tactic grouping.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5">
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
                      : 'bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.6)]'
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
              className="w-full px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
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
                className="w-full mt-1 px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>

            <p className="text-micro font-mono text-slate-400 mt-2">
              Analysis runs entirely in your browser — no data is sent to any server.
            </p>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={runMapping}
                disabled={loading || !input.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-colors"
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
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[rgb(var(--surface-200))]/40 border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300)/0.6)] transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div>
          {loading && (
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-8 flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-brand-600" />
              <p className="text-sm font-mono text-slate-500">Mapping behavior to ATT&CK techniques…</p>
            </div>
          )}

          {!loading && mappings.length === 0 && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/20 p-8 flex flex-col items-center justify-center text-center">
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
              <div className="text-xs font-mono text-slate-500">
                {mappings.length} technique{mappings.length !== 1 ? 's' : ''} mapped
              </div>
              {groupedByTactic.map(({ tactic, techniques }) => (
                <div
                  key={tactic}
                  className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/40 shadow-e1 p-5"
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
        Client-side analysis · no data leaves your browser · H3AD-AI / ATTMAP-AI
      </p>
    </div>
  );
}
