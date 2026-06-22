/**
 * Workspace Management — save/load/list investigation workspaces.
 *
 * Extends the notebook system with full AEAD lifecycle support,
 * subjects, connections, findings, timeline, and exposure scoring.
 * All backed by D1 (BRIEFINGS_DB).
 */

export interface WorkspaceEnv {
  BRIEFINGS_DB?: D1Database;
}

export interface Workspace {
  id: string;
  title: string;
  description: string;
  target: string;
  targetType: string;
  phase: 'acquire' | 'enrich' | 'assess' | 'deliver' | 'complete';
  status: 'open' | 'active' | 'archived';
  exposureScore: number;
  exposureLabel: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WsSubject {
  id: string;
  workspaceId: string;
  subjectType: string;
  label: string;
  value: string;
  confidence: number;
  trustScore: number;
  verified: boolean;
  aliases: string[];
  notes: string;
  firstSeen: string;
  createdAt: string;
}

export interface WsConnection {
  id: string;
  workspaceId: string;
  fromSubjectId: string;
  toSubjectId: string;
  relationship: string;
  strength: 'confirmed' | 'probable' | 'possible';
  notes: string;
  createdAt: string;
}

export interface WsFinding {
  id: string;
  workspaceId: string;
  subjectId: string | null;
  findingType: string;
  weight: string;
  description: string;
  sourceUrl: string;
  sourceReliability: string;
  confidence: number;
  trustScore: number;
  collectionMethod: string;
  tags: string[];
  validated: boolean;
  createdAt: string;
}

export interface WsTimelineEvent {
  id: number;
  workspaceId: string;
  eventDate: string;
  eventType: string;
  description: string;
  subjectId: string | null;
  createdAt: string;
}

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

// ─── Workspace CRUD ───

export async function workspaceCreate(
  env: WorkspaceEnv,
  input: { title: string; description?: string; target?: string; targetType?: string; tags?: string[] }
): Promise<Workspace> {
  const db = env.BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not available');

  const id = genId('ws');
  const now = new Date().toISOString();
  const tags = JSON.stringify(input.tags || []);

  await db
    .prepare(
      `
    INSERT INTO investigation_workspaces (id, title, description, target, target_type, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .bind(id, input.title, input.description || '', input.target || '', input.targetType || 'domain', tags, now, now)
    .run();

  return workspaceGet(env, id) as Promise<Workspace>;
}

export async function workspaceGet(env: WorkspaceEnv, id: string): Promise<Workspace | null> {
  const db = env.BRIEFINGS_DB;
  if (!db) return null;

  const row = await db
    .prepare(
      `
    SELECT * FROM investigation_workspaces WHERE id = ?
  `
    )
    .bind(id)
    .first();
  if (!row) return null;

  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    target: row.target as string,
    targetType: row.target_type as string,
    phase: row.phase as Workspace['phase'],
    status: row.status as Workspace['status'],
    exposureScore: row.exposure_score as number,
    exposureLabel: row.exposure_label as string,
    tags: JSON.parse((row.tags as string) || '[]'),
    metadata: JSON.parse((row.metadata as string) || '{}'),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function workspaceList(
  env: WorkspaceEnv,
  opts?: { status?: string; limit?: number }
): Promise<Workspace[]> {
  const db = env.BRIEFINGS_DB;
  if (!db) return [];

  let query = 'SELECT * FROM investigation_workspaces';
  const params: string[] = [];

  if (opts?.status) {
    query += ' WHERE status = ?';
    params.push(opts.status);
  }

  query += ' ORDER BY updated_at DESC';
  if (opts?.limit) {
    query += ' LIMIT ?';
    params.push(String(opts.limit));
  }

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all();
  return results.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    target: row.target as string,
    targetType: row.target_type as string,
    phase: row.phase as Workspace['phase'],
    status: row.status as Workspace['status'],
    exposureScore: row.exposure_score as number,
    exposureLabel: row.exposure_label as string,
    tags: JSON.parse((row.tags as string) || '[]'),
    metadata: JSON.parse((row.metadata as string) || '{}'),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function workspaceUpdate(
  env: WorkspaceEnv,
  id: string,
  updates: Partial<
    Pick<
      Workspace,
      'title' | 'description' | 'phase' | 'status' | 'exposureScore' | 'exposureLabel' | 'tags' | 'metadata'
    >
  >
): Promise<Workspace | null> {
  const db = env.BRIEFINGS_DB;
  if (!db) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    sets.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    values.push(updates.description);
  }
  if (updates.phase !== undefined) {
    sets.push('phase = ?');
    values.push(updates.phase);
  }
  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.exposureScore !== undefined) {
    sets.push('exposure_score = ?');
    values.push(updates.exposureScore);
  }
  if (updates.exposureLabel !== undefined) {
    sets.push('exposure_label = ?');
    values.push(updates.exposureLabel);
  }
  if (updates.tags !== undefined) {
    sets.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.metadata !== undefined) {
    sets.push('metadata = ?');
    values.push(JSON.stringify(updates.metadata));
  }

  if (sets.length === 0) return workspaceGet(env, id);

  sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  values.push(id);

  await db
    .prepare(`UPDATE investigation_workspaces SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
  return workspaceGet(env, id);
}

export async function workspaceDelete(env: WorkspaceEnv, id: string): Promise<boolean> {
  const db = env.BRIEFINGS_DB;
  if (!db) return false;

  const result = await db.prepare('DELETE FROM investigation_workspaces WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

// ─── Subjects ───

export async function subjectCreate(
  env: WorkspaceEnv,
  input: {
    workspaceId: string;
    subjectType: string;
    label: string;
    value?: string;
    confidence?: number;
    trustScore?: number;
    verified?: boolean;
    aliases?: string[];
    notes?: string;
    firstSeen?: string;
  }
): Promise<WsSubject> {
  const db = env.BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not available');

  const id = genId('sub');
  const now = new Date().toISOString();

  await db
    .prepare(
      `
    INSERT INTO ws_subjects (id, workspace_id, subject_type, label, value, confidence, trust_score, verified, aliases, notes, first_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .bind(
      id,
      input.workspaceId,
      input.subjectType,
      input.label,
      input.value || '',
      input.confidence ?? 50,
      input.trustScore ?? 3,
      input.verified ? 1 : 0,
      JSON.stringify(input.aliases || []),
      input.notes || '',
      input.firstSeen || '',
      now
    )
    .run();

  return {
    id,
    workspaceId: input.workspaceId,
    subjectType: input.subjectType,
    label: input.label,
    value: input.value || '',
    confidence: input.confidence ?? 50,
    trustScore: input.trustScore ?? 3,
    verified: input.verified ?? false,
    aliases: input.aliases || [],
    notes: input.notes || '',
    firstSeen: input.firstSeen || '',
    createdAt: now,
  };
}

export async function subjectList(env: WorkspaceEnv, workspaceId: string): Promise<WsSubject[]> {
  const db = env.BRIEFINGS_DB;
  if (!db) return [];

  const { results } = await db
    .prepare('SELECT * FROM ws_subjects WHERE workspace_id = ? ORDER BY created_at')
    .bind(workspaceId)
    .all();

  return results.map((row) => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    subjectType: row.subject_type as string,
    label: row.label as string,
    value: row.value as string,
    confidence: row.confidence as number,
    trustScore: row.trust_score as number,
    verified: (row.verified as number) === 1,
    aliases: JSON.parse((row.aliases as string) || '[]'),
    notes: row.notes as string,
    firstSeen: row.first_seen as string,
    createdAt: row.created_at as string,
  }));
}

// ─── Connections ───

export async function connectionCreate(
  env: WorkspaceEnv,
  input: {
    workspaceId: string;
    fromSubjectId: string;
    toSubjectId: string;
    relationship: string;
    strength?: 'confirmed' | 'probable' | 'possible';
    notes?: string;
  }
): Promise<WsConnection> {
  const db = env.BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not available');

  const id = genId('conn');
  const now = new Date().toISOString();

  await db
    .prepare(
      `
    INSERT INTO ws_connections (id, workspace_id, from_subject_id, to_subject_id, relationship, strength, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .bind(
      id,
      input.workspaceId,
      input.fromSubjectId,
      input.toSubjectId,
      input.relationship,
      input.strength || 'confirmed',
      input.notes || '',
      now
    )
    .run();

  return {
    id,
    workspaceId: input.workspaceId,
    fromSubjectId: input.fromSubjectId,
    toSubjectId: input.toSubjectId,
    relationship: input.relationship,
    strength: input.strength || 'confirmed',
    notes: input.notes || '',
    createdAt: now,
  };
}

export async function connectionList(env: WorkspaceEnv, workspaceId: string): Promise<WsConnection[]> {
  const db = env.BRIEFINGS_DB;
  if (!db) return [];

  const { results } = await db
    .prepare('SELECT * FROM ws_connections WHERE workspace_id = ? ORDER BY created_at')
    .bind(workspaceId)
    .all();

  return results.map((row) => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    fromSubjectId: row.from_subject_id as string,
    toSubjectId: row.to_subject_id as string,
    relationship: row.relationship as string,
    strength: row.strength as 'confirmed' | 'probable' | 'possible',
    notes: row.notes as string,
    createdAt: row.created_at as string,
  }));
}

// ─── Findings ───

export async function findingCreate(
  env: WorkspaceEnv,
  input: {
    workspaceId: string;
    subjectId?: string;
    findingType?: string;
    weight?: string;
    description: string;
    sourceUrl?: string;
    sourceReliability?: string;
    confidence?: number;
    trustScore?: number;
    collectionMethod?: string;
    tags?: string[];
  }
): Promise<WsFinding> {
  const db = env.BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not available');

  const id = genId('fnd');
  const now = new Date().toISOString();

  await db
    .prepare(
      `
    INSERT INTO ws_findings (id, workspace_id, subject_id, finding_type, weight, description, source_url, source_reliability, confidence, trust_score, collection_method, tags, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .bind(
      id,
      input.workspaceId,
      input.subjectId || null,
      input.findingType || 'infrastructure',
      input.weight || 'MEDIUM',
      input.description,
      input.sourceUrl || '',
      input.sourceReliability || 'C',
      input.confidence ?? 50,
      input.trustScore ?? 3,
      input.collectionMethod || 'search',
      JSON.stringify(input.tags || []),
      now
    )
    .run();

  return {
    id,
    workspaceId: input.workspaceId,
    subjectId: input.subjectId || null,
    findingType: input.findingType || 'infrastructure',
    weight: input.weight || 'MEDIUM',
    description: input.description,
    sourceUrl: input.sourceUrl || '',
    sourceReliability: input.sourceReliability || 'C',
    confidence: input.confidence ?? 50,
    trustScore: input.trustScore ?? 3,
    collectionMethod: input.collectionMethod || 'search',
    tags: input.tags || [],
    validated: false,
    createdAt: now,
  };
}

export async function findingList(env: WorkspaceEnv, workspaceId: string): Promise<WsFinding[]> {
  const db = env.BRIEFINGS_DB;
  if (!db) return [];

  const { results } = await db
    .prepare('SELECT * FROM ws_findings WHERE workspace_id = ? ORDER BY created_at')
    .bind(workspaceId)
    .all();

  return results.map((row) => ({
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    subjectId: row.subject_id as string | null,
    findingType: row.finding_type as string,
    weight: row.weight as string,
    description: row.description as string,
    sourceUrl: row.source_url as string,
    sourceReliability: row.source_reliability as string,
    confidence: row.confidence as number,
    trustScore: row.trust_score as number,
    collectionMethod: row.collection_method as string,
    tags: JSON.parse((row.tags as string) || '[]'),
    validated: (row.validated as number) === 1,
    createdAt: row.created_at as string,
  }));
}

// ─── Timeline ───

export async function timelineAdd(
  env: WorkspaceEnv,
  input: {
    workspaceId: string;
    eventDate: string;
    eventType?: string;
    description: string;
    subjectId?: string;
  }
): Promise<WsTimelineEvent> {
  const db = env.BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not available');

  const result = await db
    .prepare(
      `
    INSERT INTO ws_timeline (workspace_id, event_date, event_type, description, subject_id)
    VALUES (?, ?, ?, ?, ?)
  `
    )
    .bind(
      input.workspaceId,
      input.eventDate,
      input.eventType || 'observation',
      input.description,
      input.subjectId || null
    )
    .run();

  return {
    id: result.meta?.last_row_id as number,
    workspaceId: input.workspaceId,
    eventDate: input.eventDate,
    eventType: input.eventType || 'observation',
    description: input.description,
    subjectId: input.subjectId || null,
    createdAt: new Date().toISOString(),
  };
}

export async function timelineList(env: WorkspaceEnv, workspaceId: string): Promise<WsTimelineEvent[]> {
  const db = env.BRIEFINGS_DB;
  if (!db) return [];

  const { results } = await db
    .prepare('SELECT * FROM ws_timeline WHERE workspace_id = ? ORDER BY event_date')
    .bind(workspaceId)
    .all();

  return results.map((row) => ({
    id: row.id as number,
    workspaceId: row.workspace_id as string,
    eventDate: row.event_date as string,
    eventType: row.event_type as string,
    description: row.description as string,
    subjectId: row.subject_id as string | null,
    createdAt: row.created_at as string,
  }));
}

// ─── Full Workspace Export ───

export async function workspaceExport(env: WorkspaceEnv, id: string) {
  const ws = await workspaceGet(env, id);
  if (!ws) return null;

  const subjects = await subjectList(env, id);
  const connections = await connectionList(env, id);
  const findings = await findingList(env, id);
  const timeline = await timelineList(env, id);

  return { workspace: ws, subjects, connections, findings, timeline };
}
