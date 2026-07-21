import type { Context } from 'hono';
import type { Env } from '../env';

export interface RansomScenario {
  id: string;
  name: string;
  description: string;
  // Revenue impact
  annual_revenue: number;
  daily_revenue: number;
  // Downtime
  estimated_downtime_hours: number;
  recovery_time_hours: number;
  // Data at risk
  data_volume_gb: number;
  data_recreation_cost: number;
  pii_records: number;
  pii_cost_per_record: number;
  ip_value_at_risk: number;
  // Ransom
  ransom_demand: number;
  ransom_currency: string;
  // Insurance
  cyber_insurance_coverage: number;
  insurance_deductible: number;
  // Regulatory
  regulatory_fine_per_record: number;
  notifiable_breach: boolean;
  // Operational
  hourly_incident_response_cost: number;
  ir_hours_estimated: number;
  legal_hours_estimated: number;
  pr_hours_estimated: number;
  // Results (computed)
  downtime_cost: number;
  data_loss_cost: number;
  ransom_paid: number;
  ir_cost: number;
  legal_cost: number;
  pr_cost: number;
  regulatory_fines: number;
  insurance_recovery: number;
  total_impact: number;
  total_impact_after_insurance: number;
  created_at: string;
  updated_at: string;
}

const KV_PREFIX = 'ransom:v1';
const INDEX_CACHE_KEY = 'https://ransom-index-cache.internal/v1';
const INDEX_CACHE_TTL = 30;

function makeId(): string {
  return Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8);
}

function computeCosts(
  s: Omit<
    RansomScenario,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'downtime_cost'
    | 'data_loss_cost'
    | 'ransom_paid'
    | 'ir_cost'
    | 'legal_cost'
    | 'pr_cost'
    | 'regulatory_fines'
    | 'insurance_recovery'
    | 'total_impact'
    | 'total_impact_after_insurance'
  >
): {
  downtime_cost: number;
  data_loss_cost: number;
  ransom_paid: number;
  ir_cost: number;
  legal_cost: number;
  pr_cost: number;
  regulatory_fines: number;
  insurance_recovery: number;
  total_impact: number;
  total_impact_after_insurance: number;
} {
  const downtime =
    (s.estimated_downtime_hours ?? 0) * ((s.daily_revenue ?? 0) / 24) +
    (s.recovery_time_hours ?? 0) * ((s.daily_revenue ?? 0) / 24);
  const dataLoss =
    (s.data_recreation_cost ?? 0) + (s.pii_records ?? 0) * (s.pii_cost_per_record ?? 0) + (s.ip_value_at_risk ?? 0);
  const ir = (s.hourly_incident_response_cost ?? 0) * (s.ir_hours_estimated ?? 0);
  const legal = (s.legal_hours_estimated ?? 0) * 400;
  const pr = (s.pr_hours_estimated ?? 0) * 300;
  const fines = (s.notifiable_breach ?? false) ? (s.pii_records ?? 0) * (s.regulatory_fine_per_record ?? 0) : 0;
  const ransom = s.ransom_demand ?? 0;
  const total = downtime + dataLoss + ir + legal + pr + fines + ransom;
  const insurance = Math.max(0, Math.min(s.cyber_insurance_coverage ?? 0, total - (s.insurance_deductible ?? 0)));
  return {
    downtime_cost: Math.round(downtime),
    data_loss_cost: Math.round(dataLoss),
    ransom_paid: Math.round(ransom),
    ir_cost: Math.round(ir),
    legal_cost: Math.round(legal),
    pr_cost: Math.round(pr),
    regulatory_fines: Math.round(fines),
    insurance_recovery: Math.round(insurance),
    total_impact: Math.round(total),
    total_impact_after_insurance: Math.round(total - insurance),
  };
}

async function loadAll(env: Env): Promise<RansomScenario[]> {
  const kv = env.KV_CACHE;
  if (!kv) return [];
  try {
    const cached = await kv.get(INDEX_CACHE_KEY);
    if (cached) return JSON.parse(cached) as RansomScenario[];
    const idsRaw = await kv.get(`${KV_PREFIX}:index`);
    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    const results: RansomScenario[] = [];
    for (const id of ids) {
      const raw = await kv.get(`${KV_PREFIX}:${id}`);
      if (raw) results.push(JSON.parse(raw) as RansomScenario);
    }
    await kv.put(INDEX_CACHE_KEY, JSON.stringify(results), { expirationTtl: INDEX_CACHE_TTL });
    return results;
  } catch {
    return [];
  }
}

async function saveAll(env: Env, items: RansomScenario[]): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  const ids = items.map((s) => s.id);
  await kv.put(`${KV_PREFIX}:index`, JSON.stringify(ids));
  for (const item of items) await kv.put(`${KV_PREFIX}:${item.id}`, JSON.stringify(item));
  await kv.delete(INDEX_CACHE_KEY);
}

export async function ransomList(c: Context<{ Bindings: Env }>): Promise<Response> {
  const items = await loadAll(c.env);
  return c.json({ count: items.length, items });
}

export async function ransomGet(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 500);
  const raw = await kv.get(`${KV_PREFIX}:${c.req.param('id')}`);
  if (!raw) return c.json({ error: 'Not found' }, 404);
  try {
    return c.json(JSON.parse(raw));
  } catch {
    return c.json({ error: 'Not found' }, 404, { 'Cache-Control': 'no-store' });
  }
}

export async function ransomCreate(c: Context<{ Bindings: Env }>): Promise<Response> {
  const body =
    await c.req.json<
      Omit<
        RansomScenario,
        | 'id'
        | 'created_at'
        | 'updated_at'
        | 'downtime_cost'
        | 'data_loss_cost'
        | 'ransom_paid'
        | 'ir_cost'
        | 'legal_cost'
        | 'pr_cost'
        | 'regulatory_fines'
        | 'insurance_recovery'
        | 'total_impact'
        | 'total_impact_after_insurance'
      >
    >();
  const now = new Date().toISOString();
  const costs = computeCosts(body);
  const scenario: RansomScenario = { ...body, ...costs, id: makeId(), created_at: now, updated_at: now };
  const items = await loadAll(c.env);
  items.push(scenario);
  await saveAll(c.env, items);
  return c.json(scenario, 201);
}

export async function ransomUpdate(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 500);
  const id = c.req.param('id');
  const raw = await kv.get(`${KV_PREFIX}:${id}`);
  if (!raw) return c.json({ error: 'Not found' }, 404);
  let existing: RansomScenario;
  try {
    existing = JSON.parse(raw) as RansomScenario;
  } catch {
    return c.json({ error: 'Not found' }, 404, { 'Cache-Control': 'no-store' });
  }
  const body = await c.req.json<Partial<RansomScenario>>();
  const merged = { ...existing, ...body, id: existing.id, updated_at: new Date().toISOString() };
  const recomputed = computeCosts(merged);
  const updated: RansomScenario = { ...merged, ...recomputed };
  await kv.put(`${KV_PREFIX}:${id}`, JSON.stringify(updated));
  await kv.delete(INDEX_CACHE_KEY);
  return c.json(updated);
}

export async function ransomDelete(c: Context<{ Bindings: Env }>): Promise<Response> {
  const id = c.req.param('id');
  const items = await loadAll(c.env);
  const filtered = items.filter((s) => s.id !== id);
  await saveAll(c.env, filtered);
  return c.json({ deleted: id });
}

export async function ransomStats(c: Context<{ Bindings: Env }>): Promise<Response> {
  const items = await loadAll(c.env);
  const totalAtRisk = items.reduce((s, i) => s + i.total_impact, 0);
  const totalAfterInsurance = items.reduce((s, i) => s + i.total_impact_after_insurance, 0);
  const avgDowntime =
    items.length > 0 ? Math.round(items.reduce((s, i) => s + i.estimated_downtime_hours, 0) / items.length) : 0;
  const worstScenario = items.length > 0 ? items.reduce((a, b) => (a.total_impact > b.total_impact ? a : b)) : null;
  return c.json({
    total_scenarios: items.length,
    total_at_risk: totalAtRisk,
    total_after_insurance: totalAfterInsurance,
    avg_downtime_hours: avgDowntime,
    worst_scenario: worstScenario
      ? { id: worstScenario.id, name: worstScenario.name, total_impact: worstScenario.total_impact }
      : null,
  });
}
