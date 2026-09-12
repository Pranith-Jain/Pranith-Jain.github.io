/**
 * Digest AI analysis — shared helper for the Webamon DTB + PCMedicalist pages.
 *
 * Every analysis has TWO layers:
 *   1. Deterministic bullets (always available, zero AI cost): net movement
 *      (growth vs takedowns), estate snapshot, top clusters/campaigns, severity
 *      mix. This is the fallback when no AI provider is configured.
 *   2. LLM narrative (best-effort): Groq → Workers AI chain, same ordering as
 *      `ioc-verdict.ts`. Cached per date — briefs/digests are immutable, so an
 *      analysis is generated at most once ever (Cache API + KV last-good).
 *
 * Zero D1. Generation is tracked via Analytics Engine by the caller.
 */

import type { Env } from '../env';
import { logError } from './logger';
import type { WdtbBrief } from './webamon-dtb-manifest';
import type { PcmDigest } from './pcmedicalist-manifest';

const GROQ_MODEL = 'openai/gpt-oss-120b';
const AI_TIMEOUT_MS = 30_000;
const AI_MAX_TOKENS = 1200;

export const ANALYSIS_KV_TTL_SECONDS = 30 * 24 * 60 * 60; // immutable per date

export function analysisCacheKey(kind: 'wdtb' | 'pcm', date: string): string {
  return `https://digest-analysis.internal/v1/${kind}/${date}`;
}

export function analysisKvKey(kind: 'wdtb' | 'pcm', date: string): string {
  return `digest-analysis:${kind}:${date}`;
}

function cacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

/** Minimal LLM chain: Groq → Workers AI. Throws when neither is available. */
export async function aiChat(env: Env, system: string, user: string): Promise<{ text: string; model: string }> {
  const key = env.GROQ_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_completion_tokens: AI_MAX_TOKENS,
          temperature: 0.2,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) return { text, model: GROQ_MODEL };
      }
    } catch (e) {
      logError('digest-ai groq failed', e);
    }
  }
  if (env.AI) {
    try {
      const out = (await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: AI_MAX_TOKENS,
        temperature: 0.2,
      })) as { response?: string };
      if (out.response?.trim()) return { text: out.response.trim(), model: 'llama-3.3-70b' };
    } catch (e) {
      logError('digest-ai workers-ai failed', e);
    }
  }
  throw new Error('ai_unavailable');
}

// ── Webamon DTB ──────────────────────────────────────────────────────

export interface WdtbStats {
  campaignsTracked: number | null;
  uniqueDomains: number | null;
  percentOnline: number | null;
  growth: number;
  takedowns: number;
  infraRotations: number;
  lureRefreshes: number;
  otherMovements: number;
  campaignCount: number;
  clusterCount: number;
  criticalClusters: number;
  highClusters: number;
}

export function summarizeWdtbBrief(brief: WdtbBrief): { bullets: string[]; stats: WdtbStats } {
  const counts: Record<string, number> = {};
  for (const m of brief.movements ?? []) counts[m.category] = (counts[m.category] ?? 0) + 1;
  const growth = counts['growth'] ?? 0;
  const takedowns = counts['takedown'] ?? 0;
  const stats: WdtbStats = {
    campaignsTracked: brief.estate?.campaignsTracked ?? null,
    uniqueDomains: brief.estate?.uniqueDomains ?? null,
    percentOnline: brief.estate?.percentOnline ?? null,
    growth,
    takedowns,
    infraRotations: counts['infra-rotation'] ?? 0,
    lureRefreshes: counts['lure-refresh'] ?? 0,
    otherMovements: (brief.movements?.length ?? 0) - growth - takedowns - (counts['infra-rotation'] ?? 0) - (counts['lure-refresh'] ?? 0),
    campaignCount: brief.campaigns?.length ?? 0,
    clusterCount: brief.clusters?.entries?.length ?? 0,
    criticalClusters: brief.clusters?.summary?.critical ?? 0,
    highClusters: brief.clusters?.summary?.high ?? 0,
  };
  const bullets: string[] = [];
  const net = growth - takedowns;
  bullets.push(
    net > 0
      ? `Attacker estate expanding: ${growth} growth signals vs ${takedowns} takedowns (net +${net}).`
      : net < 0
        ? `Defenders ahead today: ${takedowns} takedowns vs ${growth} growth signals (net ${net}).`
        : `Balanced day: ${growth} growth signals matched by ${takedowns} takedowns.`
  );
  if (stats.campaignsTracked != null) {
    bullets.push(
      `Estate: ${stats.campaignsTracked.toLocaleString()} campaigns, ${(stats.uniqueDomains ?? 0).toLocaleString()} domains, ${stats.percentOnline ?? '?'}% online.`
    );
  }
  const topClusters = [...(brief.clusters?.entries ?? [])].sort((a, b) => b.growth - a.growth).slice(0, 3);
  for (const cl of topClusters) {
    bullets.push(`Fastest-growing cluster: ${cl.type} (+${cl.growth.toLocaleString()} domains, e.g. ${cl.sample}).`);
  }
  if (stats.infraRotations > 0) bullets.push(`${stats.infraRotations} infrastructure rotation(s) — watch for DNS/ASN churn on tracked estates.`);
  if (stats.criticalClusters > 0) bullets.push(`${stats.criticalClusters} critical cluster(s) live — prioritize blocking.`);
  const firstCampaign = brief.campaigns?.[0];
  if (firstCampaign) bullets.push(`Spotlight campaign: ${firstCampaign.name} — ${firstCampaign.summary.slice(0, 160)}.`);
  return { bullets, stats };
}

export function buildWdtbPrompt(brief: WdtbBrief, bullets: string[]): { system: string; user: string } {
  const compact = {
    date: brief.date,
    estate: brief.estate,
    kpis: (brief.kpis ?? []).slice(0, 10),
    movements: (brief.movements ?? []).slice(0, 12).map((m) => ({ category: m.category, title: m.title, detail: m.detail?.slice(0, 200) })),
    campaigns: (brief.campaigns ?? []).slice(0, 5).map((c) => ({ name: c.name, summary: c.summary?.slice(0, 200) })),
    clusters: (brief.clusters?.entries ?? []).slice(0, 8),
  };
  return {
    system:
      'You are a SOC threat analyst. Given a Webamon daily threat brief (phishing/malware domain estates), write a tight analyst note: 4-6 bullets on what matters, then one "Recommended action" line. Plain text, no markdown headers, max 900 chars. No hallucinated IOCs — only entities present in the input.',
    user: `Deterministic read:\n${bullets.join('\n')}\n\nBrief JSON:\n${JSON.stringify(compact).slice(0, 3000)}`,
  };
}

// ── PCMedicalist ─────────────────────────────────────────────────────

export interface PcmStats {
  feedsTotal: number | null;
  itemsRaw: number | null;
  itemsDeduped: number | null;
  dedupRate: number | null;
  layerCount: number;
  topFeeds: { feed: string; count: number }[];
  severityMix: Record<string, number>;
  topCves: string[];
  topTechnologies: string[];
}

export function summarizePcmDigest(digest: PcmDigest): { bullets: string[]; stats: PcmStats } {
  const dedupRate =
    digest.itemsRaw && digest.itemsDeduped != null && digest.itemsRaw > 0
      ? Math.round((1 - digest.itemsDeduped / digest.itemsRaw) * 100)
      : null;
  const topFeeds = Object.entries(digest.perFeed ?? {})
    .map(([feed, count]) => ({ feed, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const severityMix: Record<string, number> = {};
  const cveCounts: Record<string, number> = {};
  const techCounts: Record<string, number> = {};
  for (const layer of digest.layers ?? []) {
    for (const item of layer.top ?? []) {
      if (item.severity) severityMix[item.severity] = (severityMix[item.severity] ?? 0) + 1;
      for (const c of item.cves ?? []) cveCounts[c] = (cveCounts[c] ?? 0) + 1;
      for (const t of item.technologies ?? []) techCounts[t] = (techCounts[t] ?? 0) + 1;
    }
  }
  const topCves = Object.entries(cveCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  const topTechnologies = Object.entries(techCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  const stats: PcmStats = {
    feedsTotal: digest.feedsTotal ?? null,
    itemsRaw: digest.itemsRaw ?? null,
    itemsDeduped: digest.itemsDeduped ?? null,
    dedupRate,
    layerCount: digest.layers?.length ?? 0,
    topFeeds,
    severityMix,
    topCves,
    topTechnologies,
  };
  const bullets: string[] = [];
  bullets.push(
    `${(digest.itemsDeduped ?? 0).toLocaleString()} deduplicated items from ${digest.feedsTotal ?? '?'} feeds` +
      (dedupRate != null ? ` (${dedupRate}% duplicates removed)` : '') +
      ` across ${stats.layerCount} layers.`
  );
  if (topFeeds.length > 0) bullets.push(`Loudest feeds: ${topFeeds.map((f) => `${f.feed} (${f.count})`).join(', ')}.`);
  const sev = Object.entries(severityMix).sort((a, b) => b[1] - a[1])[0];
  if (sev) bullets.push(`Top-item severity leans ${sev[0]} (${sev[1]} of sampled top items).`);
  if (topCves.length > 0) bullets.push(`Most-cited CVEs in top items: ${topCves.join(', ')}.`);
  if (topTechnologies.length > 0) bullets.push(`Most-targeted tech in top items: ${topTechnologies.join(', ')}.`);
  return { bullets, stats };
}

export function buildPcmPrompt(digest: PcmDigest, bullets: string[]): { system: string; user: string } {
  const compact = {
    date: digest.date,
    feedsTotal: digest.feedsTotal,
    itemsRaw: digest.itemsRaw,
    itemsDeduped: digest.itemsDeduped,
    layers: (digest.layers ?? []).map((l) => ({
      name: l.name,
      count: l.count,
      top: (l.top ?? []).slice(0, 4).map((t) => ({ title: t.title, severity: t.severity, cves: (t.cves ?? []).slice(0, 3) })),
    })),
    postA: (digest.postA ?? '').slice(0, 800),
  };
  return {
    system:
      'You are a SOC threat analyst. Given a daily security-intel digest, write a tight analyst note: 4-6 bullets on what matters, then one "Recommended action" line. Plain text, no markdown headers, max 900 chars. No hallucinated CVEs or actors — only entities present in the input.',
    user: `Deterministic read:\n${bullets.join('\n')}\n\nDigest JSON:\n${JSON.stringify(compact).slice(0, 3000)}`,
  };
}

// ── Cache helpers ────────────────────────────────────────────────────

export interface DigestAnalysis {
  kind: 'wdtb' | 'pcm';
  date: string;
  generated_at: string;
  /** Deterministic layer — always present. */
  bullets: string[];
  stats: WdtbStats | PcmStats;
  /** LLM layer — null when no provider configured or generation failed. */
  ai: { text: string; model: string } | null;
  ai_error?: string;
}

export async function readCachedAnalysis(kind: 'wdtb' | 'pcm', date: string, kv?: Env['KV_CACHE']): Promise<DigestAnalysis | null> {
  const cache = cacheApi();
  if (cache) {
    try {
      const hit = await cache.match(new Request(analysisCacheKey(kind, date)));
      if (hit) return (await hit.json()) as DigestAnalysis;
    } catch {
      /* fall through */
    }
  }
  if (kv) {
    try {
      const raw = await kv.get(analysisKvKey(kind, date), 'json');
      if (raw && typeof raw === 'object') return raw as DigestAnalysis;
    } catch {
      /* miss */
    }
  }
  return null;
}

export async function writeCachedAnalysis(analysis: DigestAnalysis, kv?: Env['KV_CACHE']): Promise<void> {
  const cache = cacheApi();
  if (cache) {
    try {
      await cache.put(
        analysisCacheKey(analysis.kind, analysis.date),
        new Response(JSON.stringify(analysis), {
          headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' },
        })
      );
    } catch {
      /* best-effort */
    }
  }
  if (kv) {
    try {
      await kv.put(analysisKvKey(analysis.kind, analysis.date), JSON.stringify(analysis), {
        expirationTtl: ANALYSIS_KV_TTL_SECONDS,
      });
    } catch {
      /* best-effort */
    }
  }
}
