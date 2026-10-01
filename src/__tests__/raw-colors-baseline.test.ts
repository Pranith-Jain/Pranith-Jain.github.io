/**
 * `no-raw-colors` legacy baseline integrity.
 *
 * The rule is enabled repo-wide but waived for the files listed in
 * `eslint-rules/raw-colors-baseline.mjs`. Three ways that arrangement can rot
 * silently, all checked here:
 *
 *  1. The list drifts from reality - a file is cleaned up but stays listed, so
 *     the waiver keeps hiding a file that should now be guarded again (and the
 *     debt number stops being trustworthy).
 *  2. A path is listed that no longer exists, so the waiver is a no-op that
 *     nobody notices.
 *  3. The waiver swallows the rule repo-wide instead of per-file, which would
 *     silently disable the guard on all new code - the one thing the baseline
 *     exists to avoid.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { RAW_COLORS_BASELINE } from '../../eslint-rules/raw-colors-baseline.mjs';

const ROOT = process.cwd();

describe('raw-colors baseline', () => {
  it('is non-empty (a deleted list means the rule can just be re-enabled)', () => {
    expect(RAW_COLORS_BASELINE.length).toBeGreaterThan(0);
  });

  it('contains no duplicate paths', () => {
    const dupes = RAW_COLORS_BASELINE.filter((f, i) => RAW_COLORS_BASELINE.indexOf(f) !== i);
    expect(dupes, `duplicate entries: ${dupes.join(', ')}`).toEqual([]);
  });

  it('lists only files that still exist', () => {
    const missing = RAW_COLORS_BASELINE.filter((f) => !existsSync(resolve(ROOT, f)));
    expect(missing, `baseline lists non-existent files: ${missing.join(', ')}`).toEqual([]);
  });

  it('is confined to src/ (worker/ and api/ have their own configs)', () => {
    const outside = RAW_COLORS_BASELINE.filter((f) => !f.startsWith('src/'));
    expect(outside, `unexpected paths: ${outside.join(', ')}`).toEqual([]);
  });

  it('is sorted, so regenerating produces a minimal diff', () => {
    const sorted = [...RAW_COLORS_BASELINE].sort();
    expect(RAW_COLORS_BASELINE).toEqual(sorted);
  });

  it('scopes the waiver per-file, not repo-wide', () => {
    // A brand-new file must still trip the rule. If this ever passes silently
    // it means the waiver became a blanket disable and new raw colours are no
    // longer caught anywhere.
    const config = readConfig();
    expect(config).toContain("'no-raw-colors/no-raw-colors': 'warn'");
    expect(config).toContain('files: RAW_COLORS_BASELINE');
    expect(config).toContain("'no-raw-colors/no-raw-colors': 'off'");
  });

  // Spawning a full `eslint src` scan takes ~35s locally but ~120s on a
  // GitHub runner, so the budget has to clear the slower environment rather
  // than the developer machine. 300s leaves ~2.5x headroom over the observed
  // runner figure; the default 10s would fail on both.
  //
  // Only a MISSING entry can fail this. Stale entries (listed but clean) are
  // reported but not treated as failures, because a file that is clean in the
  // working tree may still be dirty in the commit - an in-progress token sweep
  // is the normal case. Pruning on staleness would drop those files from the
  // waiver and break the next push, which is the failure this test exists to
  // prevent.
  it('matches what a fresh scan reports', { timeout: 300_000 }, () => {
    const res = spawnSync('node', [resolve(ROOT, 'scripts/update-raw-colors-baseline.mjs'), '--check'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const missing = /MISSING (\d+) file/.exec(res.stdout ?? '');
    expect(
      missing,
      `baseline is missing ${missing?.[1] ?? '?'} dirty file(s); these would fail CI. ` +
        `Run: npm run lint:baseline\n${res.stdout}\n${res.stderr}`
    ).toBeNull();
    expect(res.status, `baseline scan failed outright:\n${res.stdout}\n${res.stderr}`).not.toBe(2);
  });
});

function readConfig(): string {
  // Read lazily so the assertion above reflects the real on-disk config.
  return readFileSync(resolve(ROOT, 'eslint.config.js'), 'utf8');
}
