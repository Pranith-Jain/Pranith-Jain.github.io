import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { loadSql } from '../../lib/loadSql';
import {
  Play,
  Database,
  Table,
  Clock,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Terminal,
  RotateCcw,
  Info,
} from 'lucide-react';
import { CopyButton } from '../../components/dfir/CopyButton';

/**
 * In-browser SQL Workspace
 *
 * Query the platform's threat intelligence data using SQL directly in the browser.
 * Uses sql.js (SQLite compiled to WebAssembly) for client-side query execution.
 *
 * Inspired by etugen.io's in-browser SQL workspace feature.
 *
 * Data sources loaded into the virtual database:
 *   - threat_actors: Known threat actor profiles
 *   - malware_families: Malware family catalog
 *   - cve_recent: Recent CVE vulnerabilities
 *   - ioc_feed: Aggregated IOC feed
 *   - ransomware_victims: Recent ransomware victims
 *   - breach_disclosures: Data breach notifications
 */

const EXAMPLE_QUERIES = [
  {
    label: 'Recent critical CVEs',
    sql: "SELECT cve_id, severity, cvss_score, description FROM cve_recent WHERE severity = 'CRITICAL' ORDER BY published DESC LIMIT 20",
  },
  {
    label: 'Active ransomware groups',
    sql: 'SELECT group_name, COUNT(*) as victims FROM ransomware_victims GROUP BY group_name ORDER BY victims DESC LIMIT 15',
  },
  {
    label: 'Threat actors by country',
    sql: "SELECT country, COUNT(*) as actors, GROUP_CONCAT(name, ', ') as names FROM threat_actors WHERE country IS NOT NULL GROUP BY country ORDER BY actors DESC",
  },
  {
    label: 'Malware families by type',
    sql: "SELECT malware_type, COUNT(*) as count, GROUP_CONCAT(name, ', ') as families FROM malware_families GROUP BY malware_type ORDER BY count DESC",
  },
  {
    label: 'Recent breach disclosures',
    sql: 'SELECT entity, breach_date, records_exposed, data_types FROM breach_disclosures ORDER BY breach_date DESC LIMIT 20',
  },
  {
    label: 'IOC feed summary by type',
    sql: 'SELECT indicator_type, COUNT(*) as count, MIN(first_seen) as oldest, MAX(last_seen) as newest FROM ioc_feed GROUP BY indicator_type ORDER BY count DESC',
  },
];

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionMs: number;
}

export default function SqlWorkspace(): JSX.Element {
  const [sql, setSql] = useState(EXAMPLE_QUERIES[0].sql);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [dbLoading, setDbLoading] = useState(true);
  const [tables, setTables] = useState<string[]>([]);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [tableSchemas, setTableSchemas] = useState<Record<string, string[]>>({});
  const [queryHistory, setQueryHistory] = useState<Array<{ sql: string; time: string; rows: number }>>([]);
  const dbRef = useRef<unknown>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize sql.js database
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Load sql.js via the shared same-origin loader. Fetching the wasm
        // from the sql.js.org CDN is blocked by the worker CSP connect-src
        // (csp.ts only allows 'self' + Cloudflare hosts), so locateFile must
        // resolve to the Vite-emitted same-origin asset — which is exactly
        // what loadSql() does, matching SqliteExplorer / IosBackupExplorer.
        const SQL = await loadSql();
        if (cancelled) return;

        const db = new SQL.Database(new Uint8Array(0));
        dbRef.current = db;

        // Create schema with sample data
        db.run(`CREATE TABLE IF NOT EXISTS threat_actors (
          id INTEGER PRIMARY KEY, name TEXT, aliases TEXT, country TEXT,
          motivation TEXT, first_seen TEXT, last_seen TEXT, mitre_ids TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS malware_families (
          id INTEGER PRIMARY KEY, name TEXT, aliases TEXT, malware_type TEXT,
          platforms TEXT, mitre_ids TEXT, first_seen TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS cve_recent (
          id INTEGER PRIMARY KEY, cve_id TEXT UNIQUE, severity TEXT,
          cvss_score REAL, description TEXT, published TEXT, epss_score REAL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS ioc_feed (
          id INTEGER PRIMARY KEY, indicator TEXT, indicator_type TEXT,
          source TEXT, confidence INTEGER, first_seen TEXT, last_seen TEXT, tags TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS ransomware_victims (
          id INTEGER PRIMARY KEY, group_name TEXT, victim_name TEXT,
          sector TEXT, country TEXT, attack_date TEXT, published TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS breach_disclosures (
          id INTEGER PRIMARY KEY, entity TEXT, breach_date TEXT,
          records_exposed INTEGER, data_types TEXT, source TEXT
        )`);

        // Insert sample threat actors using exec (batch SQL)
        db.exec(`INSERT INTO threat_actors (name, aliases, country, motivation, first_seen, last_seen, mitre_ids) VALUES
          ('APT28', 'Fancy Bear, Sofacy', 'Russia', 'espionage', '2004-01-01', '2026-05-01', 'T1566.001,T1059.001'),
          ('APT29', 'Cozy Bear, The Dukes', 'Russia', 'espionage', '2008-01-01', '2026-05-15', 'T1078,T1053.005'),
          ('Lazarus Group', 'Hidden Cobra, ZINC', 'North Korea', 'financial', '2009-01-01', '2026-05-20', 'T1566.002,T1055'),
          ('APT41', 'Winnti, Barium', 'China', 'espionage', '2012-01-01', '2026-04-30', 'T1190,T1059.004'),
          ('Sandworm', 'Voodoo Bear', 'Russia', 'destruction', '2014-01-01', '2026-05-10', 'T1486,T1490'),
          ('TA505', 'Hive0065', 'Russia', 'financial', '2014-06-01', '2026-05-18', 'T1566.001,T1204.002'),
          ('Kimsuky', 'Thallium', 'North Korea', 'espionage', '2013-01-01', '2026-05-12', 'T1566.001,T1059.001'),
          ('Volt Typhoon', 'Bronze Silhouette', 'China', 'espionage', '2021-01-01', '2026-05-22', 'T1059.004,T1003.001'),
          ('Scattered Spider', 'UNC3944', 'Unknown', 'financial', '2022-06-01', '2026-05-25', 'T1566.002,T1078'),
          ('LockBit', 'LockBit 3.0', 'Russia', 'financial', '2019-09-01', '2026-05-28', 'T1486,T1490,T1059.001')`);

        // Insert sample malware using exec (batch SQL)
        db.exec(`INSERT INTO malware_families (name, aliases, malware_type, platforms, mitre_ids, first_seen) VALUES
          ('Cobalt Strike', 'Beacon', 'backdoor', 'Windows', 'T1071.001,T1055', '2012-01-01'),
          ('Mimikatz', 'Kiwi', 'credential-dumper', 'Windows', 'T1003.001', '2011-06-01'),
          ('Emotet', 'Heodo', 'loader', 'Windows', 'T1566.001,T1059.005', '2014-06-01'),
          ('QakBot', 'Qakbot, Pinkslipbot', 'loader', 'Windows', 'T1566.001,T1053.005', '2008-01-01'),
          ('IcedID', 'BokBot', 'loader', 'Windows', 'T1566.001,T1059.001', '2017-09-01'),
          ('AsyncRAT', 'Njrat', 'rat', 'Windows', 'T1059.001,T1055', '2019-01-01'),
          ('Sliver', '—', 'c2-framework', 'Windows,Linux,macOS', 'T1071.001,T1059.004', '2019-11-01'),
          ('Brute Ratel', 'BCR', 'c2-framework', 'Windows', 'T1071.001,T1055', '2020-01-01'),
          ('Akira', '—', 'ransomware', 'Windows,Linux', 'T1486,T1490', '2023-03-01'),
          ('BlackCat', 'ALPHV', 'ransomware', 'Windows,Linux', 'T1486,T1059.004', '2021-11-01'),
          ('LockBit 3.0', 'LockBit Black', 'ransomware', 'Windows', 'T1486,T1490', '2022-06-01')`);

        // Insert sample CVEs using exec (batch SQL)
        db.exec(`INSERT INTO cve_recent (cve_id, severity, cvss_score, description, published, epss_score) VALUES
          ('CVE-2024-3094', 'CRITICAL', 10.0, 'XZ Utils backdoor - malicious code in versions 5.6.0 and 5.6.1', '2024-03-29', 0.95),
          ('CVE-2024-21887', 'CRITICAL', 9.1, 'Command injection in Ivanti Connect Secure and Policy Secure', '2024-01-10', 0.92),
          ('CVE-2024-3400', 'CRITICAL', 10.0, 'Command injection in Palo Alto Networks PAN-OS GlobalProtect', '2024-04-12', 0.89),
          ('CVE-2024-27198', 'CRITICAL', 9.8, 'Authentication bypass in JetBrains TeamCity', '2024-03-04', 0.87),
          ('CVE-2023-46805', 'CRITICAL', 8.2, 'Authentication bypass in Ivanti Connect Secure', '2024-01-10', 0.91),
          ('CVE-2024-1709', 'CRITICAL', 10.0, 'Authentication bypass in ConnectWise ScreenConnect', '2024-02-19', 0.88),
          ('CVE-2024-23897', 'CRITICAL', 9.8, 'Arbitrary file read in Jenkins', '2024-01-24', 0.85),
          ('CVE-2023-4966', 'CRITICAL', 9.4, 'Citrix Bleed - session hijacking in Citrix NetScaler', '2023-10-10', 0.93),
          ('CVE-2024-23917', 'CRITICAL', 9.8, 'Authentication bypass in JetBrains TeamCity', '2024-02-20', 0.86),
          ('CVE-2024-20353', 'CRITICAL', 8.6, 'DoS in Cisco ASA and FTD', '2024-04-24', 0.82)`);

        // Insert sample IOCs using exec (batch SQL)
        db.exec(`INSERT INTO ioc_feed (indicator, indicator_type, source, confidence, first_seen, last_seen, tags) VALUES
          ('185.220.100.252', 'ipv4', 'tor-exit', 85, '2024-01-01', '2026-05-30', 'tor,exit-node'),
          ('evil-domain.xyz', 'domain', 'threatfox', 92, '2024-03-15', '2026-05-28', 'c2,malware'),
          ('hxxps://malware.exe', 'url', 'urlhaus', 88, '2024-06-01', '2026-05-25', 'malware-download'),
          ('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', 'hash', 'malwarebazaar', 95, '2024-04-10', '2026-05-20', 'emotet'),
          ('93.184.216.34', 'ipv4', 'abuseipdb', 72, '2023-01-01', '2026-05-15', 'scanner'),
          ('bad-actor.ru', 'domain', 'threatfox', 90, '2024-02-20', '2026-05-22', 'apt28,c2')`);

        // Insert sample ransomware victims using exec (batch SQL)
        db.exec(`INSERT INTO ransomware_victims (group_name, victim_name, sector, country, attack_date, published) VALUES
          ('LockBit', 'Acme Corp', 'Manufacturing', 'US', '2026-05-01', '2026-05-02'),
          ('BlackCat', 'GlobalHealth Inc', 'Healthcare', 'UK', '2026-05-05', '2026-05-06'),
          ('Akira', 'TechStart LLC', 'Technology', 'US', '2026-05-10', '2026-05-11'),
          ('LockBit', 'FinanceGroup AG', 'Finance', 'DE', '2026-05-12', '2026-05-13'),
          ('BlackCat', 'EduLearn Academy', 'Education', 'CA', '2026-05-15', '2026-05-16'),
          ('Play', 'RetailMax SA', 'Retail', 'FR', '2026-05-18', '2026-05-19'),
          ('Clop', 'DataVault Systems', 'Technology', 'US', '2026-05-20', '2026-05-21'),
          ('LockBit', 'LogiTrans GmbH', 'Transportation', 'DE', '2026-05-22', '2026-05-23')`);

        // Insert sample breaches using exec (batch SQL)
        db.exec(`INSERT INTO breach_disclosures (entity, breach_date, records_exposed, data_types, source) VALUES
          ('National Health Service', '2026-04-15', 1200000, 'PII,Medical', 'HHS'),
          ('MegaRetail Corp', '2026-03-20', 5000000, 'PII,Payment', 'SEC'),
          ('CloudTech Solutions', '2026-05-01', 800000, 'PII,Credentials', 'Company'),
          ('EduPlatform Inc', '2026-02-10', 2500000, 'PII,Academic', 'News')`);

        // Get table names
        const tableResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        if (tableResult.length > 0) {
          const tableNames = tableResult[0].values.map((v) => v[0] as string);
          setTables(tableNames);

          // Get schemas
          const schemas: Record<string, string[]> = {};
          for (const t of tableNames) {
            const schemaResult = db.exec(`PRAGMA table_info('${t}')`);
            if (schemaResult.length > 0) {
              schemas[t] = schemaResult[0].values.map((v) => `${v[1]} ${v[2]}`);
            }
          }
          setTableSchemas(schemas);
        }

        if (!cancelled) setDbReady(true);
      } catch (e) {
        console.error('Failed to init sql.js:', e);
      } finally {
        if (!cancelled) setDbLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      // Free the WASM-backed database handle. sql.js allocates the DB inside
      // the Emscripten heap; without an explicit close() it leaks for the
      // page's lifetime (and accumulates across hot reloads). Safe because
      // the effect runs once and the handle is only used while mounted.
      const db = dbRef.current as { close?: () => void } | null;
      db?.close?.();
      dbRef.current = null;
    };
  }, []);

  const executeQuery = useCallback((querySql: string) => {
    if (!dbRef.current) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const db = dbRef.current as { exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }> };
      const start = performance.now();
      const results = db.exec(querySql);
      const elapsed = performance.now() - start;

      if (results.length > 0) {
        const r = results[0];
        setResult({
          columns: r.columns,
          rows: r.values.slice(0, 500), // Limit to 500 rows
          rowCount: r.values.length,
          executionMs: Math.round(elapsed * 100) / 100,
        });
        setQueryHistory((prev) => [
          { sql: querySql, time: new Date().toLocaleTimeString(), rows: r.values.length },
          ...prev.slice(0, 19),
        ]);
      } else {
        setResult({ columns: [], rows: [], rowCount: 0, executionMs: Math.round(elapsed * 100) / 100 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Query failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (sql.trim()) executeQuery(sql.trim());
  };

  const exportCsv = () => {
    if (!result) return;
    const csv = [
      result.columns.join(','),
      ...result.rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 mb-6"
      >
        ← back to DFIR tools
      </Link>

      <h1 className="text-3xl font-display font-bold mb-2">SQL Workspace</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-6">
        Query threat intelligence data using SQL directly in your browser. Powered by sql.js (SQLite on WebAssembly).
        Inspired by etugen.io's in-browser SQL workspace.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Sidebar: Tables & History */}
        <div className="space-y-4">
          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <Database size={12} /> Tables
            </h3>
            {dbLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : (
              <div className="space-y-1">
                {tables.map((t) => (
                  <div key={t}>
                    <button
                      onClick={() => setExpandedTable(expandedTable === t ? null : t)}
                      className="w-full flex items-center gap-1.5 text-xs font-mono text-left hover:text-brand-600 dark:hover:text-brand-400 py-0.5"
                    >
                      {expandedTable === t ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      <Table size={10} /> {t}
                    </button>
                    {expandedTable === t && tableSchemas[t] && (
                      <div className="ml-4 mt-0.5 space-y-0.5">
                        {tableSchemas[t].map((col) => (
                          <div key={col} className="text-micro font-mono text-slate-400">
                            {col}
                          </div>
                        ))}
                        <button
                          onClick={() => setSql(`SELECT * FROM ${t} LIMIT 50`)}
                          className="text-micro text-brand-600 dark:text-brand-400 hover:underline mt-1"
                        >
                          → query
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1">
            <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <Terminal size={12} /> Examples
            </h3>
            <div className="space-y-1">
              {EXAMPLE_QUERIES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => {
                    setSql(ex.sql);
                    void executeQuery(ex.sql);
                  }}
                  className="block w-full text-left text-mini text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 py-0.5 truncate"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          {queryHistory.length > 0 && (
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1">
              <h3 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                <Clock size={12} /> History
              </h3>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {queryHistory.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSql(h.sql);
                      void executeQuery(h.sql);
                    }}
                    className="block w-full text-left text-micro font-mono text-slate-500 hover:text-brand-600 truncate"
                  >
                    {h.time} · {h.rows} rows
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main area */}
        <div className="space-y-4">
          {/* SQL Editor */}
          <form onSubmit={onSubmit} className="space-y-2">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                rows={4}
                className="w-full p-3 pr-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono resize-y focus-visible:ring-2 focus-visible:ring-brand-500 focus:border-transparent"
                placeholder="SELECT * FROM threat_actors LIMIT 10"
                spellCheck={false}
              />
              <div className="absolute right-2 bottom-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSql('');
                    setResult(null);
                    setError('');
                  }}
                  className="p-1.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  title="Clear"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="submit"
                  disabled={loading || !sql.trim() || !dbReady}
                  className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {loading ? <RotateCcw size={12} className="animate-spin" /> : <Play size={12} />}
                  Run
                </button>
              </div>
            </div>
          </form>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-sm font-mono">
              <AlertTriangle size={14} className="inline mr-2" />
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
                  <span>
                    {result.rowCount} row{result.rowCount !== 1 ? 's' : ''}
                  </span>
                  <span>{result.executionMs}ms</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={exportCsv}
                    className="p-1.5 rounded text-slate-400 hover:text-brand-600"
                    title="Export CSV"
                  >
                    <Download size={14} />
                  </button>
                  <CopyButton value={JSON.stringify(result.rows, null, 2)} />
                </div>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                    <tr>
                      {result.columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800"
                      >
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-xs truncate"
                          >
                            {cell === null ? (
                              <span className="text-slate-300 dark:text-slate-600">NULL</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!result && !loading && !error && (
            <div className="text-center py-12">
              <Terminal size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500">
                Write a SQL query and click Run, or try an example from the sidebar.
              </p>
              <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1">
                <Info size={10} /> All data is synthetic — this is a demonstration workspace.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
