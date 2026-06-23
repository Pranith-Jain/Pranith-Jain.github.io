import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getJson } from './adminApi';

/**
 * Inspect the LLM-enrichment slice of a persisted intel-bundle row.
 *
 * Hits GET /api/v1/admin/intel-bundle/:source/:ref behind the X-Admin-Token
 * gate so an operator can verify the cron warmer is landing LLM data on
 * specific briefings (or any other source/ref pair). Sectors / affected
 * products / attack patterns / candidate actors+malware are rendered with
 * counts; `ran:false` means the warmer hasn't built that slug yet (or it
 * was built on the on-demand path which is regex-only).
 */

interface InspectShape {
  source: { id: string; name: string };
  title: string;
  bundleId: string;
  reportId: string;
  generatedAt: string;
  extractedHash: string;
  counts: { iocs: number; threatActors: number; malware: number; cves: number };
  sectors: string[];
  affectedProducts: { vendor: string; product: string }[];
  attackPatterns: { name: string; mitreId: string }[];
  actorCandidates: { name: string; rationale: string }[];
  malwareCandidates: { name: string; rationale: string }[];
  llmEnrichment: { ran: boolean; partial: boolean; modelUsed?: string };
}

const SOURCE_PRESETS = [
  { label: 'briefings', value: 'briefings', hint: 'Daily / weekly briefing slug (e.g. daily-2026-05-22)' },
  { label: 'telegram:*', value: 'telegram:', hint: 'Append the channel handle' },
  { label: 'reddit:*', value: 'reddit:', hint: 'Append the subreddit' },
  { label: 'rss:*', value: 'rss:', hint: 'Append the host (e.g. unit42.com)' },
  { label: 'darkweb:*', value: 'darkweb:', hint: 'Append the dark-web source' },
  { label: 'tool', value: 'tool', hint: 'Manual builds from /dfir/stix-builder' },
];

export default function IntelBundleTab() {
  const [source, setSource] = useState('briefings');
  const [ref, setRef] = useState('');
  const [data, setData] = useState<InspectShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function inspect() {
    if (!source.trim() || !ref.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const out = await getJson<InspectShape>(
        `/intel-bundle/${encodeURIComponent(source.trim())}/${encodeURIComponent(ref.trim())}`
      );
      setData(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          Inspect a persisted bundle
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr_auto] gap-2 mb-2">
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="source (e.g. briefings)"
            list="intel-source-presets"
            className="px-3 py-2 rounded bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-sm font-mono"
          />
          <datalist id="intel-source-presets">
            {SOURCE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.hint}
              </option>
            ))}
          </datalist>
          <input
            type="text"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void inspect();
            }}
            placeholder="item ref / slug (e.g. daily-2026-05-22)"
            className="px-3 py-2 rounded bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-sm font-mono"
          />
          <button
            onClick={() => void inspect()}
            disabled={loading || !source.trim() || !ref.trim()}
            className="px-4 py-2 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-50"
          >
            {loading ? 'Inspecting…' : 'Inspect'}
          </button>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-500 font-mono">
          GET /api/v1/admin/intel-bundle/&lt;source&gt;/&lt;ref&gt;
        </p>
        {error && (
          <p className="mt-3 text-xs font-mono text-rose-400 break-all">
            error: {error}
            {error.includes('not_found') && (
              <span className="block mt-1 text-slate-600 dark:text-slate-500">
                No persisted row for that (source, ref). The warmer may not have run yet — wait for the top of the next
                hour or check `wrangler tail` for the `intel-bundle-warm` log line.
              </span>
            )}
          </p>
        )}
      </div>

      {data && <Result data={data} />}
    </div>
  );
}

function Result({ data }: { data: InspectShape }) {
  const llm = data.llmEnrichment;
  const llmBadge = llm.ran
    ? llm.partial
      ? { label: 'LLM partial', tone: 'bg-amber-100 dark:bg-amber-500/15 text-amber-300 border-amber-700/40' }
      : {
          label: `LLM ran${llm.modelUsed ? ` · ${llm.modelUsed}` : ''}`,
          tone: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-300 border-emerald-700/40',
        }
    : {
        label: 'LLM skipped',
        tone: 'bg-slate-100 dark:bg-slate-700/30 text-slate-500 dark:text-slate-400 border-slate-700/40',
      };

  return (
    <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-semibold">{data.title}</h3>
          <p className="text-xs text-slate-600 dark:text-slate-500 font-mono mt-1">
            {data.source.name} · {data.generatedAt && new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
        <span className={`text-mini font-mono px-2 py-0.5 rounded border ${llmBadge.tone}`}>{llmBadge.label}</span>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {[
          { label: 'IoCs', value: data.counts.iocs },
          { label: 'Threat actors', value: data.counts.threatActors },
          { label: 'Malware', value: data.counts.malware },
          { label: 'CVEs', value: data.counts.cves },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] px-3 py-2"
          >
            <div className="text-slate-600 dark:text-slate-500 text-micro uppercase tracking-wider">{c.label}</div>
            <div className="text-lg font-mono">{c.value}</div>
          </div>
        ))}
      </div>

      <Block title={`Sectors (${data.sectors.length})`}>
        {data.sectors.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.sectors.map((s) => (
              <span
                key={s}
                className="text-mini font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </Block>

      <Block title={`Affected products (${data.affectedProducts.length})`}>
        {data.affectedProducts.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">—</p>
        ) : (
          <ul className="space-y-1 text-xs font-mono">
            {data.affectedProducts.map((p) => (
              <li key={`${p.vendor}|${p.product}`}>
                <span className="text-slate-600 dark:text-slate-500">{p.vendor}</span> · {p.product}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={`Attack patterns (${data.attackPatterns.length})`}>
        {data.attackPatterns.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.attackPatterns.map((a) => (
              <a
                key={a.mitreId}
                href={`https://attack.mitre.org/techniques/${a.mitreId.replace('.', '/')}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mini font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
              >
                {a.name} · {a.mitreId}
              </a>
            ))}
          </div>
        )}
      </Block>

      <Block title={`Candidate actors (${data.actorCandidates.length})`}>
        {data.actorCandidates.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">—</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {data.actorCandidates.map((c) => (
              <li key={c.name}>
                <span className="font-mono">{c.name}</span>
                {c.rationale && <span className="text-slate-600 dark:text-slate-500"> — {c.rationale}</span>}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={`Candidate malware (${data.malwareCandidates.length})`}>
        {data.malwareCandidates.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">—</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {data.malwareCandidates.map((c) => (
              <li key={c.name}>
                <span className="font-mono">{c.name}</span>
                {c.rationale && <span className="text-slate-600 dark:text-slate-500"> — {c.rationale}</span>}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <footer className="flex flex-wrap items-center gap-3 text-mini font-mono text-slate-600 dark:text-slate-500 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
        <span>bundle: {data.bundleId.slice(0, 24)}…</span>
        <span>hash: {data.extractedHash.slice(0, 12)}…</span>
        <Link
          to={`/dfir/stix-builder/b/${encodeURIComponent(data.bundleId)}`}
          target="_blank"
          rel="noopener"
          className="ml-auto px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
        >
          Open in STIX Builder ↗
        </Link>
        <a
          href={`/api/v1/intel-bundle/${encodeURIComponent(data.bundleId)}/export.stix.json`}
          download={`${data.bundleId}.stix.json`}
          rel="noopener"
          className="px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
        >
          Download STIX
        </a>
      </footer>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-mini uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-2">{title}</h4>
      {children}
    </section>
  );
}
