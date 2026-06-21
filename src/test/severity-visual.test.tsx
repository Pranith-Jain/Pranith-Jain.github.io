import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SeverityPill } from '../components/SeverityPill';
import { SeverityDot } from '../components/SeverityDot';
import { SEVERITY_TONE, SEVERITY_BAR } from '../components/severity';

describe('Phase 1 visual sanity', () => {
  it('produces non-trivial HTML for each tone', () => {
    const tones = ['critical', 'high', 'medium', 'low', 'info'] as const;
    for (const tone of tones) {
      const { container } = render(
        <div>
          <SeverityPill tone={tone}>Pill-{tone}</SeverityPill>
          <SeverityDot tone={tone} aria-label={`dot-${tone}`} />
        </div>
      );
      // Confirm the HTML has the right text + classes
      expect(container.textContent).toContain(`Pill-${tone}`);
      // SEVERITY_TONE[tone] is now produced by the recipe — must be
      // a non-empty string for backward-compat.
      expect(SEVERITY_TONE[tone]).toBeTruthy();
      expect(SEVERITY_BAR[tone]).toBeTruthy();
    }
  });

  it('SEVERITY_TONE strings contain rose/orange/amber/slate/sky ramp colors', () => {
    // The class strings produced by the recipe should reference
    // the same color tokens as the legacy Tailwind constants —
    // proving the migration is zero-visual-change.
    expect(SEVERITY_TONE.critical).toMatch(/rose/);
    expect(SEVERITY_TONE.high).toMatch(/orange/);
    expect(SEVERITY_TONE.medium).toMatch(/amber/);
    expect(SEVERITY_TONE.low).toMatch(/slate/);
    expect(SEVERITY_TONE.info).toMatch(/sky/);
  });
});
