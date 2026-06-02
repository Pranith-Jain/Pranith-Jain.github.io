import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge } from '../Badge';
import { IocChip } from '../dfir/IocChip';
import { useIntelBundle, type IntelView, type IntelViewIoc, type IocVerdict } from '../../hooks/useIntelBundle';

/**
 * <IntelCard> — generic per-source-item enrichment surface.
 *
 * Drops onto any /threatintel page: the host passes a stable `sourceId`,
 * `itemRef`, and the item's `title`/`body` so the hook can compute on first
 * observation. Renders the STIX 2.1 view (actors / malware / CVEs / IoCs /
 * keywords) and exposes a download link to the strict bundle.
 *
 * While the bundle is being computed (or on error), `fallback` is rendered.
 * This means a page never shows an empty card — the existing row stays
 * visible, the card just "upgrades" it once the data lands.
 */

export interface IntelCardProps {
  sourceId: string;
  itemRef: string;
  /** Used on cache-miss so the route can compute the bundle inline. */
  item: {
    title: string;
    body: string;
    url?: string;
    publishedAt?: string | null;
  };
  /** Rendered while the bundle is loading or on hard error. */
  fallback?: ReactNode;
  /** Override `enabled` (default true). Set false to opt the card out per-item. */
  enabled?: boolean;
  /**
   * If `true`, the card uses IntersectionObserver to defer the fetch until
   * the wrapping element is scrolled into view. Use this on list pages with
   * many items (Telegram, Reddit, RSS) to avoid 50-fetch fan-out on mount.
   */
  lazy?: boolean;
}

const VERDICT_TONE: Record<IocVerdict, 'critical' | 'warning' | 'success' | 'neutral'> = {
  malicious: 'critical',
  suspicious: 'warning',
  clean: 'success',
  unknown: 'neutral',
};

const VERDICT_LABEL: Record<IocVerdict, string> = {
  malicious: 'malicious',
  suspicious: 'suspicious',
  clean: 'clean',
  unknown: '—',
};

function groupBy<T, K extends string>(items: T[], keyOf: (it: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = keyOf(it);
    (out[k] ??= []).push(it);
  }
  return out;
}

function IocBadge({ ioc }: { ioc: IntelViewIoc }): JSX.Element {
  // Compact `value · risk N · listed in K` line. Solid backgrounds (not
  // translucent /60 /40) so monospace text stays crisp over whatever the
  // page background happens to be — translucent surfaces over varying
  // content underneath was what read as "blurry".
  const tone = VERDICT_TONE[ioc.verdict];
  return (
    <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-950">
      <IocChip value={ioc.value} size="sm" bare className="min-w-0" />
      {ioc.riskScore > 0 && (
        <Badge tone={tone} size="xs">
          risk {ioc.riskScore}
        </Badge>
      )}
      {ioc.listedIn.length > 0 && (
        <span className="text-[10px] text-slate-500 dark:text-slate-400">listed in {ioc.listedIn.length}</span>
      )}
      <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-400">
        {VERDICT_LABEL[ioc.verdict]}
      </span>
    </div>
  );
}

/**
 * Server-side export URL. The endpoint returns the persisted STIX 2.1
 * bundle JSON with `application/stix+json` and a `content-disposition`
 * attachment header — analyst tools (MISP/OpenCTI/TAXII clients) sniff
 * on the media type, and the URL is shareable / linkable rather than a
 * one-shot in-memory blob.
 */
function exportBundleUrl(bundleId: string): string {
  return `/api/v1/intel-bundle/${encodeURIComponent(bundleId)}/export.stix.json`;
}

interface CardChromeProps {
  view: IntelView;
  partial: boolean;
}

function CardChrome({ view, partial }: CardChromeProps): JSX.Element {
  // Cards default to collapsed (header + summary only). Counts shown
  // inline as compact pills so analysts can decide whether to expand
  // before paying the cost of reading every section. Keeps long pages
  // (research, briefings) scannable instead of a wall of accordion-
  // less detail.
  const [expanded, setExpanded] = useState(false);
  const iocsByType = groupBy(view.iocs, (i) => i.type);
  const llm = view.llmEnrichment;
  const llmModelTail = llm?.modelUsed ? llm.modelUsed.split(':').pop() : null;

  // Counts for the collapsed-state badges. Cheap to compute; rendered
  // only when > 0 so a card with nothing to expand stays clean.
  const counts = {
    sectors: view.sectors?.length ?? 0,
    actors: view.threatActors.length,
    malware: view.malware.length,
    cves: view.cves.length,
    products: view.affectedProducts?.length ?? 0,
    iocs: view.iocs.length,
    attackPatterns: view.attackPatterns?.length ?? 0,
  };
  const hasAnyDetail =
    counts.sectors +
      counts.actors +
      counts.malware +
      counts.cves +
      counts.products +
      counts.iocs +
      counts.attackPatterns >
    0;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900">
      <header className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">{view.title}</h3>
        <Badge tone="mono" size="xs">
          TLP:{view.tlp}
        </Badge>
        {llm?.ran && (
          <Badge tone="mono" size="xs">
            LLM{llmModelTail ? `: ${llmModelTail}` : ''}
          </Badge>
        )}
        {llm?.partial && (
          <Badge tone="warning" size="xs">
            partial LLM
          </Badge>
        )}
        {partial && (
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

      {hasAnyDetail && !expanded && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {counts.sectors > 0 && <CountPill label="sectors" n={counts.sectors} />}
          {counts.actors > 0 && <CountPill label="actor" n={counts.actors} />}
          {counts.malware > 0 && <CountPill label="malware" n={counts.malware} />}
          {counts.cves > 0 && <CountPill label="CVE" n={counts.cves} />}
          {counts.products > 0 && <CountPill label="product" n={counts.products} />}
          {counts.iocs > 0 && <CountPill label="IOC" n={counts.iocs} />}
          {counts.attackPatterns > 0 && <CountPill label="technique" n={counts.attackPatterns} />}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-expanded={false}
          >
            Show details
          </button>
        </div>
      )}

      {expanded && view.sectors && view.sectors.length > 0 && (
        <Section title="Sectors">
          <div className="flex flex-wrap gap-1.5">
            {view.sectors.map((s) => (
              <span
                key={s}
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              >
                {s}
              </span>
            ))}
          </div>
        </Section>
      )}

      {expanded && view.keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {view.keywords.map((k) => (
            <Badge key={k} tone="neutral" size="xs">
              {k}
            </Badge>
          ))}
        </div>
      )}

      {expanded && view.threatActors.length > 0 && (
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

      {expanded && view.malware.length > 0 && (
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

      {expanded && view.cves.length > 0 && (
        <Section title="CVEs">
          <div className="flex flex-wrap gap-2">
            {view.cves.map((c) => (
              <a
                key={c.id}
                href={`https://nvd.nist.gov/vuln/detail/${c.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Badge tone="brand" size="sm">
                  {c.id}
                </Badge>
              </a>
            ))}
          </div>
        </Section>
      )}

      {expanded && view.attackPatterns && view.attackPatterns.length > 0 && (
        <Section title="Attack patterns">
          <div className="flex flex-wrap gap-1.5">
            {view.attackPatterns.map((a) => (
              <span
                key={a.mitreId}
                className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              >
                {a.name} · {a.mitreId}
              </span>
            ))}
          </div>
        </Section>
      )}

      {expanded && view.affectedProducts && view.affectedProducts.length > 0 && (
        <Section title="Affected products">
          <ul className="space-y-1 text-xs">
            {view.affectedProducts.map((p) => (
              <li key={`${p.vendor}|${p.product}`} className="font-mono text-slate-700 dark:text-slate-300">
                <span className="text-slate-500 dark:text-slate-400">{p.vendor}</span> · {p.product}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {expanded && view.iocs.length > 0 && (
        <Section
          title={`Indicators (${view.iocs.length}${view.iocsOverflow.length ? ` + ${view.iocsOverflow.length} more` : ''})`}
        >
          <div className="space-y-3">
            {(['hash', 'url', 'domain', 'ipv4', 'ipv6', 'email'] as const).map((t) => {
              const list = iocsByType[t];
              if (!list || list.length === 0) return null;
              return (
                <div key={t}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t}
                  </p>
                  <div className="space-y-1">
                    {list.map((ioc) => (
                      <IocBadge key={`${ioc.type}|${ioc.value}`} ioc={ioc} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {expanded && ((view.actorCandidates?.length ?? 0) > 0 || (view.malwareCandidates?.length ?? 0) > 0) && (
        <details className="mt-4 rounded border border-dashed border-slate-300 bg-slate-50/50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
          <summary className="cursor-pointer font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Suggested (unverified, LLM)
          </summary>
          <div className="mt-3 space-y-3">
            {view.actorCandidates && view.actorCandidates.length > 0 && (
              <div>
                <h5 className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Candidate actors
                </h5>
                <ul className="space-y-1">
                  {view.actorCandidates.map((c) => (
                    <li key={c.name}>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{c.name}</span>
                      {c.rationale && <span className="text-slate-500 dark:text-slate-400"> — {c.rationale}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {view.malwareCandidates && view.malwareCandidates.length > 0 && (
              <div>
                <h5 className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Candidate malware
                </h5>
                <ul className="space-y-1">
                  {view.malwareCandidates.map((c) => (
                    <li key={c.name}>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{c.name}</span>
                      {c.rationale && <span className="text-slate-500 dark:text-slate-400"> — {c.rationale}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {expanded && (
        <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
          <a
            href={exportBundleUrl(view.bundleId)}
            // `download` hints at the browser-side filename; the server
            // already sets a matching content-disposition so this is just
            // belt-and-suspenders.
            download={`${view.bundleId}.stix.json`}
            rel="noopener"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Download STIX 2.1
          </a>
          <a
            href={`/dfir/stix-builder/b/${encodeURIComponent(view.bundleId)}`}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Open in STIX Builder
          </a>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-expanded={true}
          >
            Hide details
          </button>
          <span className="ml-auto font-mono text-[10px] text-slate-400 dark:text-slate-400">
            {view.bundleId.slice(0, 18)}…
          </span>
        </footer>
      )}
    </article>
  );
}

function CountPill({ label, n }: { label: string; n: number }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
      <span className="font-semibold text-slate-900 dark:text-slate-100">{n}</span>
      <span>
        {label}
        {n === 1 ? '' : 's'}
      </span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="mt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function IntelCard(props: IntelCardProps): JSX.Element {
  const { lazy = false, enabled = true } = props;

  // Lazy mount: keep `inView` false until IntersectionObserver fires. We then
  // flip it to true permanently — even if the card scrolls out, the bundle
  // stays mounted so the user doesn't pay the fetch twice on flick-scroll.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(!lazy);

  useEffect(() => {
    if (!lazy || inView) return;
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      // SSR or no-IO env — just enable. The fallback covers the gap.
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: '200px 0px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [lazy, inView]);

  const { view, bundle, status } = useIntelBundle({
    sourceId: props.sourceId,
    itemRef: props.itemRef,
    title: props.item.title,
    body: props.item.body,
    publishedAt: props.item.publishedAt ?? undefined,
    enabled: enabled && inView,
  });

  // Stale-while-revalidate: once we have a `view`, keep rendering it even
  // while a follow-up fetch is in flight. Previously a parent re-render
  // that nudged the `body` prop kicked the hook back into 'loading' and
  // the card flipped to fallback (null on the aggregate-card surfaces),
  // which read as "the card faded when I scrolled". The bundle is
  // computed server-side and stable for a given (source, ref) — the
  // refetch is a cache hit, no visual interruption is justified.
  if (view && bundle) {
    return (
      <div ref={wrapRef}>
        <CardChrome view={view} partial={view.partial} />
      </div>
    );
  }

  // First-paint paths: pre-view / loading / enriching → skeleton or
  // caller-supplied fallback. Error or hard miss with no view ever
  // computed → fallback (the page's existing row still carries first
  // paint on the per-item Briefings surface).
  if (!inView || status === 'idle' || status === 'loading' || status === 'enriching') {
    return <div ref={wrapRef}>{props.fallback ?? <CardSkeleton />}</div>;
  }
  return <div ref={wrapRef}>{props.fallback ?? null}</div>;
}

function CardSkeleton(): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    </div>
  );
}
