/**
 * Google PageSpeed Insights v5 client. PSI runs Lighthouse server-side
 * against any public URL and returns the four Lighthouse category scores
 * (performance / accessibility / best-practices / SEO) plus Core Web
 * Vitals lab data plus — when the URL has enough traffic to be in the
 * Chrome User Experience Report (CrUX) — field data from real users.
 *
 * Free tier: 25,000 requests/day per API key. Without a key the limit is
 * 1 query per second, which is enough for the daily cron in this repo
 * (6 URLs × 2 strategies = 12 requests at 1s intervals).
 *
 * Pure module — only depends on `fetch`. Tests stub fetch via
 * `vi.stubGlobal('fetch', …)`.
 */

export type PsiStrategy = 'mobile' | 'desktop';

export interface PsiResult {
  url: string;
  strategy: PsiStrategy;
  fetched_at: string;
  /** Lighthouse category scores (0-1). All four are always present in a
   *  successful PSI run; one or more may be undefined if the run errored
   *  (`error` will carry the reason). */
  scores: {
    performance?: number;
    accessibility?: number;
    best_practices?: number;
    seo?: number;
  };
  /** Lab CWV — Lighthouse-emulated single load, ms / unitless. Always
   *  populated when the run succeeds. */
  lab: {
    lcp_ms?: number;
    /** Total Blocking Time — proxy for interactivity in synthetic runs. */
    tbt_ms?: number;
    cls?: number;
    /** First Contentful Paint — secondary timing. */
    fcp_ms?: number;
    /** Speed Index — visual progress proxy. */
    speed_index_ms?: number;
  };
  /** Field CWV from CrUX — real-user data over 28-day window. Undefined
   *  fields when the URL doesn't have CrUX data (low-traffic page). */
  field?: {
    lcp_ms?: number;
    inp_ms?: number;
    cls?: number;
    /** CrUX "category" labels: FAST / AVERAGE / SLOW. */
    lcp_category?: string;
    inp_category?: string;
    cls_category?: string;
  };
  error?: string;
}

/** Subset of the PSI response we actually read. The full shape is huge
 *  (every audit, every timeline screenshot) — we only need the four
 *  category scores and a handful of audits. */
interface PsiResponse {
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number; category?: string }>;
  };
  lighthouseResult?: {
    categories?: Record<string, { score?: number }>;
    audits?: Record<string, { numericValue?: number }>;
  };
}

/**
 * Fetch one PSI result for a single URL + strategy combination. The PSI
 * call typically takes 15-30s — well within the Worker subrequest budget
 * but worth knowing when planning the daily cron's wall time.
 *
 * Errors degrade gracefully: a network failure / non-200 returns a
 * result with `error` set and empty scores, rather than throwing. The
 * runner can then decide whether to retry or persist the partial.
 */
export async function fetchPsi(
  url: string,
  strategy: PsiStrategy,
  options: { apiKey?: string; signal?: AbortSignal } = {}
): Promise<PsiResult> {
  const params = new URLSearchParams();
  params.set('url', url);
  params.set('strategy', strategy);
  params.append('category', 'performance');
  params.append('category', 'accessibility');
  params.append('category', 'best-practices');
  params.append('category', 'seo');
  if (options.apiKey) params.set('key', options.apiKey);

  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`;

  const out: PsiResult = {
    url,
    strategy,
    fetched_at: new Date().toISOString(),
    scores: {},
    lab: {},
  };

  try {
    const r = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      signal: options.signal,
    });
    if (!r.ok) {
      out.error = `psi http ${r.status}`;
      return out;
    }
    const j = (await r.json()) as PsiResponse;
    const cats = j.lighthouseResult?.categories ?? {};
    out.scores = {
      performance: cats.performance?.score ?? undefined,
      accessibility: cats.accessibility?.score ?? undefined,
      best_practices: cats['best-practices']?.score ?? undefined,
      seo: cats.seo?.score ?? undefined,
    };
    const audits = j.lighthouseResult?.audits ?? {};
    out.lab = {
      lcp_ms: audits['largest-contentful-paint']?.numericValue,
      tbt_ms: audits['total-blocking-time']?.numericValue,
      cls: audits['cumulative-layout-shift']?.numericValue,
      fcp_ms: audits['first-contentful-paint']?.numericValue,
      speed_index_ms: audits['speed-index']?.numericValue,
    };
    const fieldMetrics = j.loadingExperience?.metrics;
    if (fieldMetrics && Object.keys(fieldMetrics).length > 0) {
      out.field = {
        lcp_ms: fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
        inp_ms: fieldMetrics.INTERACTION_TO_NEXT_PAINT?.percentile,
        cls: fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile,
        lcp_category: fieldMetrics.LARGEST_CONTENTFUL_PAINT_MS?.category,
        inp_category: fieldMetrics.INTERACTION_TO_NEXT_PAINT?.category,
        cls_category: fieldMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category,
      };
    }
  } catch (e) {
    out.error = `psi fetch: ${e instanceof Error ? e.message : String(e)}`;
  }
  return out;
}

/**
 * Sequentially fetch PSI for a list of (url, strategy) targets. Sequential
 * (not parallel) so the keyless API rate limit (1 qps) isn't tripped. Each
 * target ~20s wall; 12 targets ≈ 4 min — comfortably inside the cron
 * subrequest budget.
 *
 * Results are returned in the same order as the input. Errors per target
 * are captured in the result's `error` field rather than thrown.
 */
export async function fetchPsiBatch(
  targets: Array<{ url: string; strategy: PsiStrategy }>,
  options: { apiKey?: string; signal?: AbortSignal } = {}
): Promise<PsiResult[]> {
  const out: PsiResult[] = [];
  for (const t of targets) {
    out.push(await fetchPsi(t.url, t.strategy, options));
  }
  return out;
}
