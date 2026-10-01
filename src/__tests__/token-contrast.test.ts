/**
 * Design-token contrast floor.
 *
 * Why this exists
 * ---------------
 * A WCAG ratio is a derived number: change a channel value in `index.css` and
 * it moves silently. The 1.4.11 fix that introduced `--border-input` was
 * picked by measuring candidate values, so nothing structurally stops a later
 * tweak from pushing it back under the threshold.
 *
 * These tests pin the *floor*, not the exact value. Raising a border's
 * contrast is always safe and often desirable; silently lowering it is the
 * regression worth failing on. Each case states the governing criterion:
 *
 *   - body/muted/heading text -> SC 1.4.3 (AA), 4.5:1
 *   - form-control boundary  -> SC 1.4.11 (non-text), 3:1
 *
 * A failure here means a token no longer satisfies the rule it was added for.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ── WCAG 2.1 relative luminance + contrast ─────────────────────────── */

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const luminance = ([r, g, b]: RGB): number =>
  0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);

const contrast = (a: RGB, b: RGB): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

type RGB = [number, number, number];

/** Composite an `r g b / a` channel triple over a solid backdrop. */
const composite = (fg: RGB, alpha: number, bg: RGB): RGB =>
  fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB;

/* ── Read the real tokens out of the stylesheet ──────────────────────── */

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/**
 * Pull `--name: R G B;` (or `R G B / A`) out of a specific theme block.
 * `html.dark` is matched first because `:root` appears earlier in the file.
 */
function token(name: string, mode: 'light' | 'dark'): RGB {
  // Callers pass the bare name ('surface-100'); the pattern supplies the dashes.
  const scope = themeScope(mode);
  const re = new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`);
  const m = re.exec(scope);
  if (!m) throw new Error(`token --${name} not found for mode=${mode}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Locate a theme's token block.
 *
 * Naive slicing on the first `html.dark {` is wrong: index.css has an early
 * `html.dark` block that only sets `color-scheme` and the canvas, with the
 * `:root` colour tokens coming after it. So the light scope is "everything up
 * to the *last* `html.dark` block" and the dark scope is "everything after it",
 * which puts each theme's tokens on the correct side of the boundary.
 */
function themeScope(mode: 'light' | 'dark'): string {
  const darkStart = css.lastIndexOf('html.dark {');
  return mode === 'dark' ? css.slice(darkStart) : css.slice(0, darkStart);
}

/** Resolve an alpha triple like `0 0 0 / 0.08` against a backdrop. */
function alphaToken(name: string, mode: 'light' | 'dark', over: RGB): RGB {
  const re = new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*/\\s*([\\d.]+)`);
  const m = re.exec(themeScope(mode));
  if (!m) throw new Error(`alpha token --${name} not found for mode=${mode}`);
  return composite([Number(m[1]), Number(m[2]), Number(m[3])], Number(m[4]), over);
}

const TEXT_MIN = 4.5; // SC 1.4.3 AA, normal weight
const NONTEXT_MIN = 3.0; // SC 1.4.11, component boundaries

describe('design token contrast: text (SC 1.4.3 AA, 4.5:1)', () => {
  for (const mode of ['light', 'dark'] as const) {
    for (const [fg, label] of [
      ['ink-heading', 'heading'],
      ['ink-body', 'body'],
      ['muted', 'muted'],
    ] as const) {
      it(`${label} clears 4.5:1 on every surface (${mode})`, () => {
        const color = token(fg, mode);
        for (const surface of ['surface-100', 'surface-200', 'surface-300'] as const) {
          const bg = token(surface, mode);
          expect(
            contrast(color, bg),
            `--${fg} on --${surface} (${mode}) is ${contrast(color, bg).toFixed(2)}:1, below the 4.5:1 text floor`
          ).toBeGreaterThanOrEqual(TEXT_MIN);
        }
      });
    }
  }
});

describe('design token contrast: form control boundary (SC 1.4.11, 3:1)', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`--border-input clears 3:1 on every surface it can sit on (${mode})`, () => {
      const border = token('border-input', mode);
      // Inputs render on surface-100 (light) / surface-200 (dark), but the
      // canvas is the worst case for a dark-theme border, so check all three.
      for (const surface of ['surface-100', 'surface-200', 'surface-300'] as const) {
        const bg = token(surface, mode);
        expect(
          contrast(border, bg),
          `--border-input on --${surface} (${mode}) is ${contrast(border, bg).toFixed(2)}:1, below the 3:1 non-text floor`
        ).toBeGreaterThanOrEqual(NONTEXT_MIN);
      }
    });
  }

  /**
   * Documents why --border-input is separate from the ladder. If this ever
   * starts passing, the two tokens have converged and the distinction is no
   * longer earning its place.
   */
  it('the decorative hairline ladder is still distinguishable from --border-input', () => {
    for (const mode of ['light', 'dark'] as const) {
      const surface = token('surface-100', mode);
      const input = token('border-input', mode);
      const hairline = alphaToken('border-400', mode, surface);
      expect(contrast(input, hairline)).toBeGreaterThan(0.3);
    }
  });
});

describe('design token contrast: decorative hairlines are not held to 3:1', () => {
  /**
   * Explicitly records the decision from the audit: --border-4/5/6 are
   * layout separators, not component boundaries, so SC 1.4.11 does not apply.
   * If this test is ever deleted to force a blanket contrast fix, that fix
   * would be solving the wrong problem and flattening the visual hierarchy.
   */
  it('records that --border-400 is intentionally below the non-text floor', () => {
    for (const mode of ['light', 'dark'] as const) {
      const surface = token('surface-100', mode);
      const hairline = alphaToken('border-400', mode, surface);
      const r = contrast(hairline, surface);
      expect(r).toBeGreaterThan(1.0); // visible as a hairline
      expect(r).toBeLessThan(NONTEXT_MIN); // and intentionally not 3:1
    }
  });
});
