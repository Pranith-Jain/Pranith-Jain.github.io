/**
 * Threat Modeling Engine
 *
 * STRIDE/PASTA threat models, attack surface inventory,
 * threat-to-asset mapping, and MITRE coverage analysis.
 */

import type { D1Database } from '@cloudflare/workers-types';

export type ThreatModelMethod = 'stride' | 'pasta' | 'attack-tree' | 'linndun' | 'vast';
export type ThreatCategory = 'spoofing' | 'tampering' | 'repudiation' | 'information-disclosure' | 'denial-of-service' | 'elevation-of-privilege' | 'other';
export type RiskLevel = 'negligible' | 'low' | 'medium' | 'high' | 'critical';

export interface ThreatModel {
  id: string;
  name: string;
  description: string;
  method: ThreatModelMethod;
  scope: string;
  assets: Asset[];
  threats: Threat[];
  mitigations: Mitigation[];
  coverage: CoverageGap[];
  created_by: string;
  created_at: string;
  updated_at: string;
  status: 'draft' | 'review' | 'approved' | 'archived';
}

export interface Asset {
  id: string;
  name: string;
  type: 'server' | 'workstation' | 'network' | 'application' | 'data' | 'cloud' | 'iot' | 'person';
  criticality: 'low' | 'medium' | 'high' | 'critical';
  data_classification: 'public' | 'internal' | 'confidential' | 'restricted';
  owner: string;
  description: string;
  attack_surface: string[];
}

export interface Threat {
  id: string;
  asset_id: string;
  category: ThreatCategory;
  description: string;
  stride_category: string;
  likelihood: 1 | 2 | 3 | 4 | 5;
  impact: 1 | 2 | 3 | 4 | 5;
  risk_score: number;
  mitre_techniques: string[];
  status: 'identified' | 'mitigated' | 'accepted' | 'transferred';
}

export interface Mitigation {
  id: string;
  threat_id: string;
  description: string;
  type: 'preventive' | 'detective' | 'corrective';
  implementation_status: 'planned' | 'in-progress' | 'implemented' | 'verified';
  cost: 'low' | 'medium' | 'high';
  effectiveness: 1 | 2 | 3 | 4 | 5;
}

export interface CoverageGap {
  mitre_technique: string;
  technique_name: string;
  detection_count: number;
  mitigation_count: number;
  gap_severity: RiskLevel;
}

export const THREAT_MODEL_SCHEMA = `
CREATE TABLE IF NOT EXISTS threat_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'stride',
  scope TEXT NOT NULL DEFAULT '',
  assets TEXT NOT NULL DEFAULT '[]',
  threats TEXT NOT NULL DEFAULT '[]',
  mitigations TEXT NOT NULL DEFAULT '[]',
  coverage TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'draft'
);

CREATE INDEX IF NOT EXISTS idx_threat_models_status ON threat_models(status);
`;

function genId(prefix: string): string { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

export function calculateRiskScore(likelihood: number, impact: number): number {
  return Math.min(25, likelihood * impact);
}

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 20) return 'critical';
  if (score >= 15) return 'high';
  if (score >= 10) return 'medium';
  if (score >= 5) return 'low';
  return 'negligible';
}

export function strideCategories(): ThreatCategory[] {
  return ['spoofing', 'tampering', 'repudiation', 'information-disclosure', 'denial-of-service', 'elevation-of-privilege'];
}

export async function createThreatModel(db: D1Database, input: Omit<ThreatModel, 'id' | 'created_at' | 'updated_at'>): Promise<ThreatModel> {
  const id = genId('tm');
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO threat_models (id, name, description, method, scope, assets, threats, mitigations, coverage, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, input.name, input.description, input.method, input.scope, JSON.stringify(input.assets), JSON.stringify(input.threats), JSON.stringify(input.mitigations), JSON.stringify(input.coverage), input.created_by, input.status ?? 'draft').run();
  return { ...input, id, created_at: now, updated_at: now };
}

export async function getThreatModel(db: D1Database, id: string): Promise<ThreatModel | null> {
  const row = await db.prepare('SELECT * FROM threat_models WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!row) return null;
  return { id: row.id as string, name: row.name as string, description: row.description as string, method: row.method as ThreatModelMethod, scope: row.scope as string, assets: JSON.parse(row.assets as string), threats: JSON.parse(row.threats as string), mitigations: JSON.parse(row.mitigations as string), coverage: JSON.parse(row.coverage as string), created_by: row.created_by as string, created_at: row.created_at as string, updated_at: row.updated_at as string, status: row.status as ThreatModel['status'] };
}

export async function listThreatModels(db: D1Database): Promise<ThreatModel[]> {
  const rows = await db.prepare('SELECT * FROM threat_models ORDER BY updated_at DESC LIMIT 50').all();
  return (rows.results as Record<string, unknown>[]).map((row) => ({ id: row.id as string, name: row.name as string, description: row.description as string, method: row.method as ThreatModelMethod, scope: row.scope as string, assets: JSON.parse(row.assets as string), threats: JSON.parse(row.threats as string), mitigations: JSON.parse(row.mitigations as string), coverage: JSON.parse(row.coverage as string), created_by: row.created_by as string, created_at: row.created_at as string, updated_at: row.updated_at as string, status: row.status as ThreatModel['status'] }));
}

export async function updateThreatModel(db: D1Database, id: string, updates: Partial<ThreatModel>): Promise<ThreatModel | null> {
  const fields: string[] = ['updated_at = datetime(\'now\')'];
  const values: unknown[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.assets !== undefined) { fields.push('assets = ?'); values.push(JSON.stringify(updates.assets)); }
  if (updates.threats !== undefined) { fields.push('threats = ?'); values.push(JSON.stringify(updates.threats)); }
  if (updates.mitigations !== undefined) { fields.push('mitigations = ?'); values.push(JSON.stringify(updates.mitigations)); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  values.push(id);
  await db.prepare(`UPDATE threat_models SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return getThreatModel(db, id);
}
