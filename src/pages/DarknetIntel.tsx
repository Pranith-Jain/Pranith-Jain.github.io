import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataPageLayout } from '../components/DataPageLayout';
import {
  Shield,
  Search as SearchIcon,
  Globe2,
  Lock,
  Bug,
  Skull,
  FileWarning,
  Key,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

type Tab = 'providers' | 'ip' | 'hash' | 'vuln' | 'ransom' | 'malware' | 'breach';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'providers', label: 'Sources', icon: <Shield className="h-4 w-4" /> },
  { id: 'ip', label: 'IP Intel', icon: <Globe2 className="h-4 w-4" /> },
  { id: 'hash', label: 'Hash Intel', icon: <SearchIcon className="h-4 w-4" /> },
  { id: 'vuln', label: 'Vulnerabilities', icon: <Bug className="h-4 w-4" /> },
  { id: 'ransom', label: 'Ransomware', icon: <Skull className="h-4 w-4" /> },
  { id: 'malware', label: 'Malware IOCs', icon: <FileWarning className="h-4 w-4" /> },
  { id: 'breach', label: 'Breach Intel', icon: <Lock className="h-4 w-4" /> },
];

const CARD =
  'rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1';
const INPUT =
  'w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40';
const BTN =
  'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50';

interface ProviderStatus {
  name: string;
  tools: number;
  auth: string;
  key_env: string | null;
  free: boolean;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function ResultCard({ data, label }: { data: unknown; label?: string }) {
  if (!data) return null;
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const lines = str.split('\n');
  return (
    <div className={`${CARD} overflow-hidden`}>
      {label && (
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-mono max-h-96">
        {lines.length > 200 ? lines.slice(0, 200).join('\n') + '\n... (truncated)' : str}
      </pre>
    </div>
  );
}

function ToolForm({
  title,
  description,
  inputs,
  onRun,
  loading,
  result,
  error,
}: {
  title: string;
  description: string;
  inputs: { name: string; placeholder: string; required?: boolean; type?: string }[];
  onRun: (params: Record<string, string>) => void;
  loading: boolean;
  result: unknown;
  error: string | null;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {inputs.map((inp) => (
            <input
              key={inp.name}
              type={inp.type ?? 'text'}
              placeholder={inp.placeholder}
              value={values[inp.name] ?? ''}
              onChange={set(inp.name)}
              className={`${INPUT} flex-1 min-w-[200px]`}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={loading || inputs.filter((i) => i.required !== false).some((i) => !values[i.name]?.trim())}
          onClick={() => onRun(values)}
          className={BTN}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
          {loading ? 'Running...' : 'Run'}
        </button>
        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
            <XCircle className="h-4 w-4" /> {error}
          </div>
        )}
        <ResultCard data={result} />
      </div>
    </div>
  );
}

function ProvidersTab() {
  const [sources, setSources] = useState<ProviderStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ providers: ProviderStatus[] }>('/api/v1/darknet-intel/sources')
      .then((d) => {
        if (!cancelled) setSources(d.providers);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'fetch failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading)
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading sources...
      </div>
    );
  if (error) return <div className="text-sm text-rose-600 py-8">{error}</div>;
  if (!sources) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sources.map((s) => (
        <div key={s.name} className={`${CARD} p-4`}>
          <div className="flex items-start justify-between">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.name}</h4>
            {s.free ? (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                FREE
              </span>
            ) : (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                PAID
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {s.tools} tool{s.tools !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            {s.auth === 'none' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : s.auth === 'optional' ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <Key className="h-3.5 w-3.5 text-rose-500" />
            )}
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {s.auth === 'none' ? 'No key needed' : s.auth === 'optional' ? 'Key optional' : `Key: ${s.key_env}`}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function useToolFetcher() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fn();
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setLoading(false);
    }
  }, []);
  return { loading, result, error, run };
}

function IpIntelTab() {
  const gn = useToolFetcher();
  const ab = useToolFetcher();
  const otx = useToolFetcher();
  return (
    <div className="space-y-4">
      <ToolForm
        title="GreyNoise IP Lookup"
        description="Classify an IP: benign/malicious/unknown scanner detection"
        inputs={[{ name: 'ip', placeholder: 'IP address (e.g. 8.8.8.8)', required: true }]}
        onRun={(p) => gn.run(() => apiGet(`/api/v1/darknet-intel/greynoise/ip?ip=${encodeURIComponent(p.ip ?? '')}`))}
        loading={gn.loading}
        result={gn.result}
        error={gn.error}
      />
      <ToolForm
        title="AbuseIPDB Check"
        description="Abuse reports, confidence score, ISP, country for an IP"
        inputs={[{ name: 'ip', placeholder: 'IP address', required: true }]}
        onRun={(p) =>
          ab.run(() => apiGet(`/api/v1/darknet-intel/abuseipdb/check?ip=${encodeURIComponent(p.ip ?? '')}`))
        }
        loading={ab.loading}
        result={ab.result}
        error={ab.error}
      />
      <ToolForm
        title="OTX IP Intelligence"
        description="AlienVault OTX: pulses, reputation, associated malware for an IP"
        inputs={[{ name: 'ip', placeholder: 'IPv4 address', required: true }]}
        onRun={(p) => otx.run(() => apiGet(`/api/v1/darknet-intel/otx/ip?ip=${encodeURIComponent(p.ip ?? '')}`))}
        loading={otx.loading}
        result={otx.result}
        error={otx.error}
      />
    </div>
  );
}

function HashIntelTab() {
  const mb = useToolFetcher();
  const hybrid = useToolFetcher();
  const otx = useToolFetcher();
  return (
    <div className="space-y-4">
      <ToolForm
        title="MalwareBazaar Hash Lookup"
        description="Look up malware sample by MD5/SHA1/SHA256"
        inputs={[{ name: 'hash', placeholder: 'MD5, SHA1, or SHA256 hash', required: true }]}
        onRun={(p) =>
          mb.run(() => apiGet(`/api/v1/darknet-intel/abusech/bazaar-hash?hash=${encodeURIComponent(p.hash ?? '')}`))
        }
        loading={mb.loading}
        result={mb.result}
        error={mb.error}
      />
      <ToolForm
        title="Hybrid Analysis Search"
        description="Sandbox detonation results, MITRE ATT&CK, network IOCs"
        inputs={[{ name: 'hash', placeholder: 'File hash', required: true }]}
        onRun={(p) =>
          hybrid.run(() => apiGet(`/api/v1/darknet-intel/hybrid/search?hash=${encodeURIComponent(p.hash ?? '')}`))
        }
        loading={hybrid.loading}
        result={hybrid.result}
        error={hybrid.error}
      />
      <ToolForm
        title="OTX File Hash Intelligence"
        description="AlienVault OTX pulse info for a file hash"
        inputs={[{ name: 'hash', placeholder: 'MD5, SHA1, or SHA256', required: true }]}
        onRun={(p) => otx.run(() => apiGet(`/api/v1/darknet-intel/otx/hash?hash=${encodeURIComponent(p.hash ?? '')}`))}
        loading={otx.loading}
        result={otx.result}
        error={otx.error}
      />
    </div>
  );
}

function VulnTab() {
  const vid = useToolFetcher();
  const vsearch = useToolFetcher();
  const otxcve = useToolFetcher();
  return (
    <div className="space-y-4">
      <ToolForm
        title="Vulnerability Lookup"
        description="Vulners: CVSS, description, exploit availability by CVE/EDB/GHSA"
        inputs={[{ name: 'id', placeholder: 'CVE-2024-3094 or EDB-12345', required: true }]}
        onRun={(p) => vid.run(() => apiGet(`/api/v1/darknet-intel/vulners/id?id=${encodeURIComponent(p.id ?? '')}`))}
        loading={vid.loading}
        result={vid.result}
        error={vid.error}
      />
      <ToolForm
        title="Vulners Search"
        description="Lucene search across the Vulners vulnerability database"
        inputs={[{ name: 'query', placeholder: 'Search query (e.g. "apache rce")', required: true }]}
        onRun={(p) => vsearch.run(() => apiPost('/api/v1/darknet-intel/vulners/search', { query: p.query }))}
        loading={vsearch.loading}
        result={vsearch.result}
        error={vsearch.error}
      />
      <ToolForm
        title="OTX CVE Intelligence"
        description="AlienVault OTX: related pulses and exploitation activity for a CVE"
        inputs={[{ name: 'cve', placeholder: 'CVE-2024-3094', required: true }]}
        onRun={(p) => otxcve.run(() => apiGet(`/api/v1/darknet-intel/otx/cve?cve=${encodeURIComponent(p.cve ?? '')}`))}
        loading={otxcve.loading}
        result={otxcve.result}
        error={otxcve.error}
      />
    </div>
  );
}

function RansomTab() {
  const group = useToolFetcher();
  const search = useToolFetcher();
  const country = useToolFetcher();
  const sector = useToolFetcher();
  const recent = useToolFetcher();
  return (
    <div className="space-y-4">
      <ToolForm
        title="Ransomware Group Profile"
        description="Group details: description, aliases, tools, TTPs, CVEs"
        inputs={[{ name: 'name', placeholder: 'Group name (e.g. lockbit3, blackcat)', required: true }]}
        onRun={(p) =>
          group.run(() => apiGet(`/api/v1/darknet-intel/ransomware/group?name=${encodeURIComponent(p.name ?? '')}`))
        }
        loading={group.loading}
        result={group.result}
        error={group.error}
      />
      <ToolForm
        title="Search Ransomware Victims"
        description="Search across ransomware.live by company name or domain"
        inputs={[{ name: 'q', placeholder: 'Search keyword', required: true }]}
        onRun={(p) =>
          search.run(() => apiGet(`/api/v1/darknet-intel/ransomware/search?q=${encodeURIComponent(p.q ?? '')}`))
        }
        loading={search.loading}
        result={search.result}
        error={search.error}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ToolForm
          title="By Country"
          description="Victims by ISO country code"
          inputs={[{ name: 'code', placeholder: 'US, GB, DE...', required: true }]}
          onRun={(p) =>
            country.run(() =>
              apiGet(`/api/v1/darknet-intel/ransomware/country?code=${encodeURIComponent(p.code ?? '')}`)
            )
          }
          loading={country.loading}
          result={country.result}
          error={country.error}
        />
        <ToolForm
          title="By Sector"
          description="Victims by industry sector"
          inputs={[{ name: 'sector', placeholder: 'healthcare, finance...', required: true }]}
          onRun={(p) =>
            sector.run(() =>
              apiGet(`/api/v1/darknet-intel/ransomware/sector?sector=${encodeURIComponent(p.sector ?? '')}`)
            )
          }
          loading={sector.loading}
          result={sector.result}
          error={sector.error}
        />
      </div>
      <ToolForm
        title="RansomLook Recent"
        description="Most recent ransomware victim claims from RansomLook"
        inputs={[]}
        onRun={() => recent.run(() => apiGet('/api/v1/darknet-intel/ransomware/ransomlook-recent'))}
        loading={recent.loading}
        result={recent.result}
        error={recent.error}
      />
    </div>
  );
}

function MalwareTab() {
  const tfRecent = useToolFetcher();
  const tfSearch = useToolFetcher();
  const tfTag = useToolFetcher();
  const uh = useToolFetcher();
  const bazaarRecent = useToolFetcher();
  return (
    <div className="space-y-4">
      <ToolForm
        title="ThreatFox Recent IOCs"
        description="Recent IOCs from ThreatFox (last N days)"
        inputs={[{ name: 'days', placeholder: 'Days (default 3)', required: false }]}
        onRun={(p) => tfRecent.run(() => apiGet(`/api/v1/darknet-intel/abusech/threatfox-iocs?days=${p.days ?? '3'}`))}
        loading={tfRecent.loading}
        result={tfRecent.result}
        error={tfRecent.error}
      />
      <ToolForm
        title="ThreatFox Search"
        description="Search ThreatFox by IP, domain, hash, or URL"
        inputs={[{ name: 'q', placeholder: 'IOC value', required: true }]}
        onRun={(p) =>
          tfSearch.run(() =>
            apiGet(`/api/v1/darknet-intel/abusech/threatfox-search?q=${encodeURIComponent(p.q ?? '')}`)
          )
        }
        loading={tfSearch.loading}
        result={tfSearch.result}
        error={tfSearch.error}
      />
      <ToolForm
        title="ThreatFox Tag Search"
        description="Search by tag (e.g. Cobalt Strike, Emotet)"
        inputs={[{ name: 'tag', placeholder: 'Tag name', required: true }]}
        onRun={(p) =>
          tfTag.run(() => apiGet(`/api/v1/darknet-intel/abusech/threatfox-tag?tag=${encodeURIComponent(p.tag ?? '')}`))
        }
        loading={tfTag.loading}
        result={tfTag.result}
        error={tfTag.error}
      />
      <ToolForm
        title="URLhaus Lookup"
        description="Check URL or host for malware distribution"
        inputs={[{ name: 'url', placeholder: 'URL or host', required: false }]}
        onRun={(p) =>
          uh.run(() => apiGet(`/api/v1/darknet-intel/abusech/urlhaus?url=${encodeURIComponent(p.url ?? '')}`))
        }
        loading={uh.loading}
        result={uh.result}
        error={uh.error}
      />
      <ToolForm
        title="MalwareBazaar Recent"
        description="Last 100 submitted malware samples"
        inputs={[]}
        onRun={() => bazaarRecent.run(() => apiGet('/api/v1/darknet-intel/abusech/bazaar-recent'))}
        loading={bazaarRecent.loading}
        result={bazaarRecent.result}
        error={bazaarRecent.error}
      />
    </div>
  );
}

function BreachTab() {
  const hibpBreach = useToolFetcher();
  const hibpPass = useToolFetcher();
  const hibpClasses = useToolFetcher();
  const ixSearch = useToolFetcher();
  const ixPb = useToolFetcher();
  return (
    <div className="space-y-4">
      <ToolForm
        title="HIBP Breach Details"
        description="Get details of a specific data breach by name"
        inputs={[{ name: 'name', placeholder: 'Breach name (e.g. Adobe, LinkedIn)', required: true }]}
        onRun={(p) =>
          hibpBreach.run(() => apiGet(`/api/v1/darknet-intel/hibp/breach?name=${encodeURIComponent(p.name ?? '')}`))
        }
        loading={hibpBreach.loading}
        result={hibpBreach.result}
        error={hibpBreach.error}
      />
      <ToolForm
        title="HIBP Password Check"
        description="Check if a password has been pwned (k-anonymity)"
        inputs={[{ name: 'password', placeholder: 'Password to check', required: true, type: 'password' }]}
        onRun={(p) =>
          hibpPass.run(() =>
            apiGet(`/api/v1/darknet-intel/hibp/password?password=${encodeURIComponent(p.password ?? '')}`)
          )
        }
        loading={hibpPass.loading}
        result={hibpPass.result}
        error={hibpPass.error}
      />
      <ToolForm
        title="HIBP Data Classes"
        description="List all types of compromised data HIBP tracks"
        inputs={[]}
        onRun={() => hibpClasses.run(() => apiGet('/api/v1/darknet-intel/hibp/data-classes'))}
        loading={hibpClasses.loading}
        result={hibpClasses.result}
        error={hibpClasses.error}
      />
      <ToolForm
        title="IntelligenceX Search"
        description="Search leaked data, paste sites, dark web content (requires INTELX_API_KEY)"
        inputs={[{ name: 'q', placeholder: 'Search term', required: true }]}
        onRun={(p) =>
          ixSearch.run(() => apiGet(`/api/v1/darknet-intel/intelx/search?q=${encodeURIComponent(p.q ?? '')}`))
        }
        loading={ixSearch.loading}
        result={ixSearch.result}
        error={ixSearch.error}
      />
      <ToolForm
        title="IntelligenceX Phonebook"
        description="Find emails, domains, URLs associated with a term (requires INTELX_API_KEY)"
        inputs={[{ name: 'q', placeholder: 'Search term', required: true }]}
        onRun={(p) =>
          ixPb.run(() => apiGet(`/api/v1/darknet-intel/intelx/phonebook?q=${encodeURIComponent(p.q ?? '')}`))
        }
        loading={ixPb.loading}
        result={ixPb.result}
        error={ixPb.error}
      />
    </div>
  );
}

export default function DarknetIntel() {
  const [tab, setTab] = useState<Tab>('providers');

  const tabContent = useMemo(() => {
    switch (tab) {
      case 'providers':
        return <ProvidersTab />;
      case 'ip':
        return <IpIntelTab />;
      case 'hash':
        return <HashIntelTab />;
      case 'vuln':
        return <VulnTab />;
      case 'ransom':
        return <RansomTab />;
      case 'malware':
        return <MalwareTab />;
      case 'breach':
        return <BreachTab />;
    }
  }, [tab]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Shield className="h-6 w-6" />}
      title="Darknet Intel"
      description="42 tools across 13 providers — IP reputation, malware analysis, vulnerability lookup, ransomware tracking, breach intelligence, and dark web search."
      maxWidthClass="max-w-6xl"
    >
      <div className="flex flex-wrap gap-1 mb-6 border-b border-slate-200 dark:border-[rgb(var(--border-400))] pb-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {tabContent}
    </DataPageLayout>
  );
}
