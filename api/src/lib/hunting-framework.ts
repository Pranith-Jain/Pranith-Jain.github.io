/**
 * Hypothesis-Driven Threat Hunting Framework
 *
 * Structured hunting workflow: hypothesis → data requirements →
 * query → analysis → findings → mapping to kill chain.
 */

import type { D1Database } from '@cloudflare/workers-types';

export type HuntStatus = 'draft' | 'approved' | 'hunting' | 'completed' | 'archived';
export type HuntPriority = 'low' | 'medium' | 'high' | 'critical';
export type FindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface Hunt {
  id: string;
  title: string;
  hypothesis: string;
  description: string;
  status: HuntStatus;
  priority: HuntPriority;
  kill_chain_phase: string;
  mitre_techniques: string[];
  data_sources: string[];
  query: string;
  query_language: 'kql' | 'sigma' | 'spl' | 'yara' | 'sql' | 'custom';
  assigned_to: string;
  created_by: string;
  started_at: string | null;
  completed_at: string | null;
  findings_count: number;
  true_positives: number;
  false_positives: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface HuntFinding {
  id: string;
  hunt_id: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  iocs: string[];
  mitre_techniques: string[];
  affected_assets: string[];
  evidence: string;
  analyst_notes: string;
  is_true_positive: boolean | null;
  created_at: string;
}

export interface HuntTemplate {
  id: string;
  name: string;
  category: string;
  hypothesis_template: string;
  data_sources: string[];
  suggested_queries: Array<{ language: string; query: string }>;
  mitre_techniques: string[];
  kill_chain_phase: string;
}

export const HUNT_SCHEMA = `
CREATE TABLE IF NOT EXISTS hunts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  priority TEXT NOT NULL DEFAULT 'medium',
  kill_chain_phase TEXT NOT NULL DEFAULT '',
  mitre_techniques TEXT NOT NULL DEFAULT '[]',
  data_sources TEXT NOT NULL DEFAULT '[]',
  query TEXT NOT NULL DEFAULT '',
  query_language TEXT NOT NULL DEFAULT 'custom',
  assigned_to TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  findings_count INTEGER NOT NULL DEFAULT 0,
  true_positives INTEGER NOT NULL DEFAULT 0,
  false_positives INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hunt_findings (
  id TEXT PRIMARY KEY,
  hunt_id TEXT NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'info',
  iocs TEXT NOT NULL DEFAULT '[]',
  mitre_techniques TEXT NOT NULL DEFAULT '[]',
  affected_assets TEXT NOT NULL DEFAULT '[]',
  evidence TEXT NOT NULL DEFAULT '',
  analyst_notes TEXT NOT NULL DEFAULT '',
  is_true_positive INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hunts_status ON hunts(status);
CREATE INDEX IF NOT EXISTS idx_hunts_priority ON hunts(priority);
CREATE INDEX IF NOT EXISTS idx_hunt_findings_hunt ON hunt_findings(hunt_id);
`;

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createHunt(db: D1Database, input: Omit<Hunt, 'id' | 'created_at' | 'updated_at' | 'findings_count' | 'true_positives' | 'false_positives'>): Promise<Hunt> {
  const id = genId('hunt');
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO hunts (id, title, hypothesis, description, status, priority, kill_chain_phase, mitre_techniques, data_sources, query, query_language, assigned_to, created_by, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.title, input.hypothesis, input.description, input.status ?? 'draft', input.priority, input.kill_chain_phase, JSON.stringify(input.mitre_techniques), JSON.stringify(input.data_sources), input.query, input.query_language, input.assigned_to, input.created_by, JSON.stringify(input.tags)).run();
  return getHunt(db, id) as Promise<Hunt>;
}

export async function getHunt(db: D1Database, id: string): Promise<Hunt | null> {
  const row = await db.prepare('SELECT * FROM hunts WHERE id = ?').bind(id).first() as Record<string, unknown> | null;
  if (!row) return null;
  return parseHunt(row);
}

export async function listHunts(db: D1Database, opts: { status?: HuntStatus; limit?: number; offset?: number } = {}): Promise<{ hunts: Hunt[]; total: number }> {
  const where = opts.status ? 'WHERE status = ?' : '';
  const params = opts.status ? [opts.status] : [];
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const [countResult, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM hunts ${where}`).bind(...params).first() as Promise<{ total: number }>,
    db.prepare(`SELECT * FROM hunts ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all(),
  ]);
  return { hunts: (rows.results as Record<string, unknown>[]).map(parseHunt), total: countResult.total };
}

export async function updateHunt(db: D1Database, id: string, updates: Partial<Hunt>): Promise<Hunt | null> {
  const fields: string[] = ['updated_at = datetime(\'now\')'];
  const values: unknown[] = [];
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); if (updates.status === 'hunting' && !updates.started_at) fields.push('started_at = datetime(\'now\')'); if (updates.status === 'completed') fields.push('completed_at = datetime(\'now\')'); }
  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.hypothesis !== undefined) { fields.push('hypothesis = ?'); values.push(updates.hypothesis); }
  if (updates.findings_count !== undefined) { fields.push('findings_count = ?'); values.push(updates.findings_count); }
  if (updates.true_positives !== undefined) { fields.push('true_positives = ?'); values.push(updates.true_positives); }
  if (updates.false_positives !== undefined) { fields.push('false_positives = ?'); values.push(updates.false_positives); }
  values.push(id);
  await db.prepare(`UPDATE hunts SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return getHunt(db, id);
}

export async function addFinding(db: D1Database, huntId: string, input: Omit<HuntFinding, 'id' | 'hunt_id' | 'created_at'>): Promise<HuntFinding> {
  const id = genId('find');
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO hunt_findings (id, hunt_id, title, description, severity, iocs, mitre_techniques, affected_assets, evidence, analyst_notes, is_true_positive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, huntId, input.title, input.description, input.severity, JSON.stringify(input.iocs), JSON.stringify(input.mitre_techniques), JSON.stringify(input.affected_assets), input.evidence, input.analyst_notes, input.is_true_positive === null ? null : (input.is_true_positive ? 1 : 0)).run();
  await db.prepare('UPDATE hunts SET findings_count = findings_count + 1, updated_at = datetime(\'now\') WHERE id = ?').bind(huntId).run();
  return { id, hunt_id: huntId, ...input, created_at: now };
}

export async function getHuntFindings(db: D1Database, huntId: string): Promise<HuntFinding[]> {
  const rows = await db.prepare('SELECT * FROM hunt_findings WHERE hunt_id = ? ORDER BY created_at DESC').bind(huntId).all();
  return (rows.results as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, hunt_id: r.hunt_id as string, title: r.title as string, description: r.description as string,
    severity: r.severity as FindingSeverity, iocs: JSON.parse(r.iocs as string), mitre_techniques: JSON.parse(r.mitre_techniques as string),
    affected_assets: JSON.parse(r.affected_assets as string), evidence: r.evidence as string, analyst_notes: r.analyst_notes as string,
    is_true_positive: r.is_true_positive === null ? null : (r.is_true_positive as number) === 1, created_at: r.created_at as string,
  }));
}

export const HUNT_TEMPLATES: HuntTemplate[] = [
  { id: 'lateral-movement', name: 'Lateral Movement Detection', category: 'detection', hypothesis_template: 'An adversary has gained initial access and is moving laterally using {technique}', data_sources: ['windows-security-logs', 'network-flow', 'authentication-logs'], suggested_queries: [{ language: 'kql', query: 'SecurityEvent | where EventID == 4624 | where LogonType == 3 | summarize count() by IpAddress, TargetUserName | where count_ > threshold' }], mitre_techniques: ['T1021', 'T1047', 'T1077'], kill_chain_phase: 'lateral-movement' },
  { id: 'c2-beacon', name: 'C2 Beacon Detection', category: 'detection', hypothesis_template: 'A compromised host is beaconing to a C2 server at regular intervals', data_sources: ['network-flow', 'dns-logs', 'proxy-logs'], suggested_queries: [{ language: 'kql', query: 'NetworkFlow | summarize StdDev=stdev(TimeDiff), AvgInterval=avg(TimeDiff) by SrcIp, DstIp | where StdDev < 10' }], mitre_techniques: ['T1071', 'T1573', 'T1572'], kill_chain-phase: 'command-and-control' },
  { id: 'data-exfil', name: 'Data Exfiltration Detection', category: 'detection', hypothesis_template: 'Sensitive data is being exfiltrated via {channel}', data_sources: ['dlp-logs', 'network-flow', 'proxy-logs'], suggested_queries: [{ language: 'kql', query: 'NetworkFlow | where BytesOut > 10000000 | summarize TotalBytes=sum(BytesOut) by SrcIp | where TotalBytes > threshold' }], mitre_techniques: ['T1041', 'T1048', 'T1567'], kill_chain_phase: 'exfiltration' },
  { id: 'credential-dump', name: 'Credential Dumping', category: 'detection', hypothesis_template: 'An adversary is dumping credentials from {system}', data_sources: ['windows-security-logs', 'sysmon', 'edr-telemetry'], suggested_queries: [{ language: 'kql', query: 'Sysmon | where EventID == 10 | where TargetImage contains "lsass" | where SourceImage !in ("known_legitimate")' }], mitre_techniques: ['T1003', 'T1003.001', 'T1003.002'], kill_chain-phase: 'credential-access' },
  { id: 'persistence', name: 'Persistence Mechanism', category: 'detection', hypothesis_template: 'An adversary has established persistence via {mechanism}', data_sources: ['windows-registry', 'scheduled-tasks', 'startup-items'], suggested_queries: [{ language: 'kql', query: 'RegistryEvents | where EventType == "SetValue" | where TargetObject contains "CurrentVersion\\\\Run"' }], mitre_techniques: ['T1547', 'T1547.001', 'T1053'], kill_chain_phase: 'persistence' },
  { id: 'supply-chain', name: 'Supply Chain Compromise', category: 'threat', hypothesis_template: 'A third-party dependency or vendor has been compromised', data_sources: ['dependency-audit', 'network-flow', 'authentication-logs'], suggested_queries: [{ language: 'custom', query: 'Review recent dependency updates for anomalous behavior patterns' }], mitre_techniques: ['T1195', 'T1195.002'], kill_chain_phase: 'initial-access' },
];

function parseHunt(r: Record<string, unknown>): Hunt {
  return {
    id: r.id as string, title: r.title as string, hypothesis: r.hypothesis as string, description: r.description as string,
    status: r.status as HuntStatus, priority: r.priority as HuntPriority, kill_chain_phase: r.kill_chain_phase as string,
    mitre_techniques: JSON.parse(r.mitre_techniques as string), data_sources: JSON.parse(r.data_sources as string),
    query: r.query as string, query_language: r.query_language as Hunt['query_language'],
    assigned_to: r.assigned_to as string, created_by: r.created_by as string,
    started_at: r.started_at as string | null, completed_at: r.completed_at as string | null,
    findings_count: r.findings_count as number, true_positives: r.true_positives as number,
    false_positives: r.false_positives as number, tags: JSON.parse(r.tags as string),
    created_at: r.created_at as string, updated_at: r.updated_at as string,
  };
}
