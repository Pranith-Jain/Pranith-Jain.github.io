/**
 * DFIR Case Management System
 *
 * Core incident response case tracking with evidence chain-of-custody,
 * analyst assignment, timeline reconstruction, and status workflow.
 *
 * Storage: D1 (persistent relational data)
 */

import type { D1Database } from '@cloudflare/workers-types';

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type CaseStatus = 'open' | 'triaging' | 'investigating' | 'containing' | 'eradicating' | 'recovering' | 'closed';
export type CaseSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CaseType =
  | 'ransomware'
  | 'bec'
  | 'data-breach'
  | 'malware'
  | 'phishing'
  | 'insider-threat'
  | 'apt'
  | 'ddos'
  | 'supply-chain'
  | 'other';
export type EvidenceType =
  | 'disk-image'
  | 'memory-dump'
  | 'pcap'
  | 'log-file'
  | 'malware-sample'
  | 'screenshot'
  | 'document'
  | 'email'
  | 'ioc-list'
  | 'other';
export type TLPLevel = 'white' | 'green' | 'amber' | 'red';

export interface Case {
  id: string;
  title: string;
  description: string;
  status: CaseStatus;
  severity: CaseSeverity;
  type: CaseType;
  tlp: TLPLevel;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  incident_date: string | null;
  tags: string[];
  mitre_techniques: string[];
  affected_assets: string[];
  threat_actors: string[];
  summary: string | null;
}

export interface Evidence {
  id: string;
  case_id: string;
  name: string;
  description: string;
  type: EvidenceType;
  file_url: string | null;
  file_hash: string | null;
  file_size: number | null;
  collected_by: string;
  collected_at: string;
  chain_of_custody: CustodyEntry[];
  tags: string[];
  tlp: TLPLevel;
}

export interface CustodyEntry {
  action: 'collected' | 'transferred' | 'analyzed' | 'stored' | 'returned' | 'destroyed';
  by: string;
  at: string;
  notes: string;
}

export interface CaseTimelineEvent {
  id: string;
  case_id: string;
  timestamp: string;
  event_type:
    | 'detection'
    | 'triage'
    | 'containment'
    | 'eradication'
    | 'recovery'
    | 'communication'
    | 'evidence'
    | 'finding'
    | 'action'
    | 'note';
  title: string;
  description: string;
  analyst: string;
  iocs: string[];
  mitre_techniques: string[];
  evidence_refs: string[];
  created_at: string;
}

export interface CaseNote {
  id: string;
  case_id: string;
  author: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaseIOC {
  id: string;
  case_id: string;
  indicator_type:
    | 'ip'
    | 'domain'
    | 'url'
    | 'hash-md5'
    | 'hash-sha1'
    | 'hash-sha256'
    | 'email'
    | 'filename'
    | 'registry'
    | 'mutex'
    | 'yara';
  value: string;
  confidence: number;
  source: string;
  first_seen: string;
  last_seen: string;
  status: 'active' | 'expired' | 'false-positive' | 'whitelisted';
  tags: string[];
  notes: string;
}

export interface CreateCaseInput {
  title: string;
  description: string;
  severity: CaseSeverity;
  type: CaseType;
  tlp?: TLPLevel;
  assigned_to?: string;
  incident_date?: string;
  tags?: string[];
  mitre_techniques?: string[];
  affected_assets?: string[];
  threat_actors?: string[];
}

export interface CaseStats {
  total: number;
  open: number;
  investigating: number;
  closed: number;
  avg_resolution_hours: number;
  by_severity: Record<CaseSeverity, number>;
  by_type: Record<CaseType, number>;
}

/* ─── Database Schema ────────────────────────────────────────────────────── */

export const CASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','triaging','investigating','containing','eradicating','recovering','closed')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
  type TEXT NOT NULL DEFAULT 'other' CHECK(type IN ('ransomware','bec','data-breach','malware','phishing','insider-threat','apt','ddos','supply-chain','other')),
  tlp TEXT NOT NULL DEFAULT 'amber' CHECK(tlp IN ('white','green','amber','red')),
  assigned_to TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  incident_date TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  mitre_techniques TEXT NOT NULL DEFAULT '[]',
  affected_assets TEXT NOT NULL DEFAULT '[]',
  threat_actors TEXT NOT NULL DEFAULT '[]',
  summary TEXT
);

CREATE TABLE IF NOT EXISTS case_evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'other',
  file_url TEXT,
  file_hash TEXT,
  file_size INTEGER,
  collected_by TEXT NOT NULL,
  collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  chain_of_custody TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  tlp TEXT NOT NULL DEFAULT 'amber'
);

CREATE TABLE IF NOT EXISTS case_timeline (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  analyst TEXT NOT NULL,
  iocs TEXT NOT NULL DEFAULT '[]',
  mitre_techniques TEXT NOT NULL DEFAULT '[]',
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_iocs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  indicator_type TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 50,
  source TEXT NOT NULL DEFAULT 'manual',
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'active',
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_severity ON cases(severity);
CREATE INDEX IF NOT EXISTS idx_cases_type ON cases(type);
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_case_evidence_case ON case_evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_case_timeline_case ON case_timeline(case_id);
CREATE INDEX IF NOT EXISTS idx_case_notes_case ON case_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_case_iocs_case ON case_iocs(case_id);
CREATE INDEX IF NOT EXISTS idx_case_iocs_value ON case_iocs(value);
`;

/* ─── ID Generator ───────────────────────────────────────────────────────── */

function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function generateCaseId(): string {
  const year = new Date().getFullYear();
  const seq = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CASE-${year}-${seq}`;
}

/* ─── Case CRUD ──────────────────────────────────────────────────────────── */

export async function createCase(db: D1Database, input: CreateCaseInput, createdBy: string): Promise<Case> {
  const id = generateCaseId();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO cases (id, title, description, status, severity, type, tlp, assigned_to, created_by, created_at, updated_at, incident_date, tags, mitre_techniques, affected_assets, threat_actors)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.title,
      input.description,
      input.severity,
      input.type,
      input.tlp ?? 'amber',
      input.assigned_to ?? null,
      createdBy,
      now,
      now,
      input.incident_date ?? null,
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.mitre_techniques ?? []),
      JSON.stringify(input.affected_assets ?? []),
      JSON.stringify(input.threat_actors ?? [])
    )
    .run();

  // Auto-create opening timeline event
  await addTimelineEvent(db, {
    case_id: id,
    timestamp: input.incident_date ?? now,
    event_type: 'detection',
    title: 'Case opened',
    description: `Incident case created: ${input.title}`,
    analyst: createdBy,
  });

  return getCase(db, id) as Promise<Case>;
}

export async function getCase(db: D1Database, id: string): Promise<Case | null> {
  const row = await db.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
  if (!row) return null;
  return parseCase(row);
}

export async function listCases(
  db: D1Database,
  opts: {
    status?: CaseStatus;
    severity?: CaseSeverity;
    type?: CaseType;
    assigned_to?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ cases: Case[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.status) {
    conditions.push('status = ?');
    params.push(opts.status);
  }
  if (opts.severity) {
    conditions.push('severity = ?');
    params.push(opts.severity);
  }
  if (opts.type) {
    conditions.push('type = ?');
    params.push(opts.type);
  }
  if (opts.assigned_to) {
    conditions.push('assigned_to = ?');
    params.push(opts.assigned_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const [countResult, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) as total FROM cases ${where}`)
      .bind(...params)
      .first() as Promise<{ total: number }>,
    db
      .prepare(`SELECT * FROM cases ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset)
      .all(),
  ]);

  return {
    cases: (rows.results as Record<string, unknown>[]).map(parseCase),
    total: countResult.total,
  };
}

export async function updateCase(
  db: D1Database,
  id: string,
  updates: Partial<CreateCaseInput & { status: CaseStatus; summary: string; assigned_to: string | null }>
): Promise<Case | null> {
  const existing = await getCase(db, id);
  if (!existing) return null;

  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [new Date().toISOString()];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
    if (updates.status === 'closed') {
      fields.push('closed_at = ?');
      values.push(new Date().toISOString());
    }
  }
  if (updates.severity !== undefined) {
    fields.push('severity = ?');
    values.push(updates.severity);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.tlp !== undefined) {
    fields.push('tlp = ?');
    values.push(updates.tlp);
  }
  if (updates.assigned_to !== undefined) {
    fields.push('assigned_to = ?');
    values.push(updates.assigned_to);
  }
  if (updates.summary !== undefined) {
    fields.push('summary = ?');
    values.push(updates.summary);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.mitre_techniques !== undefined) {
    fields.push('mitre_techniques = ?');
    values.push(JSON.stringify(updates.mitre_techniques));
  }
  if (updates.affected_assets !== undefined) {
    fields.push('affected_assets = ?');
    values.push(JSON.stringify(updates.affected_assets));
  }
  if (updates.threat_actors !== undefined) {
    fields.push('threat_actors = ?');
    values.push(JSON.stringify(updates.threat_actors));
  }

  values.push(id);
  await db
    .prepare(`UPDATE cases SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  // Log status changes to timeline
  if (updates.status && updates.status !== existing.status) {
    await addTimelineEvent(db, {
      case_id: id,
      timestamp: new Date().toISOString(),
      event_type: updates.status === 'closed' ? 'action' : 'triage',
      title: `Status changed: ${existing.status} → ${updates.status}`,
      description: updates.summary ?? '',
      analyst: 'system',
    });
  }

  return getCase(db, id);
}

export async function deleteCase(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM cases WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

/* ─── Evidence ───────────────────────────────────────────────────────────── */

export async function addEvidence(
  db: D1Database,
  caseId: string,
  input: Omit<Evidence, 'id' | 'case_id' | 'chain_of_custody' | 'collected_at'>,
  collectedBy: string
): Promise<Evidence> {
  const id = generateId('ev');
  const now = new Date().toISOString();
  const custody: CustodyEntry[] = [{ action: 'collected', by: collectedBy, at: now, notes: 'Initial collection' }];

  await db
    .prepare(
      `INSERT INTO case_evidence (id, case_id, name, description, type, file_url, file_hash, file_size, collected_by, collected_at, chain_of_custody, tags, tlp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      caseId,
      input.name,
      input.description,
      input.type,
      input.file_url ?? null,
      input.file_hash ?? null,
      input.file_size ?? null,
      collectedBy,
      now,
      JSON.stringify(custody),
      JSON.stringify(input.tags),
      input.tlp ?? 'amber'
    )
    .run();

  await addTimelineEvent(db, {
    case_id: caseId,
    timestamp: now,
    event_type: 'evidence',
    title: `Evidence added: ${input.name}`,
    description: `${input.type} evidence collected`,
    analyst: collectedBy,
    evidence_refs: [id],
  });

  const row = await db.prepare('SELECT * FROM case_evidence WHERE id = ?').bind(id).first();
  return parseEvidence(row as Record<string, unknown>);
}

export async function getCaseEvidence(db: D1Database, caseId: string): Promise<Evidence[]> {
  const rows = await db
    .prepare('SELECT * FROM case_evidence WHERE case_id = ? ORDER BY collected_at DESC')
    .bind(caseId)
    .all();
  return (rows.results as Record<string, unknown>[]).map(parseEvidence);
}

export async function updateEvidenceCustody(db: D1Database, evidenceId: string, entry: CustodyEntry): Promise<boolean> {
  const row = (await db
    .prepare('SELECT chain_of_custody FROM case_evidence WHERE id = ?')
    .bind(evidenceId)
    .first()) as { chain_of_custody: string } | null;
  if (!row) return false;

  const custody: CustodyEntry[] = JSON.parse(row.chain_of_custody);
  custody.push(entry);

  await db
    .prepare('UPDATE case_evidence SET chain_of_custody = ? WHERE id = ?')
    .bind(JSON.stringify(custody), evidenceId)
    .run();
  return true;
}

/* ─── Timeline ───────────────────────────────────────────────────────────── */

export async function addTimelineEvent(
  db: D1Database,
  event: Omit<CaseTimelineEvent, 'id' | 'created_at' | 'iocs' | 'mitre_techniques' | 'evidence_refs'> & {
    iocs?: string[];
    mitre_techniques?: string[];
    evidence_refs?: string[];
  }
): Promise<CaseTimelineEvent> {
  const id = generateId('tl');
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO case_timeline (id, case_id, timestamp, event_type, title, description, analyst, iocs, mitre_techniques, evidence_refs, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      event.case_id,
      event.timestamp,
      event.event_type,
      event.title,
      event.description,
      event.analyst,
      JSON.stringify(event.iocs ?? []),
      JSON.stringify(event.mitre_techniques ?? []),
      JSON.stringify(event.evidence_refs ?? []),
      now
    )
    .run();

  return {
    id,
    case_id: event.case_id,
    timestamp: event.timestamp,
    event_type: event.event_type,
    title: event.title,
    description: event.description,
    analyst: event.analyst,
    iocs: event.iocs ?? [],
    mitre_techniques: event.mitre_techniques ?? [],
    evidence_refs: event.evidence_refs ?? [],
    created_at: now,
  };
}

export async function getCaseTimeline(db: D1Database, caseId: string, limit = 200): Promise<CaseTimelineEvent[]> {
  const rows = await db
    .prepare('SELECT * FROM case_timeline WHERE case_id = ? ORDER BY timestamp DESC LIMIT ?')
    .bind(caseId, limit)
    .all();
  return (rows.results as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    case_id: r.case_id as string,
    timestamp: r.timestamp as string,
    event_type: r.event_type as string,
    title: r.title as string,
    description: r.description as string,
    analyst: r.analyst as string,
    iocs: JSON.parse(r.iocs as string) as string[],
    mitre_techniques: JSON.parse(r.mitre_techniques as string) as string[],
    evidence_refs: JSON.parse(r.evidence_refs as string) as string[],
    created_at: r.created_at as string,
  }));
}

/* ─── Notes ──────────────────────────────────────────────────────────────── */

export async function addNote(
  db: D1Database,
  caseId: string,
  author: string,
  content: string,
  pinned = false
): Promise<CaseNote> {
  const id = generateId('nt');
  const now = new Date().toISOString();

  await db
    .prepare(
      'INSERT INTO case_notes (id, case_id, author, content, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, caseId, author, content, pinned ? 1 : 0, now, now)
    .run();

  return { id, case_id: caseId, author, content, pinned, created_at: now, updated_at: now };
}

export async function getCaseNotes(db: D1Database, caseId: string): Promise<CaseNote[]> {
  const rows = await db
    .prepare('SELECT * FROM case_notes WHERE case_id = ? ORDER BY pinned DESC, created_at DESC')
    .bind(caseId)
    .all();
  return (rows.results as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    case_id: r.case_id as string,
    author: r.author as string,
    content: r.content as string,
    pinned: (r.pinned as number) === 1,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
}

export async function deleteNote(db: D1Database, noteId: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM case_notes WHERE id = ?').bind(noteId).run();
  return (result.meta?.changes ?? 0) > 0;
}

/* ─── Case IOCs ──────────────────────────────────────────────────────────── */

export async function addCaseIOC(
  db: D1Database,
  caseId: string,
  input: Omit<CaseIOC, 'id' | 'case_id' | 'first_seen' | 'last_seen'>
): Promise<CaseIOC> {
  const id = generateId('ci');
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO case_iocs (id, case_id, indicator_type, value, confidence, source, first_seen, last_seen, status, tags, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      caseId,
      input.indicator_type,
      input.value,
      input.confidence,
      input.source,
      now,
      now,
      input.status ?? 'active',
      JSON.stringify(input.tags),
      input.notes
    )
    .run();

  await addTimelineEvent(db, {
    case_id: caseId,
    timestamp: now,
    event_type: 'finding',
    title: `IOC added: ${input.indicator_type}`,
    description: `${input.value} (confidence: ${input.confidence}%)`,
    analyst: 'analyst',
    iocs: [input.value],
  });

  return {
    id,
    case_id: caseId,
    ...input,
    first_seen: now,
    last_seen: now,
    status: input.status ?? 'active',
  };
}

export async function getCaseIOCs(db: D1Database, caseId: string): Promise<CaseIOC[]> {
  const rows = await db
    .prepare('SELECT * FROM case_iocs WHERE case_id = ? ORDER BY first_seen DESC')
    .bind(caseId)
    .all();
  return (rows.results as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    case_id: r.case_id as string,
    indicator_type: r.indicator_type as string,
    value: r.value as string,
    confidence: r.confidence as number,
    source: r.source as string,
    first_seen: r.first_seen as string,
    last_seen: r.last_seen as string,
    status: r.status as string,
    tags: JSON.parse(r.tags as string) as string[],
    notes: r.notes as string,
  }));
}

export async function updateCaseIOCStatus(db: D1Database, iocId: string, status: CaseIOC['status']): Promise<boolean> {
  const result = await db
    .prepare('UPDATE case_iocs SET status = ?, last_seen = ? WHERE id = ?')
    .bind(status, new Date().toISOString(), iocId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/* ─── Stats ──────────────────────────────────────────────────────────────── */

export async function getCaseStats(db: D1Database): Promise<CaseStats> {
  const [total, open, investigating, closed, bySeverity, byType, avgResolution] = await Promise.all([
    db.prepare('SELECT COUNT(*) as c FROM cases').first() as Promise<{ c: number }>,
    db.prepare("SELECT COUNT(*) as c FROM cases WHERE status IN ('open','triaging')").first() as Promise<{ c: number }>,
    db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'investigating'").first() as Promise<{ c: number }>,
    db.prepare("SELECT COUNT(*) as c FROM cases WHERE status = 'closed'").first() as Promise<{ c: number }>,
    db.prepare('SELECT severity, COUNT(*) as c FROM cases GROUP BY severity').all(),
    db.prepare('SELECT type, COUNT(*) as c FROM cases GROUP BY type').all(),
    db
      .prepare(
        'SELECT AVG((julianday(closed_at) - julianday(created_at)) * 24) as avg_hours FROM cases WHERE closed_at IS NOT NULL'
      )
      .first() as Promise<{ avg_hours: number | null }>,
  ]);

  const sevMap: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of bySeverity.results as Record<string, unknown>[]) sevMap[r.severity as string] = r.c as number;

  const typeMap: Record<string, number> = {};
  for (const r of byType.results as Record<string, unknown>[]) typeMap[r.type as string] = r.c as number;

  return {
    total: total.c,
    open: open.c,
    investigating: investigating.c,
    closed: closed.c,
    avg_resolution_hours: avgResolution.avg_hours ?? 0,
    by_severity: sevMap as Record<CaseSeverity, number>,
    by_type: typeMap as Record<CaseType, number>,
  };
}

/* ─── Parsers ────────────────────────────────────────────────────────────── */

function safeJson<T>(val: unknown, fallback: T): T {
  try { return JSON.parse(val as string) as T; } catch { return fallback; }
}

function parseCase(r: Record<string, unknown>): Case {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    status: r.status as CaseStatus,
    severity: r.severity as CaseSeverity,
    type: r.type as CaseType,
    tlp: r.tlp as TLPLevel,
    assigned_to: r.assigned_to as string | null,
    created_by: r.created_by as string,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    closed_at: r.closed_at as string | null,
    incident_date: r.incident_date as string | null,
    tags: safeJson(r.tags, []),
    mitre_techniques: safeJson(r.mitre_techniques, []),
    affected_assets: safeJson(r.affected_assets, []),
    threat_actors: safeJson(r.threat_actors, []),
    summary: r.summary as string | null,
  };
}

function parseEvidence(r: Record<string, unknown>): Evidence {
  return {
    id: r.id as string,
    case_id: r.case_id as string,
    name: r.name as string,
    description: r.description as string,
    type: r.type as EvidenceType,
    file_url: r.file_url as string | null,
    file_hash: r.file_hash as string | null,
    file_size: r.file_size as number | null,
    collected_by: r.collected_by as string,
    collected_at: r.collected_at as string,
    chain_of_custody: safeJson(r.chain_of_custody, []),
    tags: safeJson(r.tags, []),
    tlp: r.tlp as TLPLevel,
  };
}
