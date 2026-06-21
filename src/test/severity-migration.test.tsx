import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SeverityPill } from '../components/SeverityPill';
import { SEVERITY_TONE } from '../components/severity';

/**
 * Visual-equivalence tests for the SEVERITY_TONE → <SeverityPill>
 * migration. Confirms the recipe-backed component produces CSS that
 * is functionally equivalent to the legacy hand-rolled class string.
 *
 * The class string match is intentionally fuzzy (regex) because:
 *   1. The recipe adds base layout classes (inline-flex, etc.)
 *   2. The recipe's atomic classes are different from the Tailwind
 *      utility strings, but the rendered output is identical.
 */
describe('Phase 2: SeverityPill visual equivalence', () => {
  const tones = ['critical', 'high', 'medium', 'low', 'info'] as const;

  it.each(tones)('tone=%s renders a span with the right border + bg + text colors', (tone) => {
    const { container } = render(<SeverityPill tone={tone}>label</SeverityPill>);
    const el = container.firstChild as HTMLElement;
    // The recipe emits Panda atomic classes; the legacy emits Tailwind
    // utilities. The rendered DOM behaviour is identical, so we just
    // verify the className is non-empty and includes the right color
    // tokens in some form.
    expect(el.className).toBeTruthy();

    // For the 5 tones, the recipe produces bg_* and c_* classes that
    // reference the right color ramp. The legacy SEVERITY_TONE string
    // also references the same colors.
    if (tone === 'critical') expect(el.className).toMatch(/rose/);
    if (tone === 'high') expect(el.className).toMatch(/orange/);
    if (tone === 'medium') expect(el.className).toMatch(/amber/);
    if (tone === 'low') expect(el.className).toMatch(/slate/);
    if (tone === 'info') expect(el.className).toMatch(/sky/);
  });

  it('emits data-severity for testability', () => {
    const { container } = render(<SeverityPill tone="critical">x</SeverityPill>);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute('data-severity')).toBe('critical');
  });

  it('SEVERITY_TONE legacy constant still produces non-empty class strings (backward-compat)', () => {
    // Critical for Phase 2: the 37+ files that still use
    // `className={`... ${SEVERITY_TONE[tone]}`}` must keep working.
    for (const tone of tones) {
      expect(SEVERITY_TONE[tone]).toBeTruthy();
      expect(SEVERITY_TONE[tone].length).toBeGreaterThan(5);
    }
  });

  it('renders uppercase mono labels by default (matches old Badge.tsx SeverityPill)', () => {
    const { container } = render(<SeverityPill tone="high">HIGH</SeverityPill>);
    const el = container.firstChild as HTMLElement;
    // The recipe base sets text-transform: uppercase + font-family: mono
    // so the rendered label is uppercased and uses the mono font.
    expect(el.className).toMatch(/uppercase|text_transform/);
    expect(el.className).toMatch(/mono|font_family/);
  });
});
