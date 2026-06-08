/**
 * Intelligence Requirements Management (PIR Framework)
 *
 * Priority Intelligence Requirements (PIRs) with collection source
 * mapping, coverage analysis, and gap detection.
 */

import type { D1Database } from '@cloudflare/workers-types';

export type PirStatus = 'active' | 'paused' | 'fulfilled' | 'archived';
export type PirPriority = 'low' | 'medium' | 'high' | 'critical';

export interface IntelRequirement {
  id: string;
  title: string;
  description: string;
  question: string;
  priority: PirPriority;
  status: PirStatus;
  category: string;
  stakeholders: string[];
  collection_sources: CollectionMapping[];
  coverage_score: number;
  last_fulfilled: string | null;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface CollectionMapping {
  source_id: string;
  source_name: string;
  coverage_level: 'full' | 'partial' | 'minimal';
  last_collected: string;
  quality_score: number;
}

export interface PirGap {
  requirement_id: string;
  requirement_title: string;
  gap_type: 'no-source' | 'stale-data' | 'low-quality' | 'partial-coverage';
  description: string;
  recommended_action: string;
}

export const INTEL_REQ_SCHEMA = `
CREATE TABLE IF NOT EXISTS intel_requirements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active',
  category TEXT NOT NULL DEFAULT 'general',
  stakeholders TEXT NOT NULL DEFAULT '[]',
  collection_sources TEXT NOT NULL DEFAULT '[]',
  coverage_score INTEGER NOT NULL DEFAULT 0,
  last_fulfilled TEXT,
  due_date TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  tags TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_intel_req_priority ON intel_requirements(priority);
CREATE INDEX IF NOT EXISTS idx_intel_req_status ON intel_requirements(status);
CREATE INDEX IF NOT EXISTS idx_intel_req_category ON intel_requirements(category);
`;

function genId(prefix: string): string { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

export async function createRequirement(db: D1Database, input: Omit<IntelRequirement, 'id' | 'created_at' | 'updated_at' | 'coverage_score'>): Promise<IntelRequirement> {
  const id = genId('pir');
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO intel_requirements (id, title, description, question, priority, status, category, stakeholders, collection_sources, due_date, created_by, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, input.title, input.description, input.question, input.priority, input.status ?? 'active', input.category, JSON.stringify(input.stakeholders), JSON.stringify(input.collection_sources), input.due_date, input.created_by, JSON.stringify(input.tags)).run();
  return { ...input, id, coverage_score: 0, created_at: now, updated_at: now };
}

export async function getRequirement(db: D1Database, id: string): Promise<IntelRequirement | null> {
  const row = await db.prepare('SELECT * FROM intel_requirements WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!row) return null;
  return parseIntelReq(row);
}

export async function listRequirements(db: D1Database, opts: { status?: PirStatus; priority?: PirPriority; limit?: number } = {}): Promise<IntelRequirement[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.status) { conditions.push('status = ?'); params.push(opts.status); }
  if (opts.priority) { conditions.push('priority = ?'); params.push(opts.priority); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.prepare(`SELECT * FROM intel_requirements ${where} ORDER BY priority DESC, updated_at DESC LIMIT ?`).bind(...params, opts.limit ?? 50).all();
  return (rows.results as Record<string, unknown>[]).map(parseIntelReq);
}

export async function updateRequirement(db: D1Database, id: string, updates: Partial<IntelRequirement>): Promise<IntelRequirement | null> {
  const fields: string[] = ['updated_at = datetime(\'now\')'];
  const values: unknown[] = [];
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.coverage_score !== undefined) { fields.push('coverage_score = ?'); values.push(updates.coverage_score); }
  if (updates.last_fulfilled !== undefined) { fields.push('last_fulfilled = ?'); values.push(updates.last_fulfilled); }
  values.push(id);
  await db.prepare(`UPDATE intel_requirements SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return getRequirement(db, id);
}

export function analyzeGaps(requirements: IntelRequirement[]): PirGap[] {
  const gaps: PirGap[] = [];
  for (const req of requirements) {
    if (req.status !== 'active') continue;
    if (req.collection_sources.length === 0) {
      gaps.push({ requirement_id: req.id, requirement_title: req.title, gap_type: 'no-source', description: 'No collection sources mapped', recommended_action: 'Map at least 2 intelligence sources to this requirement' });
    } else {
      const stale = req.collection_sources.filter((s) => { const age = Date.now() - new Date(s.last_collected).getTime(); return age > 7 * 24 * 60 * 60 * 1000; });
      if (stale.length > 0) {
        gaps.push({ requirement_id: req.id, requirement_title: req.title, gap_type: 'stale-data', description: `${stale.length} sources have data older than 7 days`, recommended_action: 'Increase collection frequency for stale sources' });
      }
      const lowQuality = req.collection_sources.filter((s) => s.quality_score < 50);
      if (lowQuality.length > 0) {
        gaps.push({ requirement_id: req.id, requirement_title: req.title, gap_type: 'low-quality', description: `${lowQuality.length} sources have quality score below 50%`, recommended_action: 'Evaluate and replace low-quality sources' });
      }
      if (req.coverage_score < 50) {
        gaps.push({ requirement_id: req.id, requirement_title: req.title, gap_type: 'partial-coverage', description: `Coverage score is only ${req.coverage_score}%`, recommended_action: 'Add more collection sources or improve existing coverage' });
      }
    }
  }
  return gaps;
}

function parseIntelReq(r: Record<string, unknown>): IntelRequirement {
  return { id: r.id as string, title: r.title as string, description: r.description as string, question: r.question as string, priority: r.priority as PirPriority, status: r.status as PirStatus, category: r.category as string, stakeholders: JSON.parse(r.stakeholders as string), collection_sources: JSON.parse(r.collection_sources as string), coverage_score: r.coverage_score as number, last_fulfilled: r.last_fulfilled as string | null, due_date: r.due_date as string | null, created_by: r.created_by as string, created_at: r.created_at as string, updated_at: r.updated_at as string, tags: JSON.parse(r.tags as string) };
}
