import type { Context } from 'hono';
import type { Env } from '../env';

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
const INDEX_CACHE_KEY = 'https://grc-index-cache.internal/v1';
const INDEX_CACHE_TTL = 30;

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

async function loadAll<T>(env: Env, type: string): Promise<T[]> {
  const kv = env.KV_CACHE;
  if (!kv) return [];
  try {
    const indexKey = `${INDEX_CACHE_KEY}/${type}`;
    const cached = await kv.get(indexKey);
    if (cached) return JSON.parse(cached) as T[];
    const listKey = `${KV_PREFIX}:${type}:index`;
    const idsRaw = await kv.get(listKey);
    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    const results: T[] = [];
    for (const id of ids) {
      const raw = await kv.get(`${KV_PREFIX}:${type}:${id}`);
      if (raw) results.push(JSON.parse(raw) as T);
    }
    await kv.put(indexKey, JSON.stringify(results), { expirationTtl: INDEX_CACHE_TTL });
    return results;
  } catch {
    return [];
  }
}

async function saveAll<T>(env: Env, type: string, items: T[], getId: (item: T) => string): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  const ids = items.map(getId);
  await kv.put(`${KV_PREFIX}:${type}:index`, JSON.stringify(ids));
  for (const item of items) await kv.put(`${KV_PREFIX}:${type}:${getId(item)}`, JSON.stringify(item));
  await kv.delete(`${INDEX_CACHE_KEY}/${type}`);
}

async function readOne<T>(env: Env, type: string, id: string): Promise<T | null> {
  const kv = env.KV_CACHE;
  if (!kv) return null;
  const raw = await kv.get(`${KV_PREFIX}:${type}:${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeOne<T>(env: Env, type: string, item: T, id: string): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  await kv.put(`${KV_PREFIX}:${type}:${id}`, JSON.stringify(item));
  await kv.delete(`${INDEX_CACHE_KEY}/${type}`);
}

// ── Frameworks ───────────────────────────────────────────────────────

export async function grcListFrameworks(c: Context<{ Bindings: Env }>): Promise<Response> {
  const frameworks = await loadAll<GrcFramework>(c.env, 'frameworks');
  if (frameworks.length === 0) {
    await saveAll(c.env, 'frameworks', DEFAULT_FRAMEWORKS, (f) => f.id);
    return c.json(DEFAULT_FRAMEWORKS);
  }
  return c.json(frameworks);
}

export async function grcGetFramework(c: Context<{ Bindings: Env }>): Promise<Response> {
  const fw = await readOne<GrcFramework>(c.env, 'frameworks', c.req.param('id')!);
  if (!fw) return c.json({ error: 'Framework not found' }, 404);
  return c.json(fw);
}

export async function grcUpdateFramework(c: Context<{ Bindings: Env }>): Promise<Response> {
  const existing = await readOne<GrcFramework>(c.env, 'frameworks', c.req.param('id')!);
  if (!existing) return c.json({ error: 'Framework not found' }, 404);
  const body = await c.req.json<Partial<GrcFramework>>();
  const updated: GrcFramework = { ...existing, ...body, id: existing.id, updated_at: new Date().toISOString() };
  await writeOne(c.env, 'frameworks', updated, updated.id);
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
  if (!ctrl) return c.json({ error: 'Control not found' }, 404);
  return c.json(ctrl);
}

export async function grcCreateControl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<Omit<GrcControl, 'id' | 'evidence_count'>>();
  const control: GrcControl = { ...body, id: makeId(), evidence_count: 0, status: body.status ?? 'not_assessed' };
  const controls = await loadAll<GrcControl>(c.env, 'controls');
  controls.push(control);
  await saveAll(c.env, 'controls', controls, (ctrl) => ctrl.id);

  const fw = await readOne<GrcFramework>(c.env, 'frameworks', control.framework_id);
  if (fw) {
    fw.control_count = controls.filter((c) => c.framework_id === control.framework_id).length;
    fw.updated_at = new Date().toISOString();
    await writeOne(c.env, 'frameworks', fw, fw.id);
  }
  return c.json(control, 201);
}

export async function grcUpdateControl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const existing = await readOne<GrcControl>(c.env, 'controls', c.req.param('id')!);
  if (!existing) return c.json({ error: 'Control not found' }, 404);
  const body = await c.req.json<Partial<GrcControl>>();
  const updated: GrcControl = { ...existing, ...body, id: existing.id };
  await writeOne(c.env, 'controls', updated, updated.id);

  if (body.status) {
    const controls = await loadAll<GrcControl>(c.env, 'controls');
    const fw = await readOne<GrcFramework>(c.env, 'frameworks', updated.framework_id);
    if (fw) {
      const fc = controls.filter((c) => c.framework_id === updated.framework_id);
      const passed = fc.filter((c) => c.status === 'pass').length;
      fw.compliance_pct = fc.length > 0 ? clampPct((passed / fc.length) * 100) : 0;
      fw.updated_at = new Date().toISOString();
      await writeOne(c.env, 'frameworks', fw, fw.id);
    }
  }
  return c.json(updated);
}

export async function grcDeleteControl(c: Context<{ Bindings: Env }>): Promise<Response> {
  const control = await readOne<GrcControl>(c.env, 'controls', c.req.param('id')!);
  if (!control) return c.json({ error: 'Control not found' }, 404);
  const controls = await loadAll<GrcControl>(c.env, 'controls');
  const filtered = controls.filter((ctrl) => ctrl.id !== control.id);
  await saveAll(c.env, 'controls', filtered, (ctrl) => ctrl.id);

  const fw = await readOne<GrcFramework>(c.env, 'frameworks', control.framework_id);
  if (fw) {
    fw.control_count = filtered.filter((c) => c.framework_id === control.framework_id).length;
    fw.updated_at = new Date().toISOString();
    await writeOne(c.env, 'frameworks', fw, fw.id);
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
  if (!item) return c.json({ error: 'Evidence not found' }, 404);
  return c.json(item);
}

export async function grcCreateEvidence(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<Omit<GrcEvidenceItem, 'id'>>();
  const item: GrcEvidenceItem = { ...body, id: makeId() };
  const items = await loadAll<GrcEvidenceItem>(c.env, 'evidence');
  items.push(item);
  await saveAll(c.env, 'evidence', items, (e) => e.id);

  const ctrl = await readOne<GrcControl>(c.env, 'controls', item.control_id);
  if (ctrl) {
    ctrl.evidence_count = items.filter((e) => e.control_id === item.control_id).length;
    await writeOne(c.env, 'controls', ctrl, ctrl.id);
  }
  return c.json(item, 201);
}

export async function grcUpdateEvidence(c: Context<{ Bindings: Env }>): Promise<Response> {
  const existing = await readOne<GrcEvidenceItem>(c.env, 'evidence', c.req.param('id')!);
  if (!existing) return c.json({ error: 'Evidence not found' }, 404);
  const body = await c.req.json<Partial<GrcEvidenceItem>>();
  const updated: GrcEvidenceItem = { ...existing, ...body, id: existing.id };
  await writeOne(c.env, 'evidence', updated, updated.id);
  return c.json(updated);
}

export async function grcDeleteEvidence(c: Context<{ Bindings: Env }>): Promise<Response> {
  const item = await readOne<GrcEvidenceItem>(c.env, 'evidence', c.req.param('id')!);
  if (!item) return c.json({ error: 'Evidence not found' }, 404);
  const items = await loadAll<GrcEvidenceItem>(c.env, 'evidence');
  const filtered = items.filter((e) => e.id !== item.id);
  await saveAll(c.env, 'evidence', filtered, (e) => e.id);

  const ctrl = await readOne<GrcControl>(c.env, 'controls', item.control_id);
  if (ctrl) {
    ctrl.evidence_count = filtered.filter((e) => e.control_id === item.control_id).length;
    await writeOne(c.env, 'controls', ctrl, ctrl.id);
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
