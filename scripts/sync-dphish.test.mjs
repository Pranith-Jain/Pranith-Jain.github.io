/**
 * Test the dPhish sync normalization + merge logic.
 *
 * Unit-tests the pure functions of scripts/sync-dphish.mjs (category
 * mapping, value extraction, normalize, merge) without network access.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { observableTypeToCategory, indicatorValue, normalizeIndicator, mergeIndicators } from './sync-dphish.mjs';

function stixIndicator(overrides = {}) {
  return {
    id: 'indicator--11111111-1111-4111-8111-111111111111',
    type: 'indicator',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    revoked: false,
    confidence: 100,
    name: 'evil.example.com',
    pattern: "[domain-name:value = 'evil.example.com']",
    pattern_type: 'stix',
    indicator_types: ['malicious-activity'],
    extensions: {
      'extension-definition--ea279b3e-5c71-4632-ac08-831c66a786ba': {
        main_observable_type: 'Domain-Name',
        observable_values: [{ type: 'Domain-Name', value: 'evil.example.com' }],
        score: 20,
        detection: false,
      },
    },
    ...overrides,
  };
}

test('observableTypeToCategory maps STIX main types', () => {
  assert.equal(observableTypeToCategory('Domain-Name'), 'domain');
  assert.equal(observableTypeToCategory('IPv4-Addr'), 'ipv4');
  assert.equal(observableTypeToCategory('IPv6-Addr'), 'ipv6');
  assert.equal(observableTypeToCategory('Url'), 'url');
  assert.equal(observableTypeToCategory('Phone-Number'), 'phone');
  assert.equal(observableTypeToCategory('StixFile'), 'file');
  assert.equal(observableTypeToCategory('Email-Addr'), 'email');
  assert.equal(observableTypeToCategory('Weird-Thing'), 'other');
});

test('indicatorValue prefers observable_values then pattern then name', () => {
  const ind = stixIndicator();
  assert.equal(indicatorValue(ind), 'evil.example.com');
  const noExt = stixIndicator({ extensions: {} });
  assert.equal(indicatorValue(noExt), 'evil.example.com');
  const bare = { name: 'x.example', pattern: null };
  assert.equal(indicatorValue(bare), 'x.example');
});

test('normalizeIndicator produces the staging shape', () => {
  const ind = stixIndicator({
    id: 'indicator--22222222-2222-4222-8222-222222222222',
    revoked: true,
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: '2027-01-01T00:00:00.000Z',
    labels: ['phishing'],
    description: 'harvests credentials',
  });
  const out = normalizeIndicator(ind);
  assert.equal(out.stixId, 'indicator--22222222-2222-4222-8222-222222222222');
  assert.equal(out.category, 'domain');
  assert.equal(out.value, 'evil.example.com');
  assert.equal(out.revoked, true);
  assert.equal(out.validUntil, '2027-01-01T00:00:00.000Z');
  assert.deepEqual(out.labels, ['phishing']);
  assert.equal(out.description, 'harvests credentials');
  assert.equal(out.score, 20);
  assert.equal(out.detection, false);
});

test('mergeIndicators keeps the newest modified per stixId and adds new', () => {
  const a = normalizeIndicator(stixIndicator({ id: 'indicator--a', modified: '2026-01-01T00:00:00.000Z' }));
  const b = normalizeIndicator(stixIndicator({ id: 'indicator--b', modified: '2026-01-02T00:00:00.000Z' }));
  const aNewer = normalizeIndicator(
    stixIndicator({ id: 'indicator--a', modified: '2026-01-03T00:00:00.000Z', revoked: true })
  );
  const merged = mergeIndicators([a, b], [aNewer]);
  assert.equal(merged.length, 2);
  const aOut = merged.find((i) => i.stixId === 'indicator--a');
  assert.equal(aOut.modified, '2026-01-03T00:00:00.000Z');
  assert.equal(aOut.revoked, true);
});

test('mergeIndicators ignores incoming without a stixId', () => {
  const a = normalizeIndicator(stixIndicator({ id: 'indicator--a' }));
  const junk = [{ stixId: null, value: 'x' }];
  assert.equal(mergeIndicators([a], junk).length, 1);
});