import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, FolderTree, HelpCircle } from 'lucide-react';

interface RegistryEntry {
  path: string;
  category: string;
  description: string;
  malware: string[];
  techniqueId: string;
  technique: string;
  tactic: string;
  risk: 'critical' | 'high' | 'medium' | 'low';
}

const KNOWN_KEYS: RegistryEntry[] = [
  // Persistence — Run Keys
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    category: 'Persistence',
    description: 'Run key — common malware persistence via registry.',
    malware: ['Emotet', 'TrickBot', 'AgentTesla', 'QakBot'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    category: 'Persistence',
    description: 'User-specific run key persistence.',
    malware: ['FormBook', 'Lokibot', 'RemcosRAT'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
    category: 'Persistence',
    description: 'Run once key — executes on next boot then deletes.',
    malware: ['Ryuk', 'Conti'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'medium',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunServices',
    category: 'Persistence',
    description: 'RunServices key — loads before user logon.',
    malware: ['NetBus', 'SubSeven'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'medium',
  },
  {
    path: 'HKLM\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
    category: 'Persistence',
    description: '32-bit run key on 64-bit systems.',
    malware: ['CoinMiner'],
    techniqueId: 'T1547.001',
    technique: 'Registry Run Keys / Startup Folder',
    tactic: 'Persistence',
    risk: 'high',
  },

  // Boot Execute
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\BootExecute',
    category: 'Persistence',
    description: 'BootExecute — runs before system services start.',
    malware: ['BootRookit', 'TDSS', 'Petya'],
    techniqueId: 'T1547.002',
    technique: 'LSASS Driver Load',
    tactic: 'Persistence',
    risk: 'high',
  },

  // Service
  {
    path: 'HKLM\\System\\CurrentControlSet\\Services',
    category: 'Persistence',
    description: 'Windows services key — subkeys are individual service configurations.',
    malware: ['WannaCry', 'Stuxnet', 'TrickBot'],
    techniqueId: 'T1543.003',
    technique: 'Windows Service',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\SafeBoot',
    category: 'Defense Evasion',
    description: 'SafeBoot configuration — malware may disable or use minimal safe mode.',
    malware: ['RobbinHood', 'GandCrab'],
    techniqueId: 'T1562.001',
    technique: 'Disable or Modify Tools',
    tactic: 'Defense Evasion',
    risk: 'medium',
  },

  // Image File Execution Options
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options',
    category: 'Defense Evasion',
    description: 'IFEO — used for silent process exit debugging, process ghosting.',
    malware: ['PlugX', 'Houdini'],
    techniqueId: 'T1546.012',
    technique: 'Image File Execution Options Injection',
    tactic: 'Defense Evasion',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\*\\Debugger',
    category: 'Defense Evasion',
    description: 'Global debugger flags — redirects execution to an attacker binary.',
    malware: ['PlugX', 'Gh0stRAT'],
    techniqueId: 'T1546.012',
    technique: 'Image File Execution Options Injection',
    tactic: 'Defense Evasion',
    risk: 'high',
  },

  // Notifications — Winlogon
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\Notify',
    category: 'Persistence',
    description: 'Winlogon notifications — loads DLLs on user logon.',
    malware: ['Mydoom', 'Gaobot'],
    techniqueId: 'T1547.004',
    technique: 'Winlogon Helper DLL',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\Userinit',
    category: 'Persistence',
    description: 'Userinit — userinit.exe is launched at logon.',
    malware: ['TrickBot', 'Zeus', 'Banker'],
    techniqueId: 'T1547.004',
    technique: 'Winlogon Helper DLL',
    tactic: 'Persistence',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\Shell',
    category: 'Persistence',
    description: 'Shell — replaces explorer.exe as the default shell.',
    malware: ['Ransom.Win32.FileCrypt', 'Dexter'],
    techniqueId: 'T1547.004',
    technique: 'Winlogon Helper DLL',
    tactic: 'Persistence',
    risk: 'high',
  },

  // AppInit
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows\\AppInit_DLLs',
    category: 'Persistence',
    description: 'AppInit_DLLs — loads DLLs into every process loading user32.dll.',
    malware: ['Koobface', 'Ramnit', 'Bancos'],
    techniqueId: 'T1546.001',
    technique: 'AppInit DLLs',
    tactic: 'Persistence',
    risk: 'critical',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows\\LoadAppInit_DLLs',
    category: 'Persistence',
    description: 'Enables or disables AppInit_DLLs loading.',
    malware: ['Koobface'],
    techniqueId: 'T1546.001',
    technique: 'AppInit DLLs',
    tactic: 'Persistence',
    risk: 'high',
  },

  // Browser Helpers
  {
    path: 'HKLM\\Software\\Microsoft\\Internet Explorer\\Extensions',
    category: 'Persistence',
    description: 'IE extensions — depreacted but still supported for legacy compat.',
    malware: ['SearchProtect', 'SpySheriff'],
    techniqueId: 'T1176',
    technique: 'Browser Extensions',
    tactic: 'Persistence',
    risk: 'medium',
  },

  // LSA Security Packages
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Lsa\\Security Packages',
    category: 'Credential Access',
    description: 'LSA security packages — loads authentication packages including SSPs.',
    malware: ['Mimikatz SSP', 'Wannabe'],
    techniqueId: 'T1556.004',
    technique: 'Security Support Provider (SSP)',
    tactic: 'Credential Access',
    risk: 'high',
  },
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Lsa\\Authentication Packages',
    category: 'Credential Access',
    description: 'Authentication packages loaded by LSA.',
    malware: ['WannaMine'],
    techniqueId: 'T1556.004',
    technique: 'Security Support Provider (SSP)',
    tactic: 'Credential Access',
    risk: 'medium',
  },

  // Notification Packages
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Lsa\\Notification Packages',
    category: 'Credential Access',
    description: 'LSA notification packages for password change notifications (DPAPI).',
    malware: ['Mimikatz'],
    techniqueId: 'T1556.004',
    technique: 'Security Support Provider (SSP)',
    tactic: 'Credential Access',
    risk: 'high',
  },

  // Logon scripts
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System',
    category: 'Persistence',
    description: 'Windows system policies including logon scripts, hide last user.',
    malware: ['Vobfus', 'Autorun'],
    techniqueId: 'T1547.006',
    technique: 'Boot or Logon Autostart',
    tactic: 'Persistence',
    risk: 'medium',
  },
  {
    path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System',
    category: 'Persistence',
    description: 'Per-user system policies.',
    malware: ['LogonBGI'],
    techniqueId: 'T1547.006',
    technique: 'Boot or Logon Autostart',
    tactic: 'Persistence',
    risk: 'medium',
  },

  // Certificates
  {
    path: 'HKLM\\Software\\Microsoft\\SystemCertificates\\Root\\Certificates',
    category: 'Defense Evasion',
    description: 'Root certificate store — malware may install untrusted root CAs.',
    malware: ['Superfish', 'Dell eDellRoot', 'PlugX'],
    techniqueId: 'T1553.004',
    technique: 'Install Root Certificate',
    tactic: 'Defense Evasion',
    risk: 'high',
  },
  {
    path: 'HKLM\\Software\\Microsoft\\EnterpriseCertificates\\Root\\Certificates',
    category: 'Defense Evasion',
    description: 'Enterprise root certificate store.',
    malware: ['Stuxnet'],
    techniqueId: 'T1553.004',
    technique: 'Install Root Certificate',
    tactic: 'Defense Evasion',
    risk: 'medium',
  },

  // AppCert
  {
    path: 'HKLM\\System\\CurrentControlSet\\Control\\Session Manager\\AppCertDlls',
    category: 'Persistence',
    description: 'AppCert DLLs — loaded by every process that calls Win32 APIs.',
    malware: [],
    techniqueId: 'T1546.009',
    technique: 'AppCert DLLs',
    tactic: 'Persistence',
    risk: 'high',
  },

  // Active Setup
  {
    path: 'HKLM\\Software\\Microsoft\\Active Setup\\Installed Components',
    category: 'Persistence',
    description: 'Active Setup — runs on user logon before explorer.',
    malware: ['Adware', 'BrowseFox'],
    techniqueId: 'T1547.011',
    technique: 'Active Setup',
    tactic: 'Persistence',
    risk: 'medium',
  },

  // User Shell Folders
  {
    path: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
    category: 'Persistence',
    description: 'Shell folder redirection — malware can redirect startup/profile locations.',
    malware: ['ZeroAccess'],
    techniqueId: 'T1547.006',
    technique: 'Boot or Logon Autostart',
    tactic: 'Persistence',
    risk: 'medium',
  },
  {
    path: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
    category: 'Persistence',
    description: 'Per-user shell folder redirection.',
    malware: [],
    techniqueId: 'T1547.006',
    technique: 'Boot or Logon Autostart',
    tactic: 'Persistence',
    risk: 'low',
  },
];

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  medium:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700',
};

export default function Regscope(): JSX.Element {
  const [keyPath, setKeyPath] = useState('');
  const [result, setResult] = useState<RegistryEntry | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tacticFilter, setTacticFilter] = useState<string>('all');

  const categories = useMemo(() => [...new Set(KNOWN_KEYS.map((k) => k.category))], []);
  const tactics = useMemo(() => [...new Set(KNOWN_KEYS.map((k) => k.tactic))], []);

  const filtered = useMemo(() => {
    return KNOWN_KEYS.filter(
      (k) =>
        (categoryFilter === 'all' || k.category === categoryFilter) &&
        (tacticFilter === 'all' || k.tactic === tacticFilter)
    );
  }, [categoryFilter, tacticFilter]);

  const analyzeKey = () => {
    const normalized = keyPath.trim().toLowerCase().replace(/\\/g, '\\');
    if (!normalized) {
      setResult(null);
      return;
    }

    const matched = KNOWN_KEYS.find((k) => normalized.startsWith(k.path.toLowerCase()));
    if (matched) {
      setResult(matched);
    } else {
      // Walk up to find nearest parent
      const parts = normalized.split('\\');
      for (let i = parts.length - 1; i >= 1; i--) {
        const ancestor = parts.slice(0, i).join('\\');
        const match = KNOWN_KEYS.find((k) => k.path.toLowerCase() === ancestor);
        if (match) {
          setResult(match);
          return;
        }
      }
      setResult(null);
    }
  };

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
          <FolderTree size={28} className="text-brand-600 dark:text-brand-400" />
          <h1 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
            REGSCOPE — Registry Artifact Analyzer
          </h1>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
          Analyze Windows registry key paths for known persistence, defense evasion, and credential access techniques.
          Contains {KNOWN_KEYS.length} entries across {categories.length} categories and {tactics.length} ATT&CK
          tactics. 100% client-side — no data leaves your browser.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Search size={14} className="text-slate-400" />
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Registry Key Path</span>
            </div>

            <input
              type="text"
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              placeholder="HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />

            <p className="text-micro font-mono text-slate-400 mt-2">
              Full paths supported. The analyzer walks up the path to find the nearest known parent key.
            </p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="text-micro font-mono text-slate-400 self-center">Hive shortcuts:</span>
              {['HKLM', 'HKCU', 'HKCR', 'HKU', 'HKCC'].map((hive) => (
                <span
                  key={hive}
                  className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                >
                  {hive}
                </span>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={analyzeKey}
                disabled={!keyPath.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <Search size={16} /> Analyze Key
              </button>
              <button
                type="button"
                onClick={() => {
                  setKeyPath('');
                  setResult(null);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Key Database</span>
              <span className="text-xs font-mono text-slate-400">{KNOWN_KEYS.length} entries</span>
              <span className="ml-auto text-xs text-slate-400">{showAll ? '▲' : '▼'}</span>
            </button>

            {showAll && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2 mb-3">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-2 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={tacticFilter}
                    onChange={(e) => setTacticFilter(e.target.value)}
                    className="px-2 py-1 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300"
                  >
                    <option value="all">All Tactics</option>
                    {tactics.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {filtered.map((entry) => (
                    <div
                      key={entry.path}
                      role="button"
                      tabIndex={0}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 hover:border-brand-500/30 cursor-pointer transition-colors"
                      onClick={() => {
                        setKeyPath(entry.path);
                        setResult(entry);
                        setShowAll(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setKeyPath(entry.path);
                          setResult(entry);
                          setShowAll(false);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <code className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all">
                          {entry.path}
                        </code>
                        <span
                          className={`shrink-0 text-micro font-mono px-1 py-0.5 rounded border ${RISK_COLORS[entry.risk]}`}
                        >
                          {entry.risk}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-micro font-mono text-brand-600 dark:text-brand-400">
                          {entry.techniqueId}
                        </span>
                        <span className="text-micro font-mono text-slate-400">·</span>
                        <span className="text-micro font-mono text-slate-500">{entry.tactic}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          {!result && !keyPath.trim() && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/20 p-8 flex flex-col items-center justify-center text-center">
              <FolderTree size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
              <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
                Paste a registry key path and click Analyze
              </p>
              <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-2">
                Supports persistence, defense evasion, credential access, discovery, and known malware keys
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 mb-1">
                      Known Key Match
                    </h3>
                    <code className="text-xs font-mono text-slate-600 dark:text-slate-400 break-all">
                      {result.path}
                    </code>
                  </div>
                  <span
                    className={`shrink-0 text-micro font-mono font-semibold uppercase tracking-wider px-2 py-1 rounded-md border ${RISK_COLORS[result.risk]}`}
                  >
                    {result.risk}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Category</span>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-1">{result.category}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Tactic</span>
                    <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-1">{result.tactic}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 mb-3">
                  <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Description</span>
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mt-1">{result.description}</p>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">ATT&CK</span>
                  </div>
                  <span className="inline-block text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-500/30 mr-1">
                    {result.techniqueId}
                  </span>
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{result.technique}</span>
                </div>

                {result.malware.length > 0 && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-400">
                      Associated Malware
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {result.malware.map((m) => (
                        <span
                          key={m}
                          className="text-micro font-mono px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {keyPath.trim() && !result && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <HelpCircle size={16} />
                <p className="text-sm font-mono">
                  Key not recognized. The analyzer walks up the path to find the nearest known parent — try using a
                  higher-level path.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="mt-8 text-micro font-mono text-slate-400 text-center">
        H3AD-DF / REGSCOPE · {KNOWN_KEYS.length} entries · Client-side only · No backend
      </p>
    </div>
  );
}
