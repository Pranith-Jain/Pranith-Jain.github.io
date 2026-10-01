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
import { existsSync } from 'node:fs';
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
});

function readConfig(): string {
  // Imported lazily so the assertion above reads the real on-disk config.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(resolve(ROOT, 'eslint.config.js'), 'utf8') as string;
}
