/**
 * Deception Technology — Canary Tokens & Honeypot Management
 *
 * Generate canary tokens (DNS, web, document, AWS keys), manage
 * honeypot feeds, and correlate deception alerts with IOC data.
 * All open-source, no paid services.
 */

import type { D1Database } from '@cloudflare/workers-types';

export type CanaryType = 'dns' | 'web' | 'document' | 'aws-key' | 'sql-connection' | 'windows-share' | 'svn' | 'smtp' | 'custom';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CanaryToken {
  id: string;
  type: CanaryType;
  name: string;
  description: string;
  token_value: string;
  /** Where the token was planted */
  planted_in: string;
  /** Who planted it */
  planted_by: string;
  /** Callback URL for alerting */
  callback_url: string;
  is_active: boolean;
  created_at: string;
  last_triggered: string | null;
  trigger_count: number;
  tags: string[];
}

export interface CanaryAlert {
  id: string;
  token_id: string;
  token_type: CanaryType;
  token_name: string;
  severity: AlertSeverity;
  source_ip: string;
  source_info: string;
  user_agent: string;
  triggered_at: string;
  details: Record<string, unknown>;
  acknowledged: boolean;
  acknowledged_by: string | null;
  correlated_iocs: string[];
}

export interface HoneypotFeed {
  id: string;
  name: string;
  type: 'ssh' | 'http' | 'smtp' | 'rdp' | 'smb' | 'telnet' | 'custom';
  endpoint: string;
  is_active: boolean;
  interaction_count: number;
  last_interaction: string | null;
  captured_credentials: Array<{ username: string; password: string; source_ip: string; timestamp: string }>;
  captured_iocs: string[];
  created_at: string;
}

export const DECEPTION_SCHEMA = `
CREATE TABLE IF NOT EXISTS canary_tokens (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  token_value TEXT NOT NULL,
  planted_in TEXT NOT NULL DEFAULT '',
  planted_by TEXT NOT NULL,
  callback_url TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_triggered TEXT,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS canary_alerts (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL REFERENCES canary_tokens(id) ON DELETE CASCADE,
  token_type TEXT NOT NULL,
  token_name TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'high',
  source_ip TEXT NOT NULL DEFAULT '',
  source_info TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
  details TEXT NOT NULL DEFAULT '{}',
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_by TEXT,
  correlated_iocs TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS honeypot_feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'ssh',
  endpoint TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  last_interaction TEXT,
  captured_credentials TEXT NOT NULL DEFAULT '[]',
  captured_iocs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_canary_alerts_token ON canary_alerts(token_id);
CREATE INDEX IF NOT EXISTS idx_canary_alerts_time ON canary_alerts(triggered_at);
CREATE INDEX IF NOT EXISTS idx_canary_tokens_active ON canary_tokens(is_active);
`;

function genId(prefix: string): string { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

/** Generate a canary token value based on type */
export function generateCanaryValue(type: CanaryType, domain?: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  switch (type) {
    case 'dns': return `${rand}.${domain ?? 'canary.example.com'}`;
    case 'web': return `https://${domain ?? 'canary.example.com'}/${rand}`;
    case 'aws-key': return `AKIA${rand.toUpperCase()}${rand.toUpperCase()}`;
    case 'document': return `canary_${rand}`;
    default: return rand;
  }
}

export async function createCanaryToken(db: D1Database, input: Omit<CanaryToken, 'id' | 'created_at' | 'last_triggered' | 'trigger_count'>): Promise<CanaryToken> {
  const id = genId('canary');
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO canary_tokens (id, type, name, description, token_value, planted_in, planted_by, callback_url, is_active, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, input.type, input.name, input.description, input.token_value, input.planted_in, input.planted_by, input.callback_url, input.is_active ? 1 : 0, JSON.stringify(input.tags)).run();
  return { ...input, id, created_at: now, last_triggered: null, trigger_count: 0 };
}

export async function listCanaryTokens(db: D1Database, activeOnly = true): Promise<CanaryToken[]> {
  const where = activeOnly ? 'WHERE is_active = 1' : '';
  const rows = await db.prepare(`SELECT * FROM canary_tokens ${where} ORDER BY created_at DESC`).all();
  return (rows.results as Record<string, unknown>[]).map(parseCanaryToken);
}

export async function triggerCanaryAlert(db: D1Database, tokenId: string, sourceIp: string, userAgent: string, details: Record<string, unknown> = {}): Promise<CanaryAlert> {
  const token = await db.prepare('SELECT * FROM canary_tokens WHERE id = ?').bind(tokenId).first() as Record<string, unknown> | null;
  if (!token) throw new Error('Canary token not found');

  const id = genId('alert');
  const now = new Date().toISOString();
  const severity: AlertSeverity = token.type === 'aws-key' ? 'critical' : token.type === 'document' ? 'high' : 'medium';

  await db.prepare(
    'INSERT INTO canary_alerts (id, token_id, token_type, token_name, severity, source_ip, user_agent, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, tokenId, token.type, token.name, severity, sourceIp, userAgent, JSON.stringify(details)).run();

  await db.prepare('UPDATE canary_tokens SET last_triggered = ?, trigger_count = trigger_count + 1 WHERE id = ?').bind(now, tokenId).run();

  return { id, token_id: tokenId, token_type: token.type as CanaryType, token_name: token.name as string, severity, source_ip: sourceIp, source_info: '', user_agent: userAgent, triggered_at: now, details, acknowledged: false, acknowledged_by: null, correlated_iocs: [] };
}

export async function listCanaryAlerts(db: D1Database, limit = 50): Promise<CanaryAlert[]> {
  const rows = await db.prepare('SELECT * FROM canary_alerts ORDER BY triggered_at DESC LIMIT ?').bind(limit).all();
  return (rows.results as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, token_id: r.token_id as string, token_type: r.token_type as CanaryType, token_name: r.token_name as string,
    severity: r.severity as AlertSeverity, source_ip: r.source_ip as string, source_info: r.source_info as string,
    user_agent: r.user_agent as string, triggered_at: r.triggered_at as string, details: JSON.parse(r.details as string),
    acknowledged: (r.acknowledged as number) === 1, acknowledged_by: r.acknowledged_by as string | null,
    correlated_iocs: JSON.parse(r.correlated_iocs as string),
  }));
}

export async function acknowledgeAlert(db: D1Database, alertId: string, analyst: string): Promise<boolean> {
  const result = await db.prepare('UPDATE canary_alerts SET acknowledged = 1, acknowledged_by = ? WHERE id = ?').bind(analyst, alertId).run();
  return (result.meta?.changes ?? 0) > 0;
}

function parseCanaryToken(r: Record<string, unknown>): CanaryToken {
  return { id: r.id as string, type: r.type as CanaryType, name: r.name as string, description: r.description as string, token_value: r.token_value as string, planted_in: r.planted_in as string, planted_by: r.planted_by as string, callback_url: r.callback_url as string, is_active: (r.is_active as number) === 1, created_at: r.created_at as string, last_triggered: r.last_triggered as string | null, trigger_count: r.trigger_count as number, tags: JSON.parse(r.tags as string) };
}
