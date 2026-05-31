import { useCallback, useEffect, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Download, RefreshCw, Clock, Shield, Terminal, Activity, Copy, Check } from 'lucide-react';

interface BlocklistMeta {
  ok: boolean;
  ip_count: number;
  generated_at: string;
  source?: string;
}

const FORMATS = [
  {
    key: 'pfsense',
    label: 'pfSense',
    desc: 'Newline-separated IPs for pfSense URL alias (Alias) import',
    icon: Shield,
    ext: 'txt',
  },
  { key: 'iptables', label: 'iptables', desc: 'Shell script with INPUT/FORWARD DROP rules', icon: Terminal, ext: 'sh' },
  {
    key: 'suricata',
    label: 'Suricata',
    desc: 'Suricata drop rules with auto-incrementing SID',
    icon: Activity,
    ext: 'rules',
  },
] as const;

export default function BlocklistsPage(): JSX.Element {
  const [meta, setMeta] = useState<BlocklistMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchMeta = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/blocklists/meta');
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body ? `HTTP ${res.status}: ${body.slice(0, 100)}` : `HTTP ${res.status}`);
      }
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
      const data = (await res.json()) as BlocklistMeta;
      setMeta(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMeta();
  }, [fetchMeta]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Trigger a rebuild by fetching the meta — the handler regenerates on miss
    try {
      const res = await fetch('/api/v1/blocklists/pfsense');
      if (res.ok) {
        // Now warm all three formats
        await Promise.all([
          fetch('/api/v1/blocklists/pfsense'),
          fetch('/api/v1/blocklists/iptables'),
          fetch('/api/v1/blocklists/suricata'),
        ]);
      }
      await fetchMeta();
    } catch {
      /* ignore */
    }
    setRefreshing(false);
  };

  const downloadFormat = async (key: string, ext: string) => {
    try {
      const res = await fetch(`/api/v1/blocklists/${key}`);
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `blocklist-${key}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const copyFormat = async (key: string) => {
    try {
      const res = await fetch(`/api/v1/blocklists/${key}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Blocklist Export</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-3xl">
          Daily-generated blocklists from cross-source IOC consensus. IPs appearing in 2+ independent feeds. Download
          for pfSense, iptables, or Suricata. Updated every 24 hours.
        </p>
      </div>

      {/* Status bar */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 text-sm font-mono">
          <Clock size={16} className="text-slate-400" />
          {loading ? (
            <span className="text-slate-500">Loading…</span>
          ) : error ? (
            <span className="text-rose-600 dark:text-rose-400">{error}</span>
          ) : meta ? (
            <span>
              <span className="text-slate-500">Last updated: </span>
              <span className="text-slate-900 dark:text-slate-100">
                {new Date(meta.generated_at).toLocaleDateString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="ml-3 text-slate-500">·</span>
              <span className="ml-3 text-slate-900 dark:text-slate-100 font-semibold">
                {meta.ip_count.toLocaleString()} IPs
              </span>
              {meta.source === 'kv' && (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  cached
                </span>
              )}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-xs disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {/* Format cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {FORMATS.map((fmt) => (
          <div
            key={fmt.key}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col"
          >
            <div className="flex items-center gap-2 mb-3">
              <fmt.icon size={18} className="text-brand-600 dark:text-brand-400" />
              <h3 className="font-display font-semibold text-slate-900 dark:text-slate-100">{fmt.label}</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 flex-1">{fmt.desc}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void downloadFormat(fmt.key, fmt.ext)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-mono text-xs"
              >
                <Download size={12} /> Download
              </button>
              <button
                type="button"
                onClick={() => void copyFormat(fmt.key)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-xs"
              >
                {copiedKey === fmt.key ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview section */}
      {!loading && !error && (
        <details className="mt-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <summary className="px-4 py-3 cursor-pointer text-sm font-mono text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400">
            Preview blocklist contents
          </summary>
          <div className="px-4 pb-4 space-y-4">
            {FORMATS.map((fmt) => (
              <FormatPreview key={fmt.key} label={fmt.label} url={`/api/v1/blocklists/${fmt.key}`} maxLines={8} />
            ))}
          </div>
        </details>
      )}

      {/* Usage instructions */}
      <div className="mt-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h3 className="font-display font-semibold text-sm mb-3 text-slate-900 dark:text-slate-100">Usage</h3>
        <div className="space-y-2 text-xs font-mono text-slate-600 dark:text-slate-400">
          <p>
            <span className="text-brand-600 dark:text-brand-400">pfSense:</span> Add the URL as an Alias of type URL
            (URL Alias) in Firewall → Aliases.
          </p>
          <p>
            <span className="text-brand-600 dark:text-brand-400">iptables:</span> Run{' '}
            <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
              chmod +x blocklist-iptables.sh &amp;&amp; sudo ./blocklist-iptables.sh
            </code>
          </p>
          <p>
            <span className="text-brand-600 dark:text-brand-400">Suricata:</span> Place the rules file in{' '}
            <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/etc/suricata/rules/</code> and add it
            to your suricata.yaml.
          </p>
          <p className="text-[10px] text-slate-400 mt-2">
            API endpoints:{' '}
            <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/api/v1/blocklists/pfsense</code>,{' '}
            <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/api/v1/blocklists/iptables</code>,{' '}
            <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">/api/v1/blocklists/suricata</code>
          </p>
        </div>
      </div>
    </div>
  );
}

function FormatPreview({ label, url, maxLines }: { label: string; url: string; maxLines: number }): JSX.Element {
  const [preview, setPreview] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!show) return;
    fetch(url)
      .then((r) => r.text())
      .then((t) =>
        setPreview(t.split('\n').slice(0, maxLines).join('\n') + (t.split('\n').length > maxLines ? '\n…' : ''))
      )
      .catch(() => setPreview('(failed to fetch)'));
  }, [show, url, maxLines]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="text-xs font-mono text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-1"
      >
        {show ? '▼' : '▶'} {label}
      </button>
      {show && preview && (
        <pre className="text-[10px] font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 rounded p-2 overflow-x-auto border border-slate-200 dark:border-slate-800">
          {preview}
        </pre>
      )}
    </div>
  );
}
