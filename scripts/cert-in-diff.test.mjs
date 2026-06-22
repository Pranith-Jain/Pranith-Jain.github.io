/**
 * Test the CERT-In diff script.
 *
 * Validates that scripts/cert-in-diff.mjs correctly produces a NO_CHANGES
 * line for identical inputs, and a CHANGED report that categorises
 * added / removed / re-parsed advisories.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIFF = join(__dirname, 'cert-in-diff.mjs');

function run(before, after) {
  const dir = mkdtempSync(join(tmpdir(), 'cert-in-diff-'));
  const beforePath = join(dir, 'before.json');
  const afterPath = join(dir, 'after.json');
  writeFileSync(beforePath, JSON.stringify(before, null, 2));
  writeFileSync(afterPath, JSON.stringify(after, null, 2));
  const out = execFileSync('node', [DIFF, '--before', beforePath, '--after', afterPath], { encoding: 'utf8' });
  return out;
}

const baseRecord = (overrides) => ({
  id: 'CIAD-2025-0001',
  published_at: '2025-01-15',
  severity: 'high',
  cves: ['CVE-2025-0001'],
  products_affected: ['Windows'],
  description: 'test',
  detail_url: 'https://example.com',
  summary: 'HIGH severity',
  indexed_at: '2025-01-15T00:00:00Z',
  ...overrides,
});

test('NO_CHANGES when before and after are identical', () => {
  const rec = baseRecord();
  const out = run([rec], [rec]);
  assert.match(out, /^NO_CHANGES/);
  assert.match(out, /Index unchanged \(1 advisories\)/);
});

test('reports added advisories', () => {
  const before = [baseRecord({ id: 'CIAD-2025-0001' })];
  const after = [baseRecord({ id: 'CIAD-2025-0001' }), baseRecord({ id: 'CIAD-2025-0002', published_at: '2025-02-01' })];
  const out = run(before, after);
  assert.match(out, /^CHANGED/);
  assert.match(out, /Added:\*\* 1/);
  assert.match(out, /New advisories \(1\)/);
  assert.match(out, /CIAD-2025-0002/);
});

test('reports removed advisories', () => {
  const before = [baseRecord({ id: 'CIAD-2025-0001' }), baseRecord({ id: 'CIAD-2025-0002' })];
  const after = [baseRecord({ id: 'CIAD-2025-0001' })];
  const out = run(before, after);
  assert.match(out, /^CHANGED/);
  assert.match(out, /Removed:\*\* 1/);
  assert.match(out, /CIAD-2025-0002/);
});

test('reports re-parsed advisories (severity change)', () => {
  const before = [baseRecord({ id: 'CIAD-2025-0001', severity: 'high', summary: 'HIGH severity' })];
  const after = [baseRecord({ id: 'CIAD-2025-0001', severity: 'critical', summary: 'CRITICAL severity' })];
  const out = run(before, after);
  assert.match(out, /^CHANGED/);
  assert.match(out, /Re-parsed advisories \(1\)/);
  assert.match(out, /CIAD-2025-0001/);
  // Should mention the changed fields.
  assert.match(out, /severity/);
  assert.match(out, /summary/);
});

test('treats missing before file as empty', () => {
  // Pass a path that does not exist.
  const out = execFileSync('node', [DIFF, '--before', '/tmp/does-not-exist.json', '--after', '/tmp/also-missing.json'], { encoding: 'utf8' });
  assert.match(out, /^NO_CHANGES/);
});

test('sorts new advisories by published_at desc', () => {
  const before = [];
  const after = [
    baseRecord({ id: 'CIAD-2025-0001', published_at: '2025-01-15' }),
    baseRecord({ id: 'CIAD-2025-0002', published_at: '2025-03-15' }),
    baseRecord({ id: 'CIAD-2025-0003', published_at: '2025-02-15' }),
  ];
  const out = run(before, after);
  // First new ID in the table should be 2025-0002 (March).
  const idx1 = out.indexOf('CIAD-2025-0001');
  const idx2 = out.indexOf('CIAD-2025-0002');
  const idx3 = out.indexOf('CIAD-2025-0003');
  assert.ok(idx2 < idx3, 'CIAD-2025-0002 should appear before CIAD-2025-0003');
  assert.ok(idx3 < idx1, 'CIAD-2025-0003 should appear before CIAD-2025-0001');
});
