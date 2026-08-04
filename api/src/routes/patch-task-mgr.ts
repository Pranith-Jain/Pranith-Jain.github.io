import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable } from '../lib/api-error';
import { kvBulkGetText } from '../lib/safe-catch';

export type PatchSeverity = 'critical' | 'important' | 'moderate' | 'low';
export type PatchStatus =
  | 'pending_review'
  | 'scheduled'
  | 'in_progress'
  | 'deployed'
  | 'failed'
  | 'rolled_back'
  | 'deferred'
  | 'not_applicable';
export type VendorSource =
  'microsoft' | 'oracle' | 'redhat' | 'vmware' | 'cisco' | 'palo_alto' | 'fortinet' | 'linux' | 'apple' | 'other';
export type MwStatus = 'proposed' | 'approved' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface PatchAdvisory {
  id: string;
  title: string;
  description: string;
  vendor: VendorSource;
  severity: PatchSeverity;
  cvss_score?: number;
  cve_ids: string[];
  affected_products: string[];
  vendor_advisory_url?: string;
  release_date: string;
  status: PatchStatus;
  assigned_to?: string;
  maintenance_window_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceWindow {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  status: MwStatus;
  affected_systems: string[];
  approver?: string;
  rollback_plan?: string;
  patch_ids: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

const KV_PREFIX = 'ptm:v1';

function makeId(): string {
  return Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
}

async function loadAll<T>(env: Env, type: string): Promise<T[]> {
  const kv = env.KV_CACHE;
  if (!kv) return [];
  try {
    const blob = await kv.get(`${KV_PREFIX}:${type}:all`, 'json');
    if (blob) return blob as T[];
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
}

// ── Patches ──────────────────────────────────────────────────────────

export async function ptmListPatches(c: Context<{ Bindings: Env }>): Promise<Response> {
  let items = await loadAll<PatchAdvisory>(c.env, 'patches');
  const status = c.req.query('status');
  const severity = c.req.query('severity');
  const vendor = c.req.query('vendor');
  if (status) items = items.filter((p) => p.status === status);
  if (severity) items = items.filter((p) => p.severity === severity);
  if (vendor) items = items.filter((p) => p.vendor === vendor);
  items.sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime());
  return c.json({ count: items.length, items });
}

export async function ptmGetPatch(c: Context<{ Bindings: Env }>): Promise<Response> {
  const items = await loadAll<PatchAdvisory>(c.env, 'patches');
  const item = items.find((i) => i.id === c.req.param('id'));
  if (!item) return notFound(c, 'Not found');
  return c.json(item);
}

export async function ptmCreatePatch(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<Omit<PatchAdvisory, 'id' | 'created_at' | 'updated_at'>>();
  const now = new Date().toISOString();
  const patch: PatchAdvisory = { ...body, id: makeId(), created_at: now, updated_at: now };
  const items = await loadAll<PatchAdvisory>(c.env, 'patches');
  items.push(patch);
  await saveAll(c.env, 'patches', items);
  return c.json(patch, 201);
}

export async function ptmUpdatePatch(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');
  const items = await loadAll<PatchAdvisory>(c.env, 'patches');
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return notFound(c, 'Not found');
  const body = await c.req.json<Partial<PatchAdvisory>>();
  const updated = { ...items[idx], ...body, id, updated_at: new Date().toISOString() } as PatchAdvisory;
  items[idx] = updated;
  await saveAll(c.env, 'patches', items);
  return c.json(updated);
}

export async function ptmDeletePatch(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const items = await loadAll<PatchAdvisory>(c.env, 'patches');
  const filtered = items.filter((p) => p.id !== id);
  await saveAll(c.env, 'patches', filtered);
  return c.json({ deleted: id });
}

// ── Maintenance Windows ──────────────────────────────────────────────

export async function ptmListWindows(c: Context<{ Bindings: Env }>): Promise<Response> {
  let items = await loadAll<MaintenanceWindow>(c.env, 'windows');
  const status = c.req.query('status');
  if (status) items = items.filter((w) => w.status === status);
  items.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  return c.json({ count: items.length, items });
}

export async function ptmGetWindow(c: Context<{ Bindings: Env }>): Promise<Response> {
  const items = await loadAll<MaintenanceWindow>(c.env, 'windows');
  const item = items.find((i) => i.id === c.req.param('id'));
  if (!item) return notFound(c, 'Not found');
  return c.json(item);
}

export async function ptmCreateWindow(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body = await c.req.json<Omit<MaintenanceWindow, 'id' | 'created_at' | 'updated_at'>>();
  const now = new Date().toISOString();
  const mw: MaintenanceWindow = { ...body, id: makeId(), created_at: now, updated_at: now };
  const items = await loadAll<MaintenanceWindow>(c.env, 'windows');
  items.push(mw);
  await saveAll(c.env, 'windows', items);
  return c.json(mw, 201);
}

export async function ptmUpdateWindow(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');
  const items = await loadAll<MaintenanceWindow>(c.env, 'windows');
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return notFound(c, 'Not found');
  const body = await c.req.json<Partial<MaintenanceWindow>>();
  const updated = { ...items[idx], ...body, id, updated_at: new Date().toISOString() } as MaintenanceWindow;
  items[idx] = updated;
  await saveAll(c.env, 'windows', items);
  return c.json(updated);
}

export async function ptmDeleteWindow(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const items = await loadAll<MaintenanceWindow>(c.env, 'windows');
  const filtered = items.filter((w) => w.id !== id);
  await saveAll(c.env, 'windows', filtered);
  return c.json({ deleted: id });
}

// ── Stats ────────────────────────────────────────────────────────────

export async function ptmStats(c: Context<{ Bindings: Env }>): Promise<Response> {
  const [patches, windows] = await Promise.all([
    loadAll<PatchAdvisory>(c.env, 'patches'),
    loadAll<MaintenanceWindow>(c.env, 'windows'),
  ]);
  const openPatches = patches.filter(
    (p) => p.status === 'pending_review' || p.status === 'scheduled' || p.status === 'in_progress'
  ).length;
  const criticalPatches = patches.filter((p) => p.severity === 'critical').length;
  const byVendor: Record<string, number> = {};
  for (const p of patches) {
    byVendor[p.vendor] = (byVendor[p.vendor] ?? 0) + 1;
  }
  const upcomingWindows = windows.filter((w) => w.status === 'proposed' || w.status === 'approved').length;
  return c.json({
    total_patches: patches.length,
    open_patches: openPatches,
    critical_patches: criticalPatches,
    patches_by_vendor: byVendor,
    total_windows: windows.length,
    upcoming_windows: upcomingWindows,
  });
}
