import type { Context } from 'hono';
import type { Env } from '../env';
import { notFound } from '../lib/api-error';
import { kvBulkGetText } from '../lib/safe-catch';
import { routeCacheGet, routeCachePut } from '../lib/route-cache';

export interface GrcFramework {
  id: string;
  name: string;
  version: string;
  category: 'soc2' | 'iso27001' | 'nist' | 'pci' | 'hipaa' | 'custom';
  control_count: number;
  evidence_count: number;
  compliance_pct: number;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface GrcControl {
  id: string;
  framework_id: string;
  control_id: string;
  title: string;
  description: string;
  category: string;
  risk_rating: 'low' | 'medium' | 'high' | 'critical';
  status: 'not_assessed' | 'pass' | 'fail' | 'not_applicable';
  evidence_count: number;
  owner?: string;
  notes?: string;
}

export interface GrcEvidenceItem {
  id: string;
  control_id: string;
  title: string;
  description: string;
  status: 'collected' | 'pending' | 'failed' | 'not_applicable';
  collected_by?: string;
  collected_at?: string;
  source_type: 'manual' | 'api' | 'scan' | 'screenshot' | 'document' | 'log' | 'config';
  source_ref?: string;
  notes?: string;
}

const KV_PREFIX = 'grc:v1';

function makeId(): string {
  return Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
}

function clampPct(v: number): number {
  return Math.round(Math.min(100, Math.max(0, v)));
}

const DEFAULT_FRAMEWORKS: GrcFramework[] = [
  {
    id: 'soc2',
    name: 'SOC 2',
    version: '2024',
    category: 'soc2',
    control_count: 0,
    evidence_count: 0,
    compliance_pct: 0,
    description:
      'Service Organization Control 2 — trust services criteria for security, availability, processing integrity, confidentiality, and privacy.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'iso27001',
    name: 'ISO 27001',
    version: '2022',
    category: 'iso27001',
    control_count: 0,
    evidence_count: 0,
    compliance_pct: 0,
    description: 'Information security management system (ISMS) standard — Annex A controls across 14 domains.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'nist-csf',
    name: 'NIST CSF',
    version: '2.0',
    category: 'nist',
    control_count: 0,
    evidence_count: 0,
    compliance_pct: 0,
    description: 'Cybersecurity Framework — identify, protect, detect, respond, recover functions.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'pci-dss',
    name: 'PCI DSS',
    version: '4.0',
    category: 'pci',
    control_count: 0,
    evidence_count: 0,
    compliance_pct: 0,
    description: 'Payment Card Industry Data Security Standard — 12 requirements for cardholder data.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'hipaa',
    name: 'HIPAA',
    version: '2024',
    category: 'hipaa',
    control_count: 0,
    evidence_count: 0,
    compliance_pct: 0,
    description:
      'Health Insurance Portability and Accountability Act — privacy, security, and breach notification rules.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Free per-colo Cache-API shadow TTL for the `:all` blobs (write-through on saveAll).
const ALL_L1_TTL_SECONDS = 60;

async function loadAll<T>(env: Env, type: string): Promise<T[]> {
  const kv = env.KV_CACHE;
  if (!kv) return [];
  const allKey = `${KV_PREFIX}:${type}:all`;
  // L1: per-colo Cache-API shadow (free) before any KV subrequest.
  const l1 = await routeCacheGet<T[]>(allKey);
  if (l1) return l1;
  try {
    const blob = await kv.get(allKey, 'json');
    if (blob) {
      void routeCachePut(allKey, blob, ALL_L1_TTL_SECONDS);
      return blob as T[];
    }
    const idsRaw = await kv.get(`${KV_PREFIX}:${type}:index`);
    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    const values = await kvBulkGetText(
      kv,
      ids.map((id) => `${KV_PREFIX}:${type}:${id}`)
    );
    const results: T[] = [];
    for (const id of ids) {
      const raw = values.get(`${KV_PREFIX}:${type}:${id}`) ?? null;
      if (raw) results.push(JSON.parse(raw) as T);
    }
    return results;
  } catch {
    return [];
  }
}

async function saveAll<T>(env: Env, type: string, items: T[]): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  await kv.put(`${KV_PREFIX}:${type}:all`, JSON.stringify(items));
  // Write-through the L1 shadow so the next list read in this colo is free.
  void routeCachePut(`${KV_PREFIX}:${type}:all`, items, ALL_L1_TTL_SECONDS);
}

async function readOne<T>(env: Env, type: string, id: string): Promise<T | null> {
  const items = await loadAll<T & { id: string }>(env, type);
  return items.find((i) => i.id === id) ?? null;
}

async function writeOne<T>(env: Env, type: string, item: T & { id: string }): Promise<void> {
  const items = await loadAll<T & { id: string }>(env, type);
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  await saveAll(env, type, items);
}

// ── Frameworks ───────────────────────────────────────────────────────

export async function grcListFrameworks(c: Context<{ Bindings: Env }>): Promise<Response> {
  const frameworks = await loadAll<GrcFramework>(c.env, 'frameworks');
  if (frameworks.length === 0) {
    await saveAll(c.env, 'frameworks', DEFAULT_FRAMEWORKS);
    return c.json(DEFAULT_FRAMEWORKS);
  }
  return c.json(frameworks);
}

export async function grcGetFramework(c: Context<{ Bindings: Env }>): Promise<Response> {
  const fw = await readOne<GrcFramework>(c.env, 'frameworks', c.req.param('id')!);
  if (!fw) return notFound(c, 'Framework not found');
  return c.json(fw);
}

export async function grcUpdateFramework(c: Context<{ Bindings: Env }>): Promise<Response> {
  const existing = await readOne<GrcFramework>(c.env, 'frameworks', c.req.param('id')!);
  if (!existing) return notFound(c, 'Framework not found');
  const body = await c.req.json<Partial<GrcFramework>>();
  const updated: GrcFramework = { ...existing, ...body, id: existing.id, updated_at: new Date().toISOString() };
  await writeOne(c.env, 'frameworks', updated);
  return c.json(updated);
}

// ── Controls ─────────────────────────────────────────────────────────

export async function grcListControls(c: Context<{ Bindings: Env }>): Promise<Response> {
  const frameworkId = c.req.query('framework_id');
  let controls = await loadAll<GrcControl>(c.env, 'controls');
  if (frameworkId) controls = controls.filter((ctrl) => ctrl.framework_id === frameworkId);
  return c.json({ count: controls.length, controls });
}

export async function grcGetControl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const ctrl = await readOne<GrcControl>(c.env, 'controls', c.req.param('id')!);
  if (!ctrl) return notFound(c, 'Control not found');
  return c.json(ctrl);
}

export async function grcCreateControl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<Omit<GrcControl, 'id' | 'evidence_count'>>();
  const control: GrcControl = { ...body, id: makeId(), evidence_count: 0, status: body.status ?? 'not_assessed' };
  const controls = await loadAll<GrcControl>(c.env, 'controls');
  controls.push(control);
  await saveAll(c.env, 'controls', controls);

  const fw = await readOne<GrcFramework>(c.env, 'frameworks', control.framework_id);
  if (fw) {
    fw.control_count = controls.filter((c) => c.framework_id === control.framework_id).length;
    fw.updated_at = new Date().toISOString();
    await writeOne(c.env, 'frameworks', fw);
  }
  return c.json(control, 201);
}

export async function grcUpdateControl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const existing = await readOne<GrcControl>(c.env, 'controls', c.req.param('id')!);
  if (!existing) return notFound(c, 'Control not found');
  const body = await c.req.json<Partial<GrcControl>>();
  const updated: GrcControl = { ...existing, ...body, id: existing.id };
  await writeOne(c.env, 'controls', updated);

  if (body.status) {
    const controls = await loadAll<GrcControl>(c.env, 'controls');
    const fw = await readOne<GrcFramework>(c.env, 'frameworks', updated.framework_id);
    if (fw) {
      const fc = controls.filter((c) => c.framework_id === updated.framework_id);
      const passed = fc.filter((c) => c.status === 'pass').length;
      fw.compliance_pct = fc.length > 0 ? clampPct((passed / fc.length) * 100) : 0;
      fw.updated_at = new Date().toISOString();
      await writeOne(c.env, 'frameworks', fw);
    }
  }
  return c.json(updated);
}

export async function grcDeleteControl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const control = await readOne<GrcControl>(c.env, 'controls', c.req.param('id')!);
  if (!control) return notFound(c, 'Control not found');
  const controls = await loadAll<GrcControl>(c.env, 'controls');
  const filtered = controls.filter((ctrl) => ctrl.id !== control.id);
  await saveAll(c.env, 'controls', filtered);

  const fw = await readOne<GrcFramework>(c.env, 'frameworks', control.framework_id);
  if (fw) {
    fw.control_count = filtered.filter((c) => c.framework_id === control.framework_id).length;
    fw.updated_at = new Date().toISOString();
    await writeOne(c.env, 'frameworks', fw);
  }
  return c.json({ deleted: control.id });
}

// ── Evidence ─────────────────────────────────────────────────────────

export async function grcListEvidence(c: Context<{ Bindings: Env }>): Promise<Response> {
  const controlId = c.req.query('control_id');
  const frameworkId = c.req.query('framework_id');
  let items = await loadAll<GrcEvidenceItem>(c.env, 'evidence');
  if (controlId) items = items.filter((e) => e.control_id === controlId);
  if (frameworkId) {
    const controls = await loadAll<GrcControl>(c.env, 'controls');
    const fwControlIds = new Set(controls.filter((c) => c.framework_id === frameworkId).map((c) => c.id));
    items = items.filter((e) => fwControlIds.has(e.control_id));
  }
  return c.json({ count: items.length, items });
}

export async function grcGetEvidence(c: Context<{ Bindings: Env }>): Promise<Response> {
  const item = await readOne<GrcEvidenceItem>(c.env, 'evidence', c.req.param('id')!);
  if (!item) return notFound(c, 'Evidence not found');
  return c.json(item);
}

export async function grcCreateEvidence(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<Omit<GrcEvidenceItem, 'id'>>();
  const item: GrcEvidenceItem = { ...body, id: makeId() };
  const items = await loadAll<GrcEvidenceItem>(c.env, 'evidence');
  items.push(item);
  await saveAll(c.env, 'evidence', items);

  const ctrl = await readOne<GrcControl>(c.env, 'controls', item.control_id);
  if (ctrl) {
    ctrl.evidence_count = items.filter((e) => e.control_id === item.control_id).length;
    await writeOne(c.env, 'controls', ctrl);
  }
  return c.json(item, 201);
}

export async function grcUpdateEvidence(c: Context<{ Bindings: Env }>): Promise<Response> {
  const existing = await readOne<GrcEvidenceItem>(c.env, 'evidence', c.req.param('id')!);
  if (!existing) return notFound(c, 'Evidence not found');
  const body = await c.req.json<Partial<GrcEvidenceItem>>();
  const updated: GrcEvidenceItem = { ...existing, ...body, id: existing.id };
  await writeOne(c.env, 'evidence', updated);
  return c.json(updated);
}

export async function grcDeleteEvidence(c: Context<{ Bindings: Env }>): Promise<Response> {
  const item = await readOne<GrcEvidenceItem>(c.env, 'evidence', c.req.param('id')!);
  if (!item) return notFound(c, 'Evidence not found');
  const items = await loadAll<GrcEvidenceItem>(c.env, 'evidence');
  const filtered = items.filter((e) => e.id !== item.id);
  await saveAll(c.env, 'evidence', filtered);

  const ctrl = await readOne<GrcControl>(c.env, 'controls', item.control_id);
  if (ctrl) {
    ctrl.evidence_count = filtered.filter((e) => e.control_id === item.control_id).length;
    await writeOne(c.env, 'controls', ctrl);
  }
  return c.json({ deleted: item.id });
}

// ── Stats ────────────────────────────────────────────────────────────

export async function grcStats(c: Context<{ Bindings: Env }>): Promise<Response> {
  const [frameworks, controls, evidence] = await Promise.all([
    loadAll<GrcFramework>(c.env, 'frameworks'),
    loadAll<GrcControl>(c.env, 'controls'),
    loadAll<GrcEvidenceItem>(c.env, 'evidence'),
  ]);
  const avgCompliance =
    frameworks.length > 0 ? clampPct(frameworks.reduce((s, f) => s + f.compliance_pct, 0) / frameworks.length) : 0;
  return c.json({
    total_frameworks: frameworks.length,
    assessed_frameworks: frameworks.filter((f) => f.control_count > 0).length,
    avg_compliance: avgCompliance,
    total_controls: controls.length,
    total_evidence: evidence.length,
    controls_by_status: {
      pass: controls.filter((c) => c.status === 'pass').length,
      fail: controls.filter((c) => c.status === 'fail').length,
      not_assessed: controls.filter((c) => c.status === 'not_assessed').length,
      not_applicable: controls.filter((c) => c.status === 'not_applicable').length,
    },
    evidence_by_status: {
      collected: evidence.filter((e) => e.status === 'collected').length,
      pending: evidence.filter((e) => e.status === 'pending').length,
      failed: evidence.filter((e) => e.status === 'failed').length,
    },
  });
}
