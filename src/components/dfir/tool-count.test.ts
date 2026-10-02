/**
 * Drift guard for the mirrored tool count.
 *
 * `src/components/dfir/tool-count.ts` is a leaf module with no imports,
 * because `tool-sections.ts` drags in ~40 lucide icons and importing it from
 * `sidebar-nav.ts` (reachable from the eager `AppShell`) added ~34KB to the
 * entry bundle. That makes the literal a mirror of a derived value, which is
 * exactly the kind of duplication that rots quietly: add a tool to `SECTIONS`,
 * the hero updates itself, and the sidebar keeps printing the old number.
 *
 * So the literal is pinned here against the real derivation. Any change to
 * `SECTIONS` that moves the count fails this test until `tool-count.ts` is
 * updated in the same commit.
 *
 * If this fails, the fix is to update the literal to the expected value shown
 * in the assertion message - NOT to change `SECTIONS` to match the literal.
 */

import { describe, it, expect } from 'vitest';
import { MAIN_TOOL_COUNT as MIRRORED } from './tool-count';
import { SECTIONS } from './tool-sections';

const derived = SECTIONS.reduce((n, s) => n + s.tools.filter((t) => !t.utility).length, 0);
const utilityCount = SECTIONS.reduce((n, s) => n + s.tools.filter((t) => t.utility).length, 0);

describe('dfir tool-count mirror', () => {
  it('matches the count derived from SECTIONS', () => {
    expect(
      MIRRORED,
      `tool-count.ts says ${MIRRORED} but SECTIONS derives ${derived} ` +
        `(${SECTIONS.reduce((n, s) => n + s.tools.length, 0)} tools total, ${utilityCount} flagged utility). ` +
        `Update MAIN_TOOL_COUNT in src/components/dfir/tool-count.ts to ${derived} in the same commit ` +
        `that changed SECTIONS - do not edit SECTIONS to match the literal.`
    ).toBe(derived);
  });

  it('is not accidentally zero or absurd', () => {
    // Catches the two ways this file silently rots without SECTIONS moving:
    // someone resetting it to a placeholder, or a botched bulk edit.
    expect(MIRRORED).toBeGreaterThan(50);
    expect(MIRRORED).toBeLessThan(SECTIONS.reduce((n, s) => n + s.tools.length, 0) + 1);
  });
});
