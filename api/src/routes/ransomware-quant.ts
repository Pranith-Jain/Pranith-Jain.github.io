import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound } from '../lib/api-error';
import { kvBulkGetText } from '../lib/safe-catch';
import { routeCacheGet, routeCachePut } from '../lib/route-cache';

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

// Free per-colo Cache-API shadow TTL (write-through on saveAll keeps
// read-your-writes in the writing colo; other colos converge within this).
const ALL_L1_TTL_SECONDS = 60;

async function loadAll(env: Env): Promise<RansomScenario[]> {
  const kv = env.KV_CACHE;
  if (!kv) return [];
  const allKey = `${KV_PREFIX}:all`;
  // L1: per-colo Cache-API shadow (free) before any KV subrequest.
  const l1 = await routeCacheGet<RansomScenario[]>(allKey);
  if (l1) return l1;
  try {
    const blob = await kv.get(allKey, 'json');
    if (blob) {
      void routeCachePut(allKey, blob, ALL_L1_TTL_SECONDS);
      return blob as RansomScenario[];
    }
    const idsRaw = await kv.get(`${KV_PREFIX}:index`);
    const ids: string[] = idsRaw ? JSON.parse(idsRaw) : [];
    const values = await kvBulkGetText(
      kv,
      ids.map((id) => `${KV_PREFIX}:${id}`)
    );
    const results: RansomScenario[] = [];
    for (const id of ids) {
      const raw = values.get(`${KV_PREFIX}:${id}`) ?? null;
      if (raw) results.push(JSON.parse(raw) as RansomScenario);
    }
    return results;
  } catch {
    return [];
  }
}

async function saveAll(env: Env, items: RansomScenario[]): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) return;
  await kv.put(`${KV_PREFIX}:all`, JSON.stringify(items));
  // Write-through the L1 shadow (awaited — read-your-writes for the next
  // list read in this colo must not depend on request-lifetime races).
  await routeCachePut(`${KV_PREFIX}:all`, items, ALL_L1_TTL_SECONDS);
}

export async function ransomList(c: Context<{ Bindings: Env }>): Promise<Response> {
  const items = await loadAll(c.env);
  return c.json({ count: items.length, items });
}

export async function ransomGet(c: Context<{ Bindings: Env }>): Promise<Response> {
  const items = await loadAll(c.env);
  const item = items.find((i) => i.id === c.req.param('id'));
  if (!item) return notFound(c, 'Not found');
  return c.json(item);
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
  const id = c.req.param('id');
  if (!id) return badRequest(c, 'id required');
  const items = await loadAll(c.env);
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return notFound(c, 'Not found');
  const body = await c.req.json<Partial<RansomScenario>>();
  const merged = { ...items[idx], ...body, id, updated_at: new Date().toISOString() } as RansomScenario;
  const recomputed = computeCosts(merged);
  const updated: RansomScenario = { ...merged, ...recomputed };
  items[idx] = updated;
  await saveAll(c.env, items);
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
