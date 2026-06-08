/**
 * Detection-as-Code Pipeline
 *
 * Version-controlled detection rules with testing, validation,
 * coverage mapping, and deployment pipeline.
 */

import type { D1Database } from '@cloudflare/workers-types';

export type RuleFormat = 'sigma' | 'yara' | 'snort' | 'suricata' | 'kql' | 'spl' | 'custom';
export type RuleStatus = 'draft' | 'testing' | 'staging' | 'production' | 'disabled' | 'deprecated';
export type ValidationResult = 'valid' | 'warning' | 'error';

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  format: RuleFormat;
  rule_text: string;
  status: RuleStatus;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitre_techniques: string[];
  false_positive_rate: number;
  true_positive_count: number;
  test_results: TestResult[];
  version: number;
  changelog: ChangelogEntry[];
  coverage_gaps: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface TestResult {
  id: string;
  test_name: string;
  input_data: string;
  expected_match: boolean;
  actual_match: boolean;
  passed: boolean;
  executed_at: string;
  duration_ms: number;
}

export interface ChangelogEntry {
  version: number;
  changes: string;
  author: string;
  timestamp: string;
}

export interface CoverageReport {
  total_techniques: number;
  covered_techniques: number;
  coverage_percentage: number;
  gaps: Array<{ technique_id: string; technique_name: string; rule_count: number }>;
  by_format: Record<RuleFormat, number>;
  by_status: Record<RuleStatus, number>;
}

export const DETECTION_CODE_SCHEMA = `
CREATE TABLE IF NOT EXISTS detection_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'sigma',
  rule_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  severity TEXT NOT NULL DEFAULT 'medium',
  mitre_techniques TEXT NOT NULL DEFAULT '[]',
  false_positive_rate REAL NOT NULL DEFAULT 0,
  true_positive_count INTEGER NOT NULL DEFAULT 0,
  test_results TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  changelog TEXT NOT NULL DEFAULT '[]',
  coverage_gaps TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  tags TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS detection_deployments (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES detection_rules(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'production',
  deployed_by TEXT NOT NULL,
  deployed_at TEXT NOT NULL DEFAULT (datetime('now')),
  rolled_back INTEGER NOT NULL DEFAULT 0,
  rollback_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_det_rules_format ON detection_rules(format);
CREATE INDEX IF NOT EXISTS idx_det_rules_status ON detection_rules(status);
CREATE INDEX IF NOT EXISTS idx_det_rules_severity ON detection_rules(severity);
CREATE INDEX IF NOT EXISTS idx_det_deploy_rule ON detection_deployments(rule_id);
`;

function genId(prefix: string): string { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

export function validateSigmaSyntax(ruleText: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  if (!ruleText.includes('title:')) results.push({ result: 'error', message: 'Missing title field' });
  if (!ruleText.includes('detection:')) results.push({ result: 'error', message: 'Missing detection section' });
  if (!ruleText.includes('condition:')) results.push({ result: 'warning', message: 'No condition specified' });
  if (ruleText.length < 50) results.push({ result: 'warning', message: 'Rule seems too short' });
  return results;
}

export function validateYaraSyntax(ruleText: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  if (!ruleText.includes('rule ')) results.push({ result: 'error', message: 'Missing rule declaration' });
  if (!ruleText.includes('condition:')) results.push({ result: 'error', message: 'Missing condition section' });
  if (!ruleText.includes('strings:')) results.push({ result: 'warning', message: 'No strings section' });
  return results;
}

export async function createRule(db: D1Database, input: Omit<DetectionRule, 'id' | 'created_at' | 'updated_at' | 'version' | 'changelog' | 'test_results' | 'true_positive_count' | 'false_positive_rate' | 'coverage_gaps'>): Promise<DetectionRule> {
  const id = genId('rule');
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO detection_rules (id, name, description, format, rule_text, status, severity, mitre_techniques, created_by, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, input.name, input.description, input.format, input.rule_text, input.status ?? 'draft', input.severity, JSON.stringify(input.mitre_techniques), input.created_by, JSON.stringify(input.tags)).run();
  return getRule(db, id) as Promise<DetectionRule>;
}

export async function getRule(db: D1Database, id: string): Promise<DetectionRule | null> {
  const row = await db.prepare('SELECT * FROM detection_rules WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!row) return null;
  return parseDetectionRule(row);
}

export async function listRules(db: D1Database, opts: { format?: RuleFormat; status?: RuleStatus; limit?: number } = {}): Promise<DetectionRule[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.format) { conditions.push('format = ?'); params.push(opts.format); }
  if (opts.status) { conditions.push('status = ?'); params.push(opts.status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await db.prepare(`SELECT * FROM detection_rules ${where} ORDER BY updated_at DESC LIMIT ?`).bind(...params, opts.limit ?? 100).all();
  return (rows.results as Record<string, unknown>[]).map(parseDetectionRule);
}

export async function updateRule(db: D1Database, id: string, updates: Partial<DetectionRule>): Promise<DetectionRule | null> {
  const fields: string[] = ['updated_at = datetime(\'now\')'];
  const values: unknown[] = [];
  if (updates.rule_text !== undefined) { fields.push('rule_text = ?'); values.push(updates.rule_text); fields.push('version = version + 1'); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.severity !== undefined) { fields.push('severity = ?'); values.push(updates.severity); }
  if (updates.mitre_techniques !== undefined) { fields.push('mitre_techniques = ?'); values.push(JSON.stringify(updates.mitre_techniques)); }
  values.push(id);
  await db.prepare(`UPDATE detection_rules SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return getRule(db, id);
}

export async function deployRule(db: D1Database, ruleId: string, environment: string, deployedBy: string): Promise<void> {
  const id = genId('deploy');
  await db.prepare('INSERT INTO detection_deployments (id, rule_id, environment, deployed_by) VALUES (?, ?, ?, ?)').bind(id, ruleId, environment, deployedBy).run();
  await db.prepare("UPDATE detection_rules SET status = 'production', updated_at = datetime('now') WHERE id = ?").bind(ruleId).run();
}

export async function generateCoverageReport(db: D1Database): Promise<CoverageReport> {
  const rules = await listRules(db, { status: 'production' });
  const allTechniques = new Set<string>();
  const coveredTechniques = new Set<string>();
  const byFormat: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const rule of rules) {
    for (const t of rule.mitre_techniques) coveredTechniques.add(t);
    byFormat[rule.format] = (byFormat[rule.format] || 0) + 1;
    byStatus[rule.status] = (byStatus[rule.status] || 0) + 1;
  }

  // Common MITRE techniques to check coverage against
  const commonTechniques = ['T1059', 'T1071', 'T1053', 'T1547', 'T1003', 'T1021', 'T1047', 'T1566', 'T1486', 'T1078', 'T1048', 'T1071.001', 'T1059.001', 'T1566.001', 'T1566.002'];
  for (const t of commonTechniques) allTechniques.add(t);
  for (const t of coveredTechniques) allTechniques.add(t);

  const gaps = Array.from(allTechniques).filter((t) => !coveredTechniques.has(t)).map((t) => ({ technique_id: t, technique_name: t, rule_count: 0 }));

  return {
    total_techniques: allTechniques.size,
    covered_techniques: coveredTechniques.size,
    coverage_percentage: allTechniques.size > 0 ? Math.round((coveredTechniques.size / allTechniques.size) * 100) : 0,
    gaps,
    by_format: byFormat as Record<RuleFormat, number>,
    by_status: byStatus as Record<RuleStatus, number>,
  };
}

function parseDetectionRule(r: Record<string, unknown>): DetectionRule {
  return {
    id: r.id as string, name: r.name as string, description: r.description as string,
    format: r.format as RuleFormat, rule_text: r.rule_text as string, status: r.status as RuleStatus,
    severity: r.severity as DetectionRule['severity'], mitre_techniques: JSON.parse(r.mitre_techniques as string),
    false_positive_rate: r.false_positive_rate as number, true_positive_count: r.true_positive_count as number,
    test_results: JSON.parse(r.test_results as string), version: r.version as number,
    changelog: JSON.parse(r.changelog as string), coverage_gaps: JSON.parse(r.coverage_gaps as string),
    created_by: r.created_by as string, created_at: r.created_at as string, updated_at: r.updated_at as string,
    tags: JSON.parse(r.tags as string),
  };
}
