/**
 * Recursive BFS pivot engine — turns every discovered identifier (email,
 * domain, IP, hash, wallet) into a new seed and expands the relationship
 * graph hop-by-hop until the frontier is exhausted.
 *
 * Confidence-gated: exact-match links auto-pursue, weak/PII links held.
 * Cycle-safe: dedup + depth caps.
 *
 * Ported from cti-expert's pivot_orchestrator.py concept (7onez/cti-expert).
 */

import type { AgentStep } from './types';

export type SeedType = 'ip' | 'domain' | 'hash' | 'url' | 'email' | 'actor' | 'cve' | 'wallet' | 'iban' | 'username';

export interface PivotSeed {
  type: SeedType;
  value: string;
  /** How many hops from the original query (0 = the query itself). */
  depth: number;
  /** Which tool/step discovered this seed. */
  source: string;
  /** Confidence in the link (exact = auto-pursue, weak = hold). */
  confidence: 'exact' | 'strong' | 'weak';
}

export interface SeedQueue {
  /** Seeds discovered but not yet investigated. */
  pending: PivotSeed[];
  /** Seeds that have been investigated (value:type key, for dedup). */
  processed: Set<string>;
  /** Maximum pivot depth (hops from original query). */
  maxDepth: number;
}

const MAX_SEEDS = 30;
const MAX_DEPTH = 3;

export function createSeedQueue(initialQuery: string, queryType: string): SeedQueue {
  const queue: SeedQueue = {
    pending: [],
    processed: new Set(),
    maxDepth: MAX_DEPTH,
  };

  const initialType = (queryType as SeedType) || 'domain';
  const key = seedKey(initialType, initialQuery);
  queue.processed.add(key);

  return queue;
}

function seedKey(type: string, value: string): string {
  return `${type}:${value.toLowerCase().trim()}`;
}

/**
 * Extract new seeds from observer findings on a completed step.
 * Only exact-match and strong-confidence seeds are auto-queued; weak
 * seeds are recorded but held (the planner can still pursue them
 * manually if it judges them valuable).
 */
export function extractSeedsFromStep(step: AgentStep, currentDepth: number): PivotSeed[] {
  const seeds: PivotSeed[] = [];
  const findings = step.observerFindings;
  if (!findings) return seeds;

  const source = step.results.map((r) => r.tool).join('+') || 'observer';

  for (const raw of findings.iocs ?? []) {
    const seed = classifySeed(raw, currentDepth + 1, source);
    if (seed) seeds.push(seed);
  }

  for (const actor of findings.actors ?? []) {
    if (actor && actor.trim()) {
      seeds.push({
        type: 'actor',
        value: actor.trim(),
        depth: currentDepth + 1,
        source,
        confidence: 'strong',
      });
    }
  }

  for (const cve of findings.cves ?? []) {
    if (cve && cve.trim()) {
      seeds.push({
        type: 'cve',
        value: cve.trim().toUpperCase(),
        depth: currentDepth + 1,
        source,
        confidence: 'strong',
      });
    }
  }

  return seeds;
}

function classifySeed(raw: string, depth: number, source: string): PivotSeed | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return { type: 'ip', value, depth, source, confidence: 'exact' };
  }
  if (/^[a-f0-9]{32,64}$/i.test(value)) {
    return { type: 'hash', value: value.toLowerCase(), depth, source, confidence: 'exact' };
  }
  if (/^CVE-\d{4}-\d+$/i.test(value)) {
    return { type: 'cve', value: value.toUpperCase(), depth, source, confidence: 'exact' };
  }
  if (/^https?:\/\//i.test(value)) {
    return { type: 'url', value, depth, source, confidence: 'exact' };
  }
  if (/^[^@]+@[^@]+\.[^@]+$/.test(value)) {
    return { type: 'email', value: value.toLowerCase(), depth, source, confidence: 'strong' };
  }
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(value) || /^0x[a-f0-9]{40}$/i.test(value)) {
    return { type: 'wallet', value, depth, source, confidence: 'exact' };
  }
  if (value.includes('.') && !value.includes(' ') && value.length < 254) {
    return { type: 'domain', value: value.toLowerCase(), depth, source, confidence: 'strong' };
  }

  return null;
}

/**
 * Add newly discovered seeds to the queue, skipping duplicates and
 * seeds that exceed the depth cap. Returns the number of seeds added.
 */
export function enqueueSeeds(queue: SeedQueue, seeds: PivotSeed[]): number {
  let added = 0;
  for (const seed of seeds) {
    if (seed.depth > queue.maxDepth) continue;
    if (queue.pending.length >= MAX_SEEDS) break;

    const key = seedKey(seed.type, seed.value);
    if (queue.processed.has(key)) continue;
    if (queue.pending.some((s) => seedKey(s.type, s.value) === key)) continue;

    queue.pending.push(seed);
    queue.processed.add(key);
    added++;
  }
  return added;
}

/**
 * Pop the next seed to investigate. Returns null when the frontier is
 * exhausted.
 */
export function nextSeed(queue: SeedQueue): PivotSeed | null {
  return queue.pending.shift() ?? null;
}

/**
 * Build a compact prompt fragment describing the pivot state — the
 * current seed being investigated and the pending frontier. Injected
 * into the planner user prompt so the planner knows what to pivot on.
 */
export function pivotContext(queue: SeedQueue, currentSeed?: PivotSeed): string {
  const lines: string[] = [];

  if (currentSeed) {
    lines.push(
      `Pivot depth ${currentSeed.depth}: investigating ${currentSeed.type} "${currentSeed.value}" (discovered by ${currentSeed.source})`
    );
  }

  if (queue.pending.length > 0) {
    const preview = queue.pending
      .slice(0, 8)
      .map((s) => `${s.type}:${s.value} (d${s.depth})`)
      .join(', ');
    lines.push(`Pending pivot seeds (${queue.pending.length}): ${preview}${queue.pending.length > 8 ? '...' : ''}`);
  }

  if (queue.processed.size > 1) {
    lines.push(`Seeds investigated so far: ${queue.processed.size - 1}`);
  }

  return lines.length > 0 ? lines.join('\n') : '';
}
