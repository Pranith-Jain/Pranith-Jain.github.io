/**
 * DfirConsole — unified console for the Fleet-parity acquisition stack
 * (Phases 1–3): endpoint collection via Velociraptor, sample detonation,
 * detection-rule validation/conversion, and deterministic observable
 * extraction. Same-origin fetches; every panel degrades visibly when the
 * backing provider is unconfigured.
 */
import { useCallback, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { MonitorSmartphone, FlaskConical, FileCheck2, Search, Loader2, Play, RefreshCw, Upload } from 'lucide-react';

type Tab = 'endpoints' | 'samples' | 'rules' | 'observables';
type J = Record<string, unknown>;

async function post<T = J>(path: string, body?: J): Promise<{ ok: boolean; data: T | null; error: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as T;
    if (!res.ok)
      return {
        ok: false,
        data: null,
        error:
          (data as { error?: string; message?: string }).error ??
          (data as { message?: string }).message ??
          `HTTP ${res.status}`,
      };
    return { ok: true, data, error: '' };
  } catch (e) {
    return { ok: false, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

const TABS: Array<{ id: Tab; label: string; icon: typeof MonitorSmartphone }> = [
  { id: 'endpoints', label: 'Endpoints', icon: MonitorSmartphone },
  { id: 'samples', label: 'Detonation', icon: FlaskConical },
  { id: 'rules', label: 'Rules', icon: FileCheck2 },
  { id: 'observables', label: 'Observables', icon: Search },
];

function ErrorBox({ msg }: { msg: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 px-4 py-2 text-sm text-rose-700 dark:text-rose-300">
      {msg}
    </div>
  );
}

// ── Endpoints tab ───────────────────────────────────────────────────────────

interface VeloClient {
  client_id?: string;
  hostname?: string;
  os?: string;
  arch?: string;
  lastSeen?: string;
  labels?: string[];
}
interface VeloFlow {
  flow_id?: string;
  artifacts?: string[];
  state?: string;
  created?: string;
}

function EndpointsTab(): JSX.Element {
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState<VeloClient[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<VeloClient | null>(null);
  const [flows, setFlows] = useState<VeloFlow[]>([]);
  const [artifactInput, setArtifactInput] = useState('Windows.Sysinternals.Autoruns');
  const [collectMsg, setCollectMsg] = useState('');

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError('');
    const r = await post<{ configured: boolean; clients?: VeloClient[]; hint?: string }>(
      '/api/v1/velociraptor/clients',
      search ? { search } : {}
    );
    setLoading(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setConfigured(Boolean(r.data?.configured));
    setClients(r.data?.clients ?? []);
    if (!r.data?.configured) setError(r.data?.hint ?? 'Velociraptor not configured');
  }, [search]);

  const loadFlows = useCallback(async (clientId: string) => {
    setFlows([]);
    const r = await post<{ flows?: VeloFlow[] }>('/api/v1/velociraptor/flows', { client_id: clientId });
    if (r.ok) setFlows(r.data?.flows ?? []);
  }, []);

  const collect = useCallback(async () => {
    if (!selected) return;
    setCollectMsg('');
    const r = await post<{ flowId?: string; state?: string; hint?: string }>('/api/v1/velociraptor/collect', {
      client_id: selected.client_id,
      artifacts: artifactInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      urgent: true,
    });
    setCollectMsg(
      r.ok
        ? `Collection launched — flow ${String(r.data?.flowId ?? '')} (${String(r.data?.state ?? '')})`
        : `Failed: ${r.error}`
    );
    if (r.ok && selected.client_id) void loadFlows(selected.client_id);
  }, [selected, artifactInput, loadFlows]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadClients()}
          placeholder="hostname or client id…"
          className="flex-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-3 py-1.5 font-mono text-sm"
        />
        <button
          onClick={loadClients}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} List
        </button>
      </div>
      {error && <ErrorBox msg={error} />}
      {configured === false && !error && (
        <ErrorBox msg="Set VELO_API_URL (+ token/creds) to enable endpoint acquisition" />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          {clients.map((c) => (
            <button
              key={c.client_id}
              onClick={() => {
                setSelected(c);
                void loadFlows(c.client_id ?? '');
              }}
              className={`w-full rounded border px-3 py-2 text-left text-sm ${
                selected?.client_id === c.client_id
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                  : 'border-line-1 hover:border-indigo-300'
              }`}
            >
              <div className="font-mono">{c.hostname ?? c.client_id}</div>
              <div className="text-xs text-slate-500">
                {c.os} · {c.arch} · seen {c.lastSeen?.slice(0, 10) ?? '?'}
              </div>
              {(c.labels?.length ?? 0) > 0 && (
                <div className="mt-0.5 flex gap-1">
                  {c.labels!.slice(0, 4).map((l) => (
                    <span
                      key={l}
                      className="rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] px-1 text-[10px] font-mono"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>

        {selected && (
          <div className="space-y-3 rounded border border-line-1 p-3">
            <h3 className="font-mono text-sm font-semibold">{selected.hostname ?? selected.client_id}</h3>
            <div className="flex gap-2">
              <input
                value={artifactInput}
                onChange={(e) => setArtifactInput(e.target.value)}
                className="flex-1 rounded border border-line-1 bg-slate-50 dark:bg-[rgb(var(--input-200))] px-2 py-1 font-mono text-xs"
                placeholder="Windows.KapeFiles.Collect, Custom.…"
              />
              <button
                onClick={collect}
                className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
              >
                <Play size={12} /> Collect
              </button>
            </div>
            {collectMsg && <p className="text-xs text-slate-500">{collectMsg}</p>}
            <div>
              <h4 className="mb-1 text-xs font-mono uppercase tracking-wider text-slate-500">Recent collections</h4>
              {flows.length === 0 && <p className="text-xs text-slate-400">none</p>}
              {flows.map((f) => (
                <div
                  key={f.flow_id}
                  className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 py-1 text-xs"
                >
                  <span className="font-mono">{f.flow_id}</span>
                  <span className="truncate px-2 text-slate-500">{(f.artifacts ?? []).join(', ')}</span>
                  <span
                    className={`font-mono ${f.state === 'RUNNING' ? 'text-amber-500' : f.state === 'ERROR' ? 'text-rose-500' : 'text-emerald-600'}`}
                  >
                    {f.state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Detonation tab ──────────────────────────────────────────────────────────

function SamplesTab(): JSX.Element {
  const [b64, setB64] = useState('');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState<J | null>(null);
  const [statusResult, setStatusResult] = useState<J | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useState(() => ({ current: null as HTMLInputElement | null }))[0];

  const onFile = (file: File) => {
    if (file.size > 24 * 1024 * 1024) {
      setError('file too large for browser submission (max ~24MB base64-safe)');
      return;
    }
    setError('');
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () =>
      setB64(btoa(String.fromCharCode(...new Uint8Array(reader.result as ArrayBuffer).subarray(0, 20_000_000))));
    reader.readAsArrayBuffer(file);
  };

  const submit = useCallback(async () => {
    setBusy(true);
    setError('');
    setResult(null);
    setStatusResult(null);
    const r = await post<typeof result>('/api/v1/sample-submission/upload', { dataBase64: b64, filename });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setResult(r.data);
    // auto-poll once after a beat
    const vtId = (r.data?.submitted as Array<Record<string, unknown>> | undefined)?.find(
      (s) => s.provider === 'virustotal'
    )?.analysisId as string | undefined;
    const sha = r.data?.sha256 as string | undefined;
    if (vtId || sha) {
      setTimeout(async () => {
        const sr = await post('/api/v1/sample-submission/status', {
          ...(vtId ? { virustotalAnalysisId: vtId } : {}),
          ...(sha ? { sha256: sha } : {}),
        });
        if (sr.ok) setStatusResult(sr.data);
      }, 4000);
    }
  }, [b64, filename]);

  return (
    <div className="space-y-4">
      <div
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInput.current?.click()}
        className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-6 text-center hover:border-indigo-400"
      >
        <input
          ref={(el) => {
            fileInput.current = el;
          }}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <Upload className="mx-auto mb-2 text-slate-400" size={24} />
        <p className="text-sm text-body">Drop sample (≤24MB) → Hybrid Analysis detonation + VirusTotal scan</p>
        {filename && (
          <p className="mt-1 font-mono text-xs text-slate-500">
            {filename} ({Math.round(b64.length / 1.37 / 1024)}KB)
          </p>
        )}
      </div>
      {error && <ErrorBox msg={error} />}
      <button
        onClick={submit}
        disabled={!b64 || busy}
        className="inline-flex items-center gap-2 rounded bg-rose-600 px-4 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Submit for analysis
      </button>
      {result && (
        <pre className="max-h-72 overflow-auto rounded-lg border border-line-1 p-3 font-mono text-xs whitespace-pre-wrap">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      {statusResult && (
        <>
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <RefreshCw size={11} /> status
          </h4>
          <pre className="max-h-72 overflow-auto rounded-lg border border-line-1 p-3 font-mono text-xs whitespace-pre-wrap">
            {JSON.stringify(statusResult, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

// ── Rules tab ───────────────────────────────────────────────────────────────

const KIND_SAMPLES: Record<'yara' | 'sigma' | 'suricata' | 'osquery', string> = {
  yara: `rule Suspicious_Base64_PS {
  meta:
    author = "analyst"
  strings:
    $ps = "powershell"
    $enc = "-enc"
  condition:
    $ps and $enc
}`,
  sigma: `title: Suspicious PowerShell Encoded Command
status: test
logsource:
  category: process_creation
  product: windows
detection:
  sel_img:
    Image|endswith: '\\powershell.exe'
  sel_cmd:
    CommandLine|contains: '-enc'
  condition: sel_img and sel_cmd
level: high
`,
  suricata: `alert tcp $HOME_NET any -> $EXTERNAL_NET 443 (msg:"TLS SNI evil.com"; content:"evil.com"; tls.sni; sid:1000001; rev:1;)`,
  osquery: `SELECT p.name, p.path, p.cmdline FROM processes p WHERE p.cmdline LIKE '%-enc%';`,
};

function RulesTab(): JSX.Element {
  const [kind, setKind] = useState<'yara' | 'sigma' | 'suricata' | 'osquery'>('sigma');
  const [source, setSource] = useState(KIND_SAMPLES.sigma);
  const [target, setTarget] = useState<'splunk' | 'kql'>('kql');
  const [validation, setValidation] = useState<J | null>(null);
  const [conversion, setConversion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const validate = useCallback(async () => {
    setBusy(true);
    setError('');
    setConversion(null);
    const r = await post<typeof validation>('/api/v1/rules/validate', { kind, source });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setValidation(r.data);
  }, [kind, source]);

  const convert = useCallback(async () => {
    setBusy(true);
    setError('');
    setValidation(null);
    const r = await post<{ query?: string }>('/api/v1/rules/sigma/convert', { yaml: source, target });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setConversion(r.data?.query ?? '');
  }, [source, target]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['yara', 'sigma', 'suricata', 'osquery'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 font-mono text-xs ${kind === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
          >
            {k}
          </button>
        ))}
      </div>
      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder={`paste ${kind} rule…`}
        className="w-full rounded border border-line-1 bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <button
          onClick={validate}
          disabled={!source.trim() || busy}
          className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <FileCheck2 size={13} />} Validate
        </button>
        {kind === 'sigma' && (
          <>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as 'splunk' | 'kql')}
              className="rounded border border-line-1 bg-slate-50 dark:bg-[rgb(var(--input-200))] px-2 text-sm"
            >
              <option value="kql">Sentinel KQL</option>
              <option value="splunk">Splunk SPL</option>
            </select>
            <button
              onClick={convert}
              disabled={!source.trim() || busy}
              className="rounded border border-indigo-300 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-50"
            >
              Convert → {target.toUpperCase()}
            </button>
          </>
        )}
      </div>
      {error && <ErrorBox msg={error} />}
      {validation && (
        <pre className="max-h-64 overflow-auto rounded-lg border border-line-1 p-3 font-mono text-xs whitespace-pre-wrap">
          {JSON.stringify(validation, null, 2)}
        </pre>
      )}
      {conversion !== null && (
        <pre className="overflow-auto rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 font-mono text-xs whitespace-pre-wrap">
          {conversion}
        </pre>
      )}
    </div>
  );
}

// ── Observables tab ─────────────────────────────────────────────────────────

function ObservablesTab(): JSX.Element {
  const [text, setText] = useState('');
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [hits, setHits] = useState<Array<{ type: string; value: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const extract = useCallback(async () => {
    setBusy(true);
    setError('');
    const r = await post<{ counts?: Record<string, number>; observables?: Array<{ type: string; value: string }> }>(
      '/api/v1/observables/extract',
      { text }
    );
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setCounts(r.data?.counts ?? {});
    setHits(r.data?.observables ?? []);
  }, [text]);

  const nonZero = Object.entries(counts ?? {}).filter(([, v]) => v > 0);

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="paste threat report / log lines / defanged IOCs… (hxxp, [.], [at] all handled)"
        className="w-full rounded border border-line-1 bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3 font-mono text-xs"
      />
      <button
        onClick={extract}
        disabled={!text.trim() || busy}
        className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Extract observables
      </button>
      {error && <ErrorBox msg={error} />}
      {counts && (
        <div className="flex flex-wrap gap-1.5">
          {nonZero.length === 0 ? (
            <p className="text-sm text-slate-400">no observables found</p>
          ) : (
            nonZero.map(([k, v]) => (
              <span
                key={k}
                className="rounded bg-violet-100 dark:bg-violet-950/40 px-2 py-0.5 font-mono text-xs text-violet-700 dark:text-violet-300"
              >
                {k}: {v}
              </span>
            ))
          )}
        </div>
      )}
      {hits.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-lg border border-line-1">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-[rgb(var(--surface-100))] font-mono uppercase text-slate-500">
              <tr>
                <th className="px-3 py-1.5">type</th>
                <th className="px-3 py-1.5">value</th>
              </tr>
            </thead>
            <tbody>
              {hits.slice(0, 500).map((h, i) => (
                <tr key={`${h.type}-${h.value}-${i}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-1 font-mono text-slate-500">{h.type}</td>
                  <td className="px-3 py-1 font-mono break-all">{h.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────────────────

export default function DfirConsole() {
  const [tab, setTab] = useState<Tab>('endpoints');
  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<MonitorSmartphone />}
      title="DFIR Console"
      description="Endpoint acquisition (Velociraptor), sample detonation (Hybrid Analysis + VirusTotal), detection-rule validation/conversion, and deterministic observable extraction."
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
              tab === id
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      <div className="surface-card p-4">
        {tab === 'endpoints' && <EndpointsTab />}
        {tab === 'samples' && <SamplesTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'observables' && <ObservablesTab />}
      </div>
    </DataPageLayout>
  );
}
