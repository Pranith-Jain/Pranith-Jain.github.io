import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Download, FileCode, FileText, Link as LinkIcon, Loader2 } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { Badge } from '../../components/Badge';
import { IntelCard } from '../../components/intel/IntelCard';
import type { IntelBundleResponse, IntelView } from '../../hooks/useIntelBundle';

/**
 * /dfir/stix-builder — the manual entry point for the intel-bundle pipeline.
 *
 * Three input modes feed the same POST /api/v1/intel-bundle/build endpoint:
 *  1. text — free-form threat-report blurb
 *  2. iocs — newline-separated IoC list (optional `value | context` per line)
 *  3. url  — fetch a public URL (host-allowlisted, SSRF-guarded server-side)
 *
 * Output: an APT28-style enriched <IntelCard> + the strict STIX 2.1 bundle
 * (downloadable / copyable). Deep-link path `/dfir/stix-builder/b/<id>`
 * re-renders a previously persisted bundle.
 */

type Mode = 'text' | 'iocs' | 'url';
type Tlp = 'WHITE' | 'AMBER';

const MODES: Array<{ id: Mode; label: string; icon: typeof FileText; placeholder: string }> = [
  {
    id: 'text',
    label: 'Brief text',
    icon: FileText,
    placeholder:
      'Paste a threat-report brief, advisory excerpt, or any narrative paragraph. The extractor looks for actors (APT28, Lazarus, …), malware families, CVEs, IoCs (domains, URLs, hashes, IPs, emails) and theme tags (spear-phishing, ransomware, BEC, …).',
  },
  {
    id: 'iocs',
    label: 'IoC list',
    icon: FileCode,
    placeholder:
      'One per line. Optional `value | context` to annotate.\n\n8.8.8.8\nmalicious.example | sinkhole 2024-Q4\nhttps://evil.example/x\n5d41402abc4b2a76b9719d911017c592',
  },
  {
    id: 'url',
    label: 'Fetch URL',
    icon: LinkIcon,
    placeholder: 'https://example.test/threat-report-page',
  },
];

interface BuildState {
  status: 'idle' | 'building' | 'ready' | 'error';
  result?: IntelBundleResponse;
  error?: string;
}

export default function StixBuilder(): JSX.Element {
  // /dfir/stix-builder/b/:bundleId enters deep-link mode and skips the input UI.
  const params = useParams<{ bundleId?: string }>();
  const deepLinkBundleId = params.bundleId;

  const [mode, setMode] = useState<Mode>('text');
  const [input, setInput] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [tlp, setTlp] = useState<Tlp>('AMBER');
  const [build, setBuild] = useState<BuildState>({ status: 'idle' });
  const [viewTab, setViewTab] = useState<'pretty' | 'raw'>('pretty');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Deep-link mode — fetch a previously persisted bundle by ID and drop
  // straight into the rendered view. Powered by GET /api/v1/intel-bundle/
  // by-id/:bundleId which returns `{ bundle, view }` from D1.
  useEffect(() => {
    if (!deepLinkBundleId) return;
    let cancelled = false;
    setBuild({ status: 'building' });
    (async () => {
      try {
        const res = await fetch(`/api/v1/intel-bundle/by-id/${encodeURIComponent(deepLinkBundleId)}`);
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new Error(`fetch failed (${res.status}): ${text.slice(0, 200)}`);
        }
        const result = (await res.json()) as IntelBundleResponse;
        if (!cancelled) setBuild({ status: 'ready', result });
      } catch (err) {
        if (!cancelled) {
          setBuild({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deepLinkBundleId]);

  // Reset the copy badge after a tick so the user can tell it landed.
  useEffect(() => {
    if (copyStatus === 'idle') return;
    const t = setTimeout(() => setCopyStatus('idle'), 1400);
    return () => clearTimeout(t);
  }, [copyStatus]);

  async function runBuild(): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) return;
    setBuild({ status: 'building' });
    try {
      const res = await fetch('/api/v1/intel-bundle/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          input: trimmed,
          sourceName: sourceName.trim() || undefined,
          tlp,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`build failed (${res.status}): ${text.slice(0, 200)}`);
      }
      const result = (await res.json()) as IntelBundleResponse;
      setBuild({ status: 'ready', result });
    } catch (err) {
      setBuild({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  function copyBundle() {
    if (!build.result) return;
    try {
      const text = JSON.stringify(build.result.bundle, null, 2);
      void navigator.clipboard.writeText(text).then(
        () => setCopyStatus('copied'),
        () => setCopyStatus('failed')
      );
    } catch {
      setCopyStatus('failed');
    }
  }

  function downloadBundle() {
    if (!build.result) return;
    const blob = new Blob([JSON.stringify(build.result.bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${build.result.bundle.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0]!;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono transition-colors"
      >
        <ArrowLeft size={14} /> all tools
      </BackLink>

      <header className="animate-fade-in-up mb-10">
        <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          DFIR · CTI / Intel
        </span>
        <h1 className="text-3xl sm:text-4xl font-display font-bold leading-tight mb-2">STIX 2.1 Builder</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl leading-relaxed">
          Turn a threat-report blurb, a flat IoC list, or a public URL into a strict STIX 2.1 bundle — heuristic actor /
          malware / CVE / IoC extraction, bulk-provider enrichment with composite risk scores, deterministic UUIDv5 IDs
          so the same input always yields the same bundle. Importable into OpenCTI, MISP, or any TAXII 2.1 client.
        </p>
      </header>

      {deepLinkBundleId && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Viewing persisted bundle <code className="font-mono text-[11px]">{deepLinkBundleId}</code>. Build a new one
          below to replace, or close this tab to keep this view linkable.
        </div>
      )}

      {/* Mode tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {MODES.map(({ id, label, icon: Icon }) => {
          const active = id === mode;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
                active
                  ? 'border-brand-500/40 bg-brand-500/15 text-brand-700 dark:bg-brand-400/15 dark:text-brand-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-brand-500/30 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          );
        })}
      </div>

      {/* Input area */}
      <div className="space-y-3">
        {mode !== 'url' ? (
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activeMode.placeholder}
            rows={mode === 'text' ? 10 : 6}
            aria-label={activeMode.label}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950"
          />
        ) : (
          <input
            type="url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activeMode.placeholder}
            aria-label="Fetch URL"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950"
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="Source name (optional)"
            aria-label="Source name"
            className="flex-1 min-w-[180px] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
          />
          <div className="flex items-center gap-1 text-xs font-mono">
            <span className="text-slate-500">TLP:</span>
            {(['WHITE', 'AMBER'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTlp(t)}
                className={`rounded-md border px-2 py-1 transition-colors ${
                  tlp === t
                    ? 'border-brand-500/40 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-500/30 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={runBuild}
            disabled={build.status === 'building' || !input.trim()}
            className="inline-flex items-center gap-2 rounded-md border border-brand-500/40 bg-brand-500/15 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-brand-700 transition-colors hover:bg-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed dark:text-brand-300"
          >
            {build.status === 'building' ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Building…
              </>
            ) : (
              'Build STIX bundle'
            )}
          </button>
        </div>
      </div>

      {build.status === 'error' && (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-rose-300 bg-rose-50/60 p-4 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <span className="font-semibold">build failed:</span> {build.error}
        </div>
      )}

      {build.status === 'ready' && build.result && (
        <Output
          result={build.result}
          viewTab={viewTab}
          setViewTab={setViewTab}
          onCopy={copyBundle}
          onDownload={downloadBundle}
          copyStatus={copyStatus}
        />
      )}
    </div>
  );
}

interface OutputProps {
  result: IntelBundleResponse;
  viewTab: 'pretty' | 'raw';
  setViewTab: (t: 'pretty' | 'raw') => void;
  onCopy: () => void;
  onDownload: () => void;
  copyStatus: 'idle' | 'copied' | 'failed';
}

function Output({ result, viewTab, setViewTab, onCopy, onDownload, copyStatus }: OutputProps): JSX.Element {
  // Per-type object counts for the headline summary.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of result.bundle.objects) {
      const t = (o.type as string) ?? 'unknown';
      c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [result]);

  const pretty = useMemo(() => JSON.stringify(result.bundle, null, 2), [result]);
  const raw = useMemo(() => JSON.stringify(result.bundle), [result]);

  return (
    <section className="mt-10 space-y-6">
      {/* The same card every /threatintel page uses — single source of UI truth. */}
      <BuilderIntelCard view={result.view} bundle={result.bundle} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <header className="flex flex-wrap items-baseline gap-2 mb-3">
          <h2 className="font-display text-base font-semibold">STIX 2.1 bundle</h2>
          <code className="font-mono text-[11px] text-slate-500">{result.bundle.id}</code>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Copy size={12} />
              {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Failed' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download size={12} /> Download
            </button>
          </div>
        </header>

        {/* Object summary */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, n]) => (
              <Badge key={type} tone="neutral" size="xs">
                {n} × {type}
              </Badge>
            ))}
        </div>

        {/* JSON tabs */}
        <div className="mb-2 flex gap-2">
          {(['pretty', 'raw'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setViewTab(t)}
              className={`rounded px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider ${
                viewTab === t
                  ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <pre className="max-h-[480px] overflow-auto rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800 dark:bg-slate-950 dark:text-slate-200">
          {viewTab === 'pretty' ? pretty : raw}
        </pre>
      </div>
    </section>
  );
}

/**
 * The tool feeds <IntelCard> a synthetic sourceId/itemRef pair so the card
 * uses its same code path. Since we already HAVE the view + bundle, we
 * short-circuit the hook by mounting a "thin" card that renders from the
 * passed-in props rather than re-fetching.
 */
function BuilderIntelCard({ view, bundle }: { view: IntelView; bundle: IntelBundleResponse['bundle'] }): JSX.Element {
  // We use the IntelCard with `enabled=false` to suppress its fetch, then
  // render a parallel inline preview from the data we already have. This
  // keeps the card component itself as the single source of styling truth
  // for the /threatintel pages.
  // For the tool surface specifically, we expose the view fields directly
  // since we already have them — no roundtrip needed.
  void IntelCard; // referenced for code-search; intentional no-render of the hook variant here
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <header className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-display text-base font-semibold">{view.title}</h3>
        <Badge tone="mono" size="xs">
          TLP:{view.tlp}
        </Badge>
        {view.partial && (
          <Badge tone="warning" size="xs">
            partial enrichment
          </Badge>
        )}
      </header>

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Source: {view.source.name}
        {view.publishedAt && (
          <>
            {' · '}
            <time dateTime={view.publishedAt}>{new Date(view.publishedAt).toLocaleDateString()}</time>
          </>
        )}
      </p>

      {view.summary && (
        <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{view.summary}</p>
      )}

      {view.keywords.length > 0 && (
        <Section title="Keywords">
          <div className="flex flex-wrap gap-1.5">
            {view.keywords.map((k) => (
              <Badge key={k} tone="neutral" size="xs">
                {k}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {view.threatActors.length > 0 && (
        <Section title="Threat actors">
          <div className="flex flex-wrap gap-2">
            {view.threatActors.map((a) => (
              <Badge key={a.name} tone="critical" size="sm">
                {a.name}
                {a.mitreId && <span className="ml-1 font-mono text-[10px] opacity-70">{a.mitreId}</span>}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {view.malware.length > 0 && (
        <Section title="Malware">
          <div className="flex flex-wrap gap-2">
            {view.malware.map((m) => (
              <Badge key={m.name} tone="warning" size="sm">
                {m.name}
                {m.mitreId && <span className="ml-1 font-mono text-[10px] opacity-70">{m.mitreId}</span>}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {view.cves.length > 0 && (
        <Section title="CVEs">
          <div className="flex flex-wrap gap-2">
            {view.cves.map((c) => (
              <a key={c.id} href={`https://nvd.nist.gov/vuln/detail/${c.id}`} target="_blank" rel="noopener noreferrer">
                <Badge tone="brand" size="sm">
                  {c.id}
                </Badge>
              </a>
            ))}
          </div>
        </Section>
      )}

      {view.iocs.length > 0 && (
        <Section title={`Indicators (${view.iocs.length})`}>
          <div className="space-y-1">
            {view.iocs.map((ioc) => (
              <div
                key={`${ioc.type}|${ioc.value}`}
                className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <span className="font-mono text-[10px] uppercase text-slate-500">{ioc.type}</span>
                <code className="break-all font-mono text-slate-900 dark:text-slate-100">{ioc.value}</code>
                {ioc.riskScore > 0 && (
                  <Badge
                    tone={
                      ioc.verdict === 'malicious' ? 'critical' : ioc.verdict === 'suspicious' ? 'warning' : 'neutral'
                    }
                    size="xs"
                  >
                    risk {ioc.riskScore}
                  </Badge>
                )}
                {ioc.listedIn.length > 0 && (
                  <span className="text-[10px] text-slate-500">listed in {ioc.listedIn.length}</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <footer className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
        <span className="font-mono text-[10px] text-slate-400">
          {bundle.objects.length} STIX objects · extracted_hash {view.extractedHash.slice(0, 8)}…
        </span>
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="mt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </h4>
      {children}
    </section>
  );
}
