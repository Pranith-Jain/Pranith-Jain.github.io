import type { Context } from 'hono';
import type { Env } from '../env';
import { computeConfidence, SOURCE_RELIABILITY_REGISTRY, type ConfidenceScore } from '../lib/confidence';
import { readLastGood, writeLastGood } from '../lib/lastgood';
import { FEED_STATUS_CACHE_KEY } from './feed-status';
import { safeNullLog } from '../lib/safe-catch';

// ── Probe coverage map ──────────────────────────────────────────────────
// Mirrors the idMap in feed-status.ts's buildPassiveProbes(). Maps
// active probe IDs to the source IDs they cover so PIR scoring can
// resolve e.g. "phish-tank" freshness through the "phishing-urls" probe.
const PROBE_COVERAGE: Record<string, string[]> = {
  'live-iocs': ['abusech-urlhaus', 'abusech-threatfox', 'abusech-malwarebazaar'],
  'phishing-urls': ['phish-tank', 'openphish'],
  'x-feed': ['x-twitter', 'bluesky'],
  'stealer-forum-intel': ['hudson-rock'],
  'cve-recent': ['nvd', 'cisa-kev'],
};
const COVERED_TO_PROBE: Record<string, string> = {};
for (const [probe, sources] of Object.entries(PROBE_COVERAGE)) {
  for (const src of sources) COVERED_TO_PROBE[src] = probe;
}

export type PirPriority = 'critical' | 'high' | 'medium' | 'low';
export type PirStatus = 'active' | 'paused' | 'completed' | 'archived';
export type PirCategory =
  'ransomware' | 'apt' | 'phishing' | 'vulnerability' | 'supply_chain' | 'insider' | 'sector' | 'general';

export interface Pir {
  id: string;
  title: string;
  description: string;
  category: PirCategory;
  priority: PirPriority;
  status: PirStatus;
  /** The consumer / decision-maker this PIR serves */
  consumer: string;
  /** The decision this PIR informs */
  decision: string;
  /** Key intelligence questions that define what "answered" means */
  kiqs: string[];
  /** Which collectors/data sources are relevant to this PIR */
  relevant_sources: string[];
  /** Manual override — analyst says "this PIR is being addressed" */
  coverage_score: number; // 0–100%
  /** Optional alert threshold — if contributing sources drop below this %, fire an alert */
  min_source_ratio?: number; // 0–100
  /** Desired collection cadence in hours (defaults based on priority) */
  collection_cadence_hours?: number; // 1 = hourly, 24 = daily
  created_at: string;
  updated_at: string;
}

export interface PirAlert {
  id: string;
  pir_id: string;
  pir_title: string;
  type: 'source_degradation' | 'source_total_loss' | 'coverage_drop' | 'freshness_drop';
  severity: 'warning' | 'critical';
  message: string;
  metric_before: number;
  metric_after: number;
  threshold: number;
  triggered_at: string;
  acknowledged: boolean;
}

export interface PirScore {
  pir_id: string;
  pir_title: string;
  confidence: ConfidenceScore;
  /** How much of this PIR's collection surface has fresh data */
  freshness_score: number; // 0–100
  /** How many relevant sources had data in the last 24h */
  sources_contributing_today: number;
  /** Total relevant sources */
  total_relevant_sources: number;
  /** Recent findings that address this PIR */
  recent_findings: string[];
  /** Composite coverage (confidence + freshness) */
  composite_coverage: number; // 0–100
}

const DEFAULT_PIRS: Pir[] = [
  {
    id: 'pir-001',
    title: 'Ransomware threats to EU mid-market finance',
    description:
      'Monitor ransomware groups targeting European financial services (banks, fintech, insurance) — track new victims, TTP changes, leak-site claims.',
    category: 'ransomware',
    priority: 'critical',
    status: 'active',
    consumer: 'CISO — EU finance',
    decision: 'Which ransomware groups pose active risk to our sector; what mitigations to prioritise.',
    kiqs: [
      'Which ransomware groups have claimed EU finance victims in the last 30 days?',
      'What TTPs are these groups using that differ from last quarter?',
      'Which of our vendors/suppliers have been hit?',
    ],
    relevant_sources: ['ransomlook', 'ransomwarelive', 'mythreatintel', 'telegram-feed', 'cisa-kev'],
    coverage_score: 65,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 60,
    collection_cadence_hours: 1,
  },
  {
    id: 'pir-002',
    title: 'APT activity against critical infrastructure',
    description:
      'Track APT groups targeting energy, telecom, and healthcare — intrusion sets, TTP evolution, and sector-specific IOCs.',
    category: 'apt',
    priority: 'critical',
    status: 'active',
    consumer: 'SOC Lead',
    decision: 'Which APT groups are active in our sectors; what detection rules to update.',
    kiqs: [
      'Which APT groups have been attributed to campaigns against critical infra in the last 90 days?',
      'What new TTPs or malware families have been observed?',
      'Are there indicators in our telemetry matching these TTPs?',
    ],
    relevant_sources: ['malpedia', 'ransomlook', 'abusech-threatfox', 'x-twitter', 'otx', 'bluesky'],
    coverage_score: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 50,
    collection_cadence_hours: 3,
  },
  {
    id: 'pir-003',
    title: 'Phishing campaigns targeting executive teams',
    description:
      'Monitor phishing infrastructure targeting C-suite personas — brand impersonation, BEC infrastructure, credential harvesting kits.',
    category: 'phishing',
    priority: 'high',
    status: 'active',
    consumer: 'CISO',
    decision: 'Whether to escalate user-reported phish; which brands to add to blocklist.',
    kiqs: [
      'What brands are being impersonated in current phishing campaigns?',
      'Are there known phishing kits targeting our industry?',
      'What C2 infrastructure is linked to active campaigns?',
    ],
    relevant_sources: [
      'phish-tank',
      'openphish',
      'abusech-urlhaus',
      'abusech-threatfox',
      'certspotter',
      'telegram-feed',
      'abuseipdb',
    ],
    coverage_score: 80,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 50,
    collection_cadence_hours: 3,
  },
  {
    id: 'pir-004',
    title: 'Zero-day and N-day exploitation in the wild',
    description:
      'Track actively exploited vulnerabilities relevant to the tech stack — CISA KEV, ransomware-linked exploits, exploit availability.',
    category: 'vulnerability',
    priority: 'high',
    status: 'active',
    consumer: 'Patch Management Lead',
    decision: 'Which CVEs require out-of-cycle patching vs next maintenance window.',
    kiqs: [
      'Which CVEs have been added to CISA KEV in the last 7 days?',
      'Which of our stack components have active exploits?',
      'Which CVEs are linked to ransomware operations?',
    ],
    relevant_sources: ['cisa-kev', 'nvd', 'ransomlook', 'mythreatintel', 'abusech-threatfox', 'abusech-malwarebazaar'],
    coverage_score: 90,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 70,
    collection_cadence_hours: 3,
  },
  {
    id: 'pir-005',
    title: 'Supply chain compromise indicators',
    description:
      'Monitor for software supply chain attacks — malicious packages, compromised updates, dependency confusion, CI/CD pipeline breaches.',
    category: 'supply_chain',
    priority: 'medium',
    status: 'active',
    consumer: 'AppSec Lead',
    decision: 'Whether to block specific packages/registries; which dependencies to audit.',
    kiqs: [
      'What malicious packages have been published in the last 30 days?',
      'Which registries (npm, PyPI, Maven, Go, Rust) have had the most incidents?',
      'Are any of our direct or transitive dependencies affected?',
    ],
    relevant_sources: ['telegram-feed', 'x-twitter', 'reddit', 'mythreatintel', 'bluesky', 'abusech-urlhaus'],
    coverage_score: 40,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 30,
    collection_cadence_hours: 6,
  },
  {
    id: 'pir-006',
    title: 'Credential theft and infostealer activity',
    description:
      'Monitor stealer log dumps, combolist postings, and credential marketplace activity targeting enterprise credentials.',
    category: 'general',
    priority: 'high',
    status: 'active',
    consumer: 'SOC Lead',
    decision: 'Whether to initiate credential reset campaigns; which domains to monitor for exposed creds.',
    kiqs: [
      'Which infostealer families are currently active in our threat landscape?',
      'Have any employee credentials appeared in recent stealer logs?',
      'Which credential marketplaces are advertising our domains?',
    ],
    relevant_sources: ['telegram-feed', 'x-twitter', 'hudson-rock', 'leak-check', 'xposedornot', 'abuseipdb'],
    coverage_score: 55,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 40,
    collection_cadence_hours: 3,
  },
  {
    id: 'pir-007',
    title: 'Sector-specific breach monitoring',
    description:
      'Monitor HIBP, breach disclosure feeds, and dark web postings for breaches affecting the tech sector — SaaS providers, cloud infra, dev tools.',
    category: 'sector',
    priority: 'medium',
    status: 'active',
    consumer: 'AppSec Lead',
    decision: 'Which third-party SaaS vendors to review; whether incident response plans need updating.',
    kiqs: [
      'Which of our vendors have experienced a breach in the last 90 days?',
      'What data classes were exposed in recent tech-sector breaches?',
      'Are there remediation requirements from recent supply chain incidents?',
    ],
    relevant_sources: ['telegram-feed', 'mythreatintel', 'reddit', 'x-twitter', 'bluesky'],
    coverage_score: 45,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 30,
    collection_cadence_hours: 6,
  },
  {
    id: 'pir-008',
    title: 'Insider threat behavioral indicators',
    description:
      'Monitor for insider threat precursors — unusual access patterns, data exfiltration chatter, market intelligence on potential exits.',
    category: 'insider',
    priority: 'low',
    status: 'paused',
    consumer: 'HR & Legal Lead',
    decision: 'Whether to escalate employee monitoring or initiate investigation.',
    kiqs: [
      'Are there known insider threat marketplaces advertising sensitive data?',
      'What are the common behavioral precursors to insider incidents?',
      'Which sectors have seen the most insider-driven breaches this quarter?',
    ],
    relevant_sources: ['telegram-feed', 'reddit', 'x-twitter', 'otx', 'certspotter'],
    coverage_score: 30,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 20,
    collection_cadence_hours: 24,
  },
  {
    id: 'pir-009',
    title: 'Emerging AI/ML threat landscape',
    description:
      'Monitor AI-specific threats — model poisoning, prompt injection, adversarial ML, AI supply chain risks, and LLM jailbreak marketplaces.',
    category: 'general',
    priority: 'medium',
    status: 'active',
    consumer: 'AI Security Lead',
    decision: 'Which AI security controls to prioritise; which threat models to update.',
    kiqs: [
      'What AI-specific vulnerabilities have been disclosed in the last 30 days?',
      'Are there known prompt injection attack kits being traded?',
      'Which AI/ML platforms have reported security incidents?',
    ],
    relevant_sources: ['x-twitter', 'reddit', 'telegram-feed', 'nvd', 'abusech-threatfox'],
    coverage_score: 25,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 25,
    collection_cadence_hours: 8,
  },
  {
    id: 'pir-010',
    title: 'Telegram-based IOC intelligence',
    description:
      'Crawl and index Telegram channels for real-time IOC drops — stealer logs, C2 IPs, phishing URLs, malware hashes, and leak announcements.',
    category: 'general',
    priority: 'critical',
    status: 'active',
    consumer: 'Threat Intel Team',
    decision: 'Which IOCs to prioritise for blocklist update; which channels have the highest signal-to-noise.',
    kiqs: [
      'What new C2 infrastructure has been advertised in the last 12 hours?',
      'Which Telegram channels are the most reliable IOC sources?',
      'What IOCs need to be operationalised immediately?',
    ],
    relevant_sources: ['telegram-feed', 'telegram-leak-monitor', 'x-twitter', 'abusech-threatfox'],
    coverage_score: 55,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    min_source_ratio: 80,
    collection_cadence_hours: 1,
  },
];

const LASTGOOD_KEY = 'pirs';
const PIR_REQUEST_CACHE_TTL_MS = 5_000;

// ── Request-scoped cache ─────────────────────────────────────────────────
// Avoids redundant KV reads when multiple PIR handlers fire in the same
// request. Uses a WeakMap keyed on the env object so it auto-GCs.
const pirRequestCache = new WeakMap<Env, { pirs: Pir[]; loadedAt: number }>();

async function loadPirsCached(env: Env): Promise<Pir[]> {
  const cached = pirRequestCache.get(env);
  if (cached && Date.now() - cached.loadedAt < PIR_REQUEST_CACHE_TTL_MS) return cached.pirs;
  const pirs = (await readLastGood<Pir[]>(env, LASTGOOD_KEY)) ?? DEFAULT_PIRS;
  pirRequestCache.set(env, { pirs, loadedAt: Date.now() });
  return pirs;
}

/**
 * Priority → base cadence mapping.
 * Critical PIRs trigger hourly collection, low PIRs can be daily.
 */
const PRIORITY_CADENCE: Record<PirPriority, number> = {
  critical: 1,
  high: 3,
  medium: 8,
  low: 24,
};

/**
 * Compute the effective collection cadence for a PIR.
 * If explicitly set, uses that; otherwise derives from priority.
 */
function getEffectiveCadence(pir: Pir): number {
  return pir.collection_cadence_hours ?? PRIORITY_CADENCE[pir.priority] ?? 8;
}

export interface CollectionRoute {
  source_id: string;
  /** Base cadence in hours (1 = hourly, 24 = daily) */
  base_cadence_hours: number;
  /** Effective cadence after PIR overlay (lowest cadence across relevant PIRs) */
  effective_cadence_hours: number;
  /** How many active PIRs reference this source */
  pir_count: number;
  /** Which PIR priorities are driving this source's cadence */
  driving_priorities: PirPriority[];
  /** Recommended next collection time (ISO string) */
  next_collection_at: string;
  /** Live feed health for this source, if known — surfaces collection voids
   *  feeding high-priority PIRs ('down'/'degraded'/'ok'/'unknown'). */
  source_status: string;
}

/**
 * Compute collection routing — which sources to poll at what cadence based on
 * active PIR requirements. Sources referenced by high-priority PIRs get polled
 * more frequently.
 */
export function computeCollectionRouting(pirs: Pir[], sourceStatuses: Record<string, string> = {}): CollectionRoute[] {
  const active = pirs.filter((p) => p.status === 'active');
  const sourceMap = new Map<string, { cadences: number[]; priorities: PirPriority[] }>();

  for (const pir of active) {
    const cadence = getEffectiveCadence(pir);
    for (const src of pir.relevant_sources) {
      if (!sourceMap.has(src)) sourceMap.set(src, { cadences: [], priorities: [] });
      const entry = sourceMap.get(src)!;
      entry.cadences.push(cadence);
      entry.priorities.push(pir.priority);
    }
  }

  const routes: CollectionRoute[] = [];
  const now = Date.now();
  for (const [sourceId, info] of sourceMap) {
    // Effective cadence = lowest (most frequent) across all relevant PIRs
    const effective = Math.min(...info.cadences);
    routes.push({
      source_id: sourceId,
      base_cadence_hours: PRIORITY_CADENCE.low,
      effective_cadence_hours: effective,
      pir_count: info.cadences.length,
      driving_priorities: [...new Set(info.priorities)].sort((a, b) => PRIORITY_CADENCE[a] - PRIORITY_CADENCE[b]),
      next_collection_at: new Date(now + effective * 3600_000).toISOString(),
      source_status: sourceStatuses[sourceId] ?? 'unknown',
    });
  }

  return routes.sort((a, b) => a.effective_cadence_hours - b.effective_cadence_hours);
}

/**
 * Build a set of "fresh" source keys using the feed-status cache + fallback.
 * Shared by pirListHandler and detectPirAlerts.
 */
async function buildFreshSourceKeys(): Promise<{ fresh: Set<string>; statuses: Record<string, string> }> {
  const fresh = new Set<string>();
  const statuses: Record<string, string> = {};
  let cacheWarm = false;
  try {
    const cache = (caches as unknown as { default: Cache }).default;
    const cached = await cache.match(FEED_STATUS_CACHE_KEY);
    if (cached) {
      cacheWarm = true;
      const body = (await cached.json()) as { rows?: Array<{ id: string; status: string }> };
      if (body.rows) {
        for (const row of body.rows) {
          statuses[row.id] = row.status;
          if (row.status === 'ok' || row.status === 'degraded') {
            fresh.add(row.id);
            const covered = PROBE_COVERAGE[row.id];
            if (covered) for (const src of covered) fresh.add(src);
          }
        }
      }
    }
  } catch (_catchErr) {
    console.error('buildFreshSourceKeys failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* best-effort */
  }
  if (!cacheWarm) {
    for (const [srcId, entry] of Object.entries(SOURCE_RELIABILITY_REGISTRY)) {
      if (entry.reliability <= 'D') fresh.add(srcId);
    }
    fresh.add('hudsonrock');
  }
  return { fresh, statuses };
}

/**
 * Score each PIR against the current collection state.
 * This runs on the request path — fast since it only reads KV last-good data.
 */
function scorePir(pir: Pir, freshSourceKeys: Set<string>, recentFindings: string[]): PirScore {
  const contributingSources = pir.relevant_sources.filter((s) => freshSourceKeys.has(s));
  const confidence = computeConfidence({
    sourceIds: contributingSources.length > 0 ? contributingSources : pir.relevant_sources,
    findingType: 'general',
  });
  const freshnessScore = Math.min(
    100,
    Math.round((contributingSources.length / Math.max(1, pir.relevant_sources.length)) * 100)
  );
  const composite = Math.round(pir.coverage_score * 0.4 + confidence.score * 0.3 + freshnessScore * 0.3);

  return {
    pir_id: pir.id,
    pir_title: pir.title,
    confidence,
    freshness_score: freshnessScore,
    sources_contributing_today: contributingSources.length,
    total_relevant_sources: pir.relevant_sources.length,
    recent_findings: recentFindings.slice(0, 5),
    composite_coverage: composite,
  };
}

export async function pirListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const lg = await readLastGood<Pir[]>(c.env, LASTGOOD_KEY);
  const pirs = lg ?? DEFAULT_PIRS;
  const activePirs = pirs.filter((p) => p.status === 'active');

  const { fresh: freshSourceKeys } = await buildFreshSourceKeys();

  // Recent findings (last 24h from D1 telegram leaks)
  const recentFindings: string[] = [];
  try {
    const db = c.env.BRIEFINGS_DB;
    if (db) {
      const rows = (await db
        .prepare(
          `SELECT message_text FROM telegram_leak_entries WHERE discovered_at > datetime('now', '-24 hours') AND message_text IS NOT NULL LIMIT 20`
        )
        .all()) as { results?: Array<{ message_text: string }> };
      if (rows.results) {
        for (const row of rows.results) {
          const text = row.message_text ?? '';
          if (text.length > 10) recentFindings.push(text.slice(0, 200));
        }
      }
    }
  } catch (_catchErr) {
    console.error('pirListHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* best-effort */
  }

  const scored = activePirs.map((pir) => scorePir(pir, freshSourceKeys, recentFindings));

  return c.json(
    {
      generated_at: new Date().toISOString(),
      pirs: activePirs,
      scores: scored,
      fresh_sources: [...freshSourceKeys],
      recent_findings_count: recentFindings.length,
      total_pirs: pirs.length,
      active_count: activePirs.length,
    },
    200,
    { 'Cache-Control': 'public, max-age=300' }
  );
}

export async function pirDetailHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const lg = await readLastGood<Pir[]>(c.env, LASTGOOD_KEY);
  const pirs = lg ?? DEFAULT_PIRS;
  const pir = pirs.find((p) => p.id === id);
  if (!pir) return c.json({ error: 'PIR not found' }, 404);
  return c.json(pir);
}

// ── CRUD endpoints ───────────────────────────────────────────────────────

function generatePirId(): string {
  return `pir-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

async function loadPirs(env: Env): Promise<Pir[]> {
  return loadPirsCached(env);
}

async function savePirs(env: Env, pirs: Pir[]): Promise<void> {
  // Invalidate request cache on write
  pirRequestCache.delete(env);
  // force:true — PIRs are a store of record, not a resilience fallback. Without
  // it the 6h write-debounce would silently drop a second create/update within
  // the window, losing PIRs on the next cold read.
  await writeLastGood(env, LASTGOOD_KEY, pirs, { force: true });
}

/**
 * POST /api/v1/threat-intel/pirs — create a new PIR
 */
export async function pirCreateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<Omit<Pir, 'id' | 'created_at' | 'updated_at'>>();
    if (!body.title || !body.consumer || !body.decision) {
      return c.json({ error: 'title, consumer, and decision are required' }, 400);
    }
    const now = new Date().toISOString();
    const pir: Pir = {
      id: generatePirId(),
      title: body.title,
      description: body.description ?? '',
      category: body.category ?? 'general',
      priority: body.priority ?? 'medium',
      status: body.status ?? 'active',
      consumer: body.consumer,
      decision: body.decision,
      kiqs: body.kiqs ?? [],
      relevant_sources: body.relevant_sources ?? [],
      coverage_score: body.coverage_score ?? 50,
      min_source_ratio: body.min_source_ratio,
      created_at: now,
      updated_at: now,
    };
    const pirs = await loadPirs(c.env);
    pirs.push(pir);
    await savePirs(c.env, pirs);
    return c.json({ ok: true, pir }, 201);
  } catch (e) {
    console.error('pirCreateHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * PUT /api/v1/threat-intel/pirs/:id — update an existing PIR
 */
export async function pirUpdateHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Partial<Omit<Pir, 'id' | 'created_at' | 'updated_at'>>>();
    const pirs = await loadPirs(c.env);
    const idx = pirs.findIndex((p) => p.id === id);
    if (idx === -1) return c.json({ error: 'PIR not found' }, 404);
    const existing = pirs[idx]!;
    const updated: Pir = {
      ...existing,
      ...body,
      id: existing.id,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };
    pirs[idx] = updated;
    await savePirs(c.env, pirs);
    return c.json({ ok: true, pir: updated });
  } catch (e) {
    console.error('pirUpdateHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * DELETE /api/v1/threat-intel/pirs/:id — remove a PIR
 */
export async function pirDeleteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const id = c.req.param('id');
    const pirs = await loadPirs(c.env);
    const idx = pirs.findIndex((p) => p.id === id);
    if (idx === -1) return c.json({ error: 'PIR not found' }, 404);
    pirs.splice(idx, 1);
    await savePirs(c.env, pirs);
    return c.json({ ok: true, deleted: id });
  } catch (e) {
    console.error('pirDeleteHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * GET /api/v1/threat-intel/pirs/routing — compute PIR-driven collection routing
 */
export async function pirRoutingHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const pirs = await loadPirs(c.env);
    const sourceStatuses: Record<string, string> = {};
    try {
      const cache = (caches as unknown as { default: Cache }).default;
      const cached = await cache.match(FEED_STATUS_CACHE_KEY);
      if (cached) {
        const body = (await cached.json()) as { rows?: Array<{ id: string; status: string }> };
        if (body.rows) for (const r of body.rows) sourceStatuses[r.id] = r.status;
      }
    } catch (_catchErr) {
      console.error('pirRoutingHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* best-effort */
    }

    const routes = computeCollectionRouting(pirs, sourceStatuses);

    return c.json(
      {
        generated_at: new Date().toISOString(),
        total_routes: routes.length,
        routes,
      },
      200,
      { 'Cache-Control': 'public, max-age=120' }
    );
  } catch (e) {
    console.error('pirRoutingHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

// ── Alert detection ──────────────────────────────────────────────────────

const ALERT_KV_PREFIX = 'pir-alert:v1';
// Single KV key for recent alerts — replaces the old per-hour key pattern
// that caused N+1 KV reads on every alert-list fetch.
const ALERT_ACTIVE_KEY = `${ALERT_KV_PREFIX}:active`;
const MAX_ALERTS_STORED = 200;

/**
 * Detect PIR-level collection health alerts. Pure logic (no Hono) so it can
 * be called directly from both the HTTP handler and the cron scheduler.
 */
export async function detectPirAlerts(env: Pick<Env, 'KV_CACHE'>): Promise<{ total: number; alerts: PirAlert[] }> {
  const pirs = await loadPirs(env as Env);
  const activePirs = pirs.filter((p) => p.status === 'active');

  const { fresh: freshSourceKeys, statuses: sourceStatuses } = await buildFreshSourceKeys();

  const alerts: PirAlert[] = [];
  for (const pir of activePirs) {
    const contributing = pir.relevant_sources.filter((s) => freshSourceKeys.has(s));
    const ratio = Math.round((contributing.length / Math.max(1, pir.relevant_sources.length)) * 100);
    const threshold = pir.min_source_ratio ?? 50;

    if (ratio < threshold) {
      const downSources = pir.relevant_sources.filter((s) => {
        const st = sourceStatuses[s];
        return st === 'down' || st === 'error' || st === 'degraded' || (!freshSourceKeys.has(s) && st !== 'unknown');
      });
      alerts.push({
        id: `alert-${Date.now()}-${pir.id}`,
        pir_id: pir.id,
        pir_title: pir.title,
        type: ratio === 0 ? 'source_total_loss' : 'source_degradation',
        severity: ratio === 0 || pir.priority === 'critical' ? 'critical' : 'warning',
        message:
          ratio === 0
            ? `All sources for "${pir.title}" have stopped producing — no collection in 24h`
            : `Only ${contributing.length}/${pir.relevant_sources.length} sources contributing for "${pir.title}" (threshold ${threshold}%). Down: ${downSources.join(', ')}`,
        metric_before: threshold,
        metric_after: ratio,
        threshold,
        triggered_at: new Date().toISOString(),
        acknowledged: false,
      });
    }
  }

  // Consolidate into a single KV key — replaces the old per-hour key pattern.
  // Only WRITE when there is genuinely a new alert id: the hourly cron otherwise
  // re-persists an identical set every run, burning the Free-plan write budget.
  if (alerts.length > 0 && env.KV_CACHE) {
    const existing = (await safeNullLog('kv-get-pir-active', env.KV_CACHE.get(ALERT_ACTIVE_KEY, 'json'))) as
      PirAlert[] | null;
    const seen = new Set((existing ?? []).map((a) => a.id));
    const fresh = alerts.filter((a) => !seen.has(a.id));
    if (fresh.length > 0) {
      const merged = [...fresh, ...(existing ?? [])].slice(0, MAX_ALERTS_STORED);
      await env.KV_CACHE.put(ALERT_ACTIVE_KEY, JSON.stringify(merged), { expirationTtl: 604800 });
    }
  }

  return { total: activePirs.length, alerts };
}

/**
 * GET /api/v1/threat-intel/pirs/alert — trigger PIR alert detection on-demand
 */
export async function pirAlertHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const result = await detectPirAlerts(c.env);
    return c.json({
      generated_at: new Date().toISOString(),
      pirs_checked: result.total,
      alerts_generated: result.alerts.length,
      alerts: result.alerts,
    });
  } catch (e) {
    console.error('pirAlertHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * GET /api/v1/threat-intel/pirs/alerts — retrieve recent PIR alerts
 * Single KV read — no more N+1 from per-hour keys.
 */
export async function pirAlertListHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const limit = Math.min(100, parseInt(c.req.query('limit') ?? '50', 10));
    const includeAcknowledged = c.req.query('include_acknowledged') === 'true';
    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ generated_at: new Date().toISOString(), total: 0, alerts: [] });
    const raw = (await safeNullLog('kv-get-pir-list', kv.get(ALERT_ACTIVE_KEY, 'json'))) as PirAlert[] | null;
    const alerts = raw ?? [];
    const filtered = includeAcknowledged ? alerts : alerts.filter((a) => !a.acknowledged);
    return c.json({
      total: filtered.length,
      results: filtered.slice(0, limit),
    });
  } catch (e) {
    console.error('pirAlertListHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * PATCH /api/v1/threat-intel/pirs/alerts/:id/acknowledge — acknowledge an alert
 */
export async function pirAlertAckHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const alertId = c.req.param('id');
    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ error: 'KV not available' }, 503);
    const raw = await safeNullLog('kv-get-pir-ack-detail', kv.get(ALERT_ACTIVE_KEY, 'json'));
    const alerts: PirAlert[] = (raw as PirAlert[]) ?? [];
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return c.json({ error: 'Alert not found' }, 404);
    const updated: PirAlert = {
      id: alert.id,
      pir_id: alert.pir_id,
      pir_title: alert.pir_title,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      metric_before: alert.metric_before,
      metric_after: alert.metric_after,
      threshold: alert.threshold,
      triggered_at: alert.triggered_at,
      acknowledged: true,
    };
    const idx = alerts.indexOf(alert);
    alerts[idx] = updated;
    await kv.put(ALERT_ACTIVE_KEY, JSON.stringify(alerts), { expirationTtl: 604800 });
    return c.json({ acknowledged: true, alert: updated });
  } catch (e) {
    console.error('pirAlertAckHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * POST /api/v1/threat-intel/pirs/alerts/acknowledge-all — acknowledge all unacknowledged alerts
 */
export async function pirAlertAckAllHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const kv = c.env.KV_CACHE;
    if (!kv) return c.json({ error: 'KV not available' }, 503);
    const raw = await safeNullLog('kv-get-pir-ack-all', kv.get(ALERT_ACTIVE_KEY, 'json'));
    const alerts: PirAlert[] = (raw as PirAlert[]) ?? [];
    if (alerts.length === 0) return c.json({ acknowledged: 0 });
    const updated = alerts.map((a) => (a.acknowledged ? a : { ...a, acknowledged: true }));
    await kv.put(ALERT_ACTIVE_KEY, JSON.stringify(updated), { expirationTtl: 604800 });
    return c.json({ acknowledged: updated.filter((a) => !a.acknowledged).length });
  } catch (e) {
    console.error('pirAlertAckAllHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * GET /api/v1/threat-intel/pirs/relevant?q=... — find PIRs relevant to a query
 * Used by the Entity Resolution page to show which PIRs reference a given entity/source.
 */
export async function pirRelevantHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const q = c.req.query('q')?.trim().toLowerCase();
    if (!q) return c.json({ results: [] });
    const pirs = await loadPirs(c.env);
    const results = pirs
      .filter((p) => {
        const hay = [p.title, p.description, p.decision, ...p.kiqs, ...p.relevant_sources].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .map((p) => ({
        id: p.id,
        title: p.title,
        priority: p.priority,
        status: p.status,
        category: p.category,
        consumer: p.consumer,
        matched_in: [] as string[],
      }));
    // Add match context
    for (const r of results) {
      const pir = pirs.find((p) => p.id === r.id)!;
      if (pir.relevant_sources.some((s) => s.toLowerCase().includes(q))) r.matched_in.push('relevant_sources');
      if (pir.kiqs.some((k) => k.toLowerCase().includes(q))) r.matched_in.push('kiq');
      if (pir.title.toLowerCase().includes(q)) r.matched_in.push('title');
      if (pir.description.toLowerCase().includes(q)) r.matched_in.push('description');
      if (pir.decision.toLowerCase().includes(q)) r.matched_in.push('decision');
    }
    return c.json({ query: c.req.query('q'), results }, 200, { 'Cache-Control': 'public, max-age=120' });
  } catch (e) {
    console.error('pirRelevantHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
