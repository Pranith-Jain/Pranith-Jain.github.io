import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { withTestApiKey } from '../test-helpers';

const SAMPLE_INVENTORY = [
  {
    id: 'svc-payments-prod',
    name: 'payments-batch-runner',
    type: 'service_account',
    owner: 'payments-platform@bank.example',
    environment: 'prod',
    privilege: 'admin',
    credential: 'static_secret',
    secret_storage: 'vault',
    last_rotated_days: 410,
    last_used_days: 1,
    exposure: 'internal',
    scopes: ['payments:*'],
  },
  {
    id: 'wl-fraud-scoring',
    name: 'fraud-scoring-workload',
    type: 'workload_identity',
    owner: 'fraud-ml@bank.example',
    environment: 'prod',
    privilege: 'scoped',
    credential: 'federated',
    secret_storage: 'none',
    last_used_days: 0,
    exposure: 'internal',
    scopes: ['features:read'],
  },
];

interface ScanReportBody {
  summary: { total_identities: number; findings: number; orphaned: number; long_lived_secrets: number };
  identities: Array<{ tier: number; tier_label: string; risk_score: number }>;
}

describe('POST /api/v1/nhi/scan', () => {
  it('rejects a non-JSON body', async () => {
    const fetchAuthed = await withTestApiKey();
    const r = await fetchAuthed('https://x/api/v1/nhi/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    // The global looseValidation() middleware rejects malformed JSON first.
    expect(body.error).toBe('invalid_json');
  });

  it('rejects an inventory that is not a list / identities object', async () => {
    const fetchAuthed = await withTestApiKey();
    const r = await fetchAuthed('https://x/api/v1/nhi/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inventory: { notAnInventory: true } }),
    });
    expect(r.status).toBe(500);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('internal_error');
  });

  it('scans an inventory and returns the report', async () => {
    const fetchAuthed = await withTestApiKey();
    const r = await fetchAuthed('https://x/api/v1/nhi/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inventory: SAMPLE_INVENTORY }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScanReportBody;
    expect(body.summary.total_identities).toBe(2);
    // svc-payments-prod: admin + static secret + prod → tier 1
    expect(body.identities[0]!.tier).toBe(1);
    expect(body.identities[0]!.tier_label).toBe('Critical');
    expect(body.identities[1]!.tier).toBeGreaterThan(1);
  });

  it('accepts the inventory as the raw request body', async () => {
    const fetchAuthed = await withTestApiKey();
    const r = await fetchAuthed('https://x/api/v1/nhi/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(SAMPLE_INVENTORY),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScanReportBody;
    expect(body.summary.total_identities).toBe(2);
  });

  it('accepts an object with an identities key', async () => {
    const fetchAuthed = await withTestApiKey();
    const r = await fetchAuthed('https://x/api/v1/nhi/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identities: SAMPLE_INVENTORY }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScanReportBody;
    expect(body.summary.total_identities).toBe(2);
  });

  it('returns a markdown report when format=markdown', async () => {
    const fetchAuthed = await withTestApiKey();
    const r = await fetchAuthed('https://x/api/v1/nhi/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inventory: SAMPLE_INVENTORY, format: 'markdown' }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { format: string; markdown: string };
    expect(body.format).toBe('markdown');
    expect(body.markdown).toContain('# Non-Human Identity Risk Report');
    expect(body.markdown).toContain('OWASP NHI Top 10');
  });
});

describe('GET /api/v1/nhi/catalog', () => {
  it('returns the OWASP NHI Top 10 catalog and tiering rules', async () => {
    // GETs pass the external-only auth gate without a key.
    const r = await SELF.fetch('https://x/api/v1/nhi/catalog');
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      owasp: Array<{ id: string }>;
      rules: Array<{ id: string; floor: number }>;
      thresholds: { rotation_max_days: number; stale_days: number };
      types: string[];
    };
    expect(body.owasp.length).toBe(10);
    expect(body.owasp[0]!.id).toBe('NHI1:2025');
    expect(body.rules.length).toBeGreaterThan(10);
    expect(body.thresholds.rotation_max_days).toBe(90);
    expect(body.types).toContain('ai_agent');
  });
});
