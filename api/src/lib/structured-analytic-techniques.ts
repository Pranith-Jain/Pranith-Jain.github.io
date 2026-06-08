/**
 * Structured Analytic Techniques (SATs) Engine
 *
 * Implements standard intelligence analysis methodologies:
 * ACH, Key Assumptions Check, Indicators Validator, Diagnostic Analysis,
 * Red Team Analysis, Timeline Analysis, etc.
 */

import type { D1Database } from '@cloudflare/workers-types';

export type SatType = 'ach' | 'key-assumptions' | 'indicators-validator' | 'diagnostic' | 'red-team' | 'timeline' | 'outside-in' | 'high-impact' | 'deception-detection' | 'argument-mapping';

export interface SatAnalysis {
  id: string;
  type: SatType;
  title: string;
  description: string;
  question: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  status: 'draft' | 'in-progress' | 'completed';
  data: Record<string, unknown>;
  conclusion: string;
  confidence: number;
}

// ACH specific types
export interface AchHypothesis {
  id: string;
  text: string;
  probability: number;
}

export interface AchEvidence {
  id: string;
  text: string;
  source: string;
  reliability: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  credibility: '1' | '2' | '3' | '4' | '5' | '6';
  assessments: Record<string, 'consistent' | 'inconsistent' | 'neutral' | 'not-applicable'>;
}

// Key Assumptions types
export interface Assumption {
  id: string;
  text: string;
  importance: 'high' | 'medium' | 'low';
  validity: 'solid' | 'probably-solid' | 'uncertain' | 'doubtful' | 'invalid';
  impact_if_wrong: string;
  evidence_for: string[];
  evidence_against: string[];
}

export const SAT_SCHEMA = `
CREATE TABLE IF NOT EXISTS sat_analyses (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'draft',
  data TEXT NOT NULL DEFAULT '{}',
  conclusion TEXT NOT NULL DEFAULT '',
  confidence INTEGER NOT NULL DEFAULT 50
);

CREATE INDEX IF NOT EXISTS idx_sat_type ON sat_analyses(type);
CREATE INDEX IF NOT EXISTS idx_sat_status ON sat_analyses(status);
`;

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createAnalysis(db: D1Database, input: Omit<SatAnalysis, 'id' | 'created_at' | 'updated_at'>): Promise<SatAnalysis> {
  const id = genId('sat');
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO sat_analyses (id, type, title, description, question, created_by, status, data, conclusion, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, input.type, input.title, input.description, input.question, input.created_by, input.status ?? 'draft', JSON.stringify(input.data), input.conclusion ?? '', input.confidence ?? 50).run();
  return { ...input, id, created_at: now, updated_at: now };
}

export async function getAnalysis(db: D1Database, id: string): Promise<SatAnalysis | null> {
  const row = await db.prepare('SELECT * FROM sat_analyses WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!row) return null;
  return parseSatAnalysis(row);
}

export async function listAnalyses(db: D1Database, type?: SatType): Promise<SatAnalysis[]> {
  const where = type ? 'WHERE type = ?' : '';
  const params = type ? [type] : [];
  const rows = await db.prepare(`SELECT * FROM sat_analyses ${where} ORDER BY updated_at DESC LIMIT 100`).bind(...params).all();
  return (rows.results as Record<string, unknown>[]).map(parseSatAnalysis);
}

export async function updateAnalysis(db: D1Database, id: string, updates: Partial<SatAnalysis>): Promise<SatAnalysis | null> {
  const fields: string[] = ['updated_at = datetime(\'now\')'];
  const values: unknown[] = [];
  if (updates.data !== undefined) { fields.push('data = ?'); values.push(JSON.stringify(updates.data)); }
  if (updates.conclusion !== undefined) { fields.push('conclusion = ?'); values.push(updates.conclusion); }
  if (updates.confidence !== undefined) { fields.push('confidence = ?'); values.push(updates.confidence); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  values.push(id);
  await db.prepare(`UPDATE sat_analyses SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return getAnalysis(db, id);
}

/** ACH scoring matrix — calculates weighted inconsistency scores */
export function calculateAchScores(hypotheses: AchHypothesis[], evidence: AchEvidence[]): Record<string, number> {
  const weights: Record<string, number> = { A: 1, B: 0.8, C: 0.6, D: 0.4, E: 0.2, F: 0.1 };
  const scores: Record<string, number> = {};
  for (const h of hypotheses) scores[h.id] = 0;
  for (const e of evidence) {
    const weight = weights[e.reliability] ?? 0.5;
    for (const h of hypotheses) {
      const assessment = e.assessments[h.id];
      if (assessment === 'inconsistent') scores[h.id] += weight * 2;
      else if (assessment === 'consistent') scores[h.id] -= weight;
    }
  }
  return scores;
}

function parseSatAnalysis(r: Record<string, unknown>): SatAnalysis {
  return {
    id: r.id as string, type: r.type as SatType, title: r.title as string,
    description: r.description as string, question: r.question as string,
    created_by: r.created_by as string, created_at: r.created_at as string,
    updated_at: r.updated_at as string, status: r.status as SatAnalysis['status'],
    data: JSON.parse(r.data as string), conclusion: r.conclusion as string,
    confidence: r.confidence as number,
  };
}
