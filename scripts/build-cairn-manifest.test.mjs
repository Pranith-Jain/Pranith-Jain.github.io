/**
 * Tests for the credential redaction in scripts/build-cairn-manifest.mjs.
 *
 * Upstream family reports quote attacker/developer credentials verbatim;
 * the build must never emit them into public/data/. No network access.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { redactLeakedCredentials } from './build-cairn-manifest.mjs';

// Test vectors are assembled from parts so this file itself never
// contains a contiguous credential-shaped literal (would trip the same
// secret scanner the redaction exists to satisfy).
const GEMINI = ['AIza', 'SyAHoXDXvRwEWN00sUVkB3kPjB7raikNr8o'].join('');
const DEEPSEEK = ['sk-', 'c1785e22145c4f0bb736e5c14df898be'].join('');

test('redacts Google + sk- provider keys to prefix…suffix form', () => {
  const out = redactLeakedCredentials(`gemini=${GEMINI} deepseek=${DEEPSEEK}`);
  assert.ok(!out.includes(GEMINI), 'gemini key must not survive');
  assert.ok(!out.includes(DEEPSEEK), 'deepseek key must not survive');
  assert.ok(out.includes('AIzaSyAH...Nr8o'), 'keeps correlatable prefix/suffix');
  assert.ok(out.includes('sk-c17...98be'), 'keeps correlatable prefix/suffix');
});

test('redacted output no longer matches secret-scanner shapes', () => {
  const out = redactLeakedCredentials(`a ${GEMINI} b ${DEEPSEEK} c`);
  assert.equal(/AIza[0-9A-Za-z_-]{35}/.test(out), false);
  assert.equal(/\bsk-[A-Za-z0-9]{20,}\b/.test(out), false);
});

test('leaves detection content untouched', () => {
  const yara = '$dev_deepseek = "main.deepseekAPIKey" ascii';
  assert.equal(redactLeakedCredentials(yara), yara);
  assert.equal(redactLeakedCredentials('no secrets here'), 'no secrets here');
  assert.equal(redactLeakedCredentials(''), '');
  assert.equal(redactLeakedCredentials(null), null);
});
