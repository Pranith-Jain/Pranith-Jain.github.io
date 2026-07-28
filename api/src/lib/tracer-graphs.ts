import type { D1Database } from '@cloudflare/workers-types';

export interface TracerGraphRow {
  id: string;
  investigation_id: string | null;
  title: string;
  seed_address: string;
  chain: string;
  graph_json: string;
  created_at: string;
  updated_at: string;
}

export type TracerGraphMeta = Omit<TracerGraphRow, 'graph_json'>;

const DDL = `CREATE TABLE IF NOT EXISTS tracer_graphs (
  id               TEXT PRIMARY KEY,
  investigation_id TEXT,
  title            TEXT NOT NULL,
  seed_address     TEXT NOT NULL,
  chain            TEXT NOT NULL,
  graph_json       TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracer_graphs_investigation ON tracer_graphs(investigation_id);`;

export async function ensureTracerGraphsTable(db: D1Database): Promise<void> {
  for (const stmt of DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await db.prepare(stmt).run();
  }
}

export async function saveTracerGraph(db: D1Database, row: TracerGraphRow): Promise<void> {
  await ensureTracerGraphsTable(db);
  await db
    .prepare(
      `INSERT OR REPLACE INTO tracer_graphs (id, investigation_id, title, seed_address, chain, graph_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id,
      row.investigation_id,
      row.title,
      row.seed_address,
      row.chain,
      row.graph_json,
      row.created_at,
      row.updated_at
    )
    .run();
}

export async function listTracerGraphs(db: D1Database): Promise<TracerGraphMeta[]> {
  await ensureTracerGraphsTable(db);
  const res = await db
    .prepare(
      `SELECT id, investigation_id, title, seed_address, chain, created_at, updated_at FROM tracer_graphs ORDER BY updated_at DESC`
    )
    .all();
  return (res.results ?? []) as unknown as TracerGraphMeta[];
}

export async function getTracerGraph(db: D1Database, id: string): Promise<TracerGraphRow | null> {
  await ensureTracerGraphsTable(db);
  const row = await db.prepare(`SELECT * FROM tracer_graphs WHERE id = ?`).bind(id).first();
  return (row as unknown as TracerGraphRow) ?? null;
}

export async function deleteTracerGraph(db: D1Database, id: string): Promise<void> {
  await ensureTracerGraphsTable(db);
  await db.prepare(`DELETE FROM tracer_graphs WHERE id = ?`).bind(id).run();
}
