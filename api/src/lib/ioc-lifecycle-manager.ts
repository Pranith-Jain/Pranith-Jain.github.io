/**
 * IOC Lifecycle Management
 *
 * Tracks IOCs through their full lifecycle: discovery → enrichment →
 * active → aging → expired/whitelisted. Implements confidence decay,
 * multi-source corroboration, and false-positive feedback loops.
 */

import type { D1Database } from '@cloudflare/workers-types';

export type IocStatus = 'discovered' | 'enriching' | 'active' | 'aging' | 'expired' | 'whitelisted' | 'false-positive';
export type IocType = 'ip' | 'domain' | 'url' | 'hash-md5' | 'hash-sha1' | 'hash-sha256' | 'email' | 'filename' | 'registry' | 'mutex' | 'yara';

export interface ManagedIOC {
  id: string;
  value: string;
  type: IocType;
  status: IocStatus;
  confidence: number;
  tlp: 'white' | 'green' | 'amber' | 'red';
  sources: IocSource[];
  corroboration_count: number;
  first_seen: string;
  last_seen: string;
  expires_at: string | null;
  tags: string[];
  context: string;
  related_iocs: string[];
  false_positive_reports: number;
  analyst_notes: string;
  created_at: string;
  updated_at: string;
}

export interface IocSource {
  name: string;
  reported_at: string;
  confidence: number;
  context: string;
  reference_url: string;
}

export interface IocCorroboration {
  total_sources: number;
  independent_sources: number;
  avg_confidence: number;
  max_confidence: number;
  source_agreement: number;
  composite_score: number;
}

export const IOC_LIFECYCLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS managed_iocs (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered',
  confidence INTEGER NOT NULL DEFAULT 50,
  tlp TEXT NOT NULL DEFAULT 'amber',
  sources TEXT NOT NULL DEFAULT '[]',
  corroboration_count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  context TEXT NOT NULL DEFAULT '',
  related_iocs TEXT NOT NULL DEFAULT '[]',
  false_positive_reports INTEGER NOT NULL DEFAULT 0,
  analyst_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ioc_feedback (
  id TEXT PRIMARY KEY,
  ioc_id TEXT NOT NULL REFERENCES managed_iocs(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK(feedback_type IN ('true-positive','false-positive','enrichment','context')),
  analyst TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ioc_sharing_log (
  id TEXT PRIMARY KEY,
  ioc_id TEXT NOT NULL,
  destination TEXT NOT NULL,
  format TEXT NOT NULL,
  shared_by TEXT NOT NULL,
  shared_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_iocs_value ON managed_iocs(value);
CREATE INDEX IF NOT EXISTS idx_managed_iocs_status ON managed_iocs(status);
CREATE INDEX IF NOT EXISTS idx_managed_iocs_type ON managed_iocs(type);
CREATE INDEX IF NOT EXISTS idx_managed_iocs_expires ON managed_iocs(expires_at);
CREATE INDEX IF NOT EXISTS idx_ioc_feedback_ioc ON ioc_feedback(ioc_id);
`;

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Confidence decay function — reduces confidence over time based on IOC type */
export function calculateConfidenceDecay(
  baseConfidence: number,
  firstSeen: string,
  iocType: IocType,
  corroborationCount: number
): number {
  const ageHours = (Date.now() - new Date(firstSeen).getTime()) / (1000 * 60 * 60);

  // Decay rates per type (hours until 50% decay)
  const decayHalfLife: Record<IocType, number> = {
    'ip': 168,           // 1 week — IPs change frequently
    'domain': 720,       // 30 days
    'url': 48,           // 2 days — URLs are ephemeral
    'hash-md5': 8760,    // 1 year — hashes are stable
    'hash-sha1': 8760,
    'hash-sha256': 8760,
    'email': 2160,       // 90 days
    'filename': 4320,    // 6 months
    'registry': 4320,
    'mutex': 4320,
    'yara': 8760,
  };

  const halfLife = decayHalfLife[iocType] || 720;
  const decayFactor = Math.pow(0.5, ageHours / halfLife);

  // Corroboration bonus: more sources = slower decay
  const corroborationMultiplier = Math.min(2, 1 + (corroborationCount - 1) * 0.2);

  const decayed = baseConfidence * decayFactor * corroborationMultiplier;
  return Math.max(0, Math.min(100, Math.round(decayed)));
}

/** Calculate corroboration score from multiple sources */
export function calculateCorroboration(sources: IocSource[]): IocCorroboration {
  if (sources.length === 0) {
    return { total_sources: 0, independent_sources: 0, avg_confidence: 0, max_confidence: 0, source_agreement: 0, composite_score: 0 };
  }

  const uniqueSources = new Set(sources.map((s) => s.name));
  const confidences = sources.map((s) => s.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const maxConfidence = Math.max(...confidences);

  // Source agreement: how many sources agree on maliciousness (confidence > 50)
  const agreeing = sources.filter((s) => s.confidence > 50).length;
  const sourceAgreement = agreeing / sources.length;

  // Composite score: weighted combination
  const compositeScore = Math.min(100, Math.round(
    avgConfidence * 0.4 +
    maxConfidence * 0.2 +
    sourceAgreement * 30 +
    Math.min(uniqueSources.size, 5) * 2
  ));

  return {
    total_sources: sources.length,
    independent_sources: uniqueSources.size,
    avg_confidence: Math.round(avgConfidence),
    max_confidence: maxConfidence,
    source_agreement: Math.round(sourceAgreement * 100),
    composite_score: compositeScore,
  };
}

/** Add or update an IOC in the lifecycle manager */
export async function upsertIOC(
  db: D1Database,
  input: {
    value: string;
    type: IocType;
    source: string;
    confidence: number;
    context?: string;
    reference_url?: string;
    tags?: string[];
    tlp?: ManagedIOC['tlp'];
  }
): Promise<ManagedIOC> {
  const existing = await db.prepare('SELECT * FROM managed_iocs WHERE value = ?')
    .bind(input.value).first() as Record<string, unknown> | null;

  if (existing) {
    // Merge sources
    const sources: IocSource[] = JSON.parse(existing.sources as string);
    const alreadyReported = sources.some((s) => s.name === input.source);
    if (!alreadyReported) {
      sources.push({
        name: input.source,
        reported_at: new Date().toISOString(),
        confidence: input.confidence,
        context: input.context ?? '',
        reference_url: input.reference_url ?? '',
      });
    }

    const corroboration = calculateCorroboration(sources);
    const mergedTags = [...new Set([...JSON.parse(existing.tags as string), ...(input.tags ?? [])])];

    await db.prepare(
      `UPDATE managed_iocs SET
        sources = ?, corroboration_count = ?, confidence = ?,
        last_seen = ?, tags = ?, updated_at = datetime('now'),
        status = CASE WHEN status = 'discovered' THEN 'active' ELSE status END
       WHERE id = ?`
    ).bind(
      JSON.stringify(sources),
      corroboration.independent_sources,
      corroboration.composite_score,
      new Date().toISOString(),
      JSON.stringify(mergedTags),
      existing.id
    ).run();

    return getIOC(db, existing.id as string) as Promise<ManagedIOC>;
  }

  // New IOC
  const id = genId('ioc');
  const now = new Date().toISOString();
  const sources: IocSource[] = [{
    name: input.source,
    reported_at: now,
    confidence: input.confidence,
    context: input.context ?? '',
    reference_url: input.reference_url ?? '',
  }];
  const corroboration = calculateCorroboration(sources);

  await db.prepare(
    `INSERT INTO managed_iocs (id, value, type, status, confidence, tlp, sources, corroboration_count, first_seen, last_seen, tags, context)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, input.value, input.type, corroboration.composite_score,
    input.tlp ?? 'amber', JSON.stringify(sources), corroboration.independent_sources,
    now, now, JSON.stringify(input.tags ?? []), input.context ?? ''
  ).run();

  return getIOC(db, id) as Promise<ManagedIOC>;
}

export async function getIOC(db: D1Database, id: string): Promise<ManagedIOC | null> {
  const row = await db.prepare('SELECT * FROM managed_iocs WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!row) return null;
  return parseManagedIOC(row);
}

export async function getIOCByValue(db: D1Database, value: string): Promise<ManagedIOC | null> {
  const row = await db.prepare('SELECT * FROM managed_iocs WHERE value = ?').bind(value).first() as Record<string, unknown> | null;
  if (!row) return null;
  return parseManagedIOC(row);
}

export async function listIOCs(
  db: D1Database,
  opts: { status?: IocStatus; type?: IocType; minConfidence?: number; limit?: number; offset?: number } = {}
): Promise<{ iocs: ManagedIOC[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.status) { conditions.push('status = ?'); params.push(opts.status); }
  if (opts.type) { conditions.push('type = ?'); params.push(opts.type); }
  if (opts.minConfidence) { conditions.push('confidence >= ?'); params.push(opts.minConfidence); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [countResult, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM managed_iocs ${where}`).bind(...params).first() as Promise<{ total: number }>,
    db.prepare(`SELECT * FROM managed_iocs ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all(),
  ]);

  return {
    iocs: (rows.results as Record<string, unknown>[]).map(parseManagedIOC),
    total: countResult.total,
  };
}

/** Submit false-positive feedback */
export async function submitFeedback(
  db: D1Database,
  iocId: string,
  feedbackType: 'true-positive' | 'false-positive' | 'enrichment' | 'context',
  analyst: string,
  notes: string
): Promise<void> {
  const id = genId('fb');
  await db.prepare(
    'INSERT INTO ioc_feedback (id, ioc_id, feedback_type, analyst, notes) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, iocId, feedbackType, analyst, notes).run();

  if (feedbackType === 'false-positive') {
    await db.prepare(
      `UPDATE managed_iocs SET
        false_positive_reports = false_positive_reports + 1,
        status = CASE WHEN false_positive_reports >= 2 THEN 'false-positive' ELSE status END,
        updated_at = datetime('now')
       WHERE id = ?`
    ).bind(iocId).run();
  }
}

/** Run aging sweep — expire IOCs past their confidence threshold */
export async function runAgingSweep(db: D1Database, minConfidence = 10): Promise<number> {
  const rows = await db.prepare(
    "SELECT id, confidence, first_seen, type, corroboration_count FROM managed_iocs WHERE status = 'active'"
  ).all();

  let expired = 0;
  for (const row of rows.results as Record<string, unknown>[]) {
    const decayed = calculateConfidenceDecay(
      row.confidence as number,
      row.first_seen as string,
      row.type as IocType,
      row.corroboration_count as number
    );

    if (decayed < minConfidence) {
      await db.prepare("UPDATE managed_iocs SET status = 'expired', updated_at = datetime('now') WHERE id = ?")
        .bind(row.id).run();
      expired++;
    } else if (decayed < row.confidence) {
      await db.prepare("UPDATE managed_iocs SET confidence = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(decayed, row.id).run();
    }
  }

  return expired;
}

function parseManagedIOC(r: Record<string, unknown>): ManagedIOC {
  return {
    id: r.id as string,
    value: r.value as string,
    type: r.type as IocType,
    status: r.status as IocStatus,
    confidence: r.confidence as number,
    tlp: r.tlp as ManagedIOC['tlp'],
    sources: JSON.parse(r.sources as string) as IocSource[],
    corroboration_count: r.corroboration_count as number,
    first_seen: r.first_seen as string,
    last_seen: r.last_seen as string,
    expires_at: r.expires_at as string | null,
    tags: JSON.parse(r.tags as string) as string[],
    context: r.context as string,
    related_iocs: JSON.parse(r.related_iocs as string) as string[],
    false_positive_reports: r.false_positive_reports as number,
    analyst_notes: r.analyst_notes as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}
