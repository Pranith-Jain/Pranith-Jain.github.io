import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SeverityPill } from '../components/SeverityPill';

/**
 * Phase 2 visual smoke test — renders the migrated SeverityPill in
 * the same way the migrated pages do (QuickCveLookup, Detections,
 * GlobalPulse). Confirms the rendered HTML is non-empty and contains
 * the right color references for each tone.
 */
describe('Phase 2: Migrated consumer render checks', () => {
  it('renders the QuickCveLookup style (font-bold override)', () => {
    const { container } = render(
      <SeverityPill tone="critical" className="font-bold">
        CRITICAL 9.8
      </SeverityPill>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe('CRITICAL 9.8');
    // The base recipe + the override className should both be present
    expect(el.className).toMatch(/font-bold/);
    expect(el.className).toMatch(/rose/);
  });

  it('renders the Detections hero style (no overrides)', () => {
    const { container } = render(<SeverityPill tone="high">high</SeverityPill>);
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe('high');
    expect(el.className).toMatch(/orange/);
  });

  it('renders the Detections list-item style (px-1 override)', () => {
    const { container } = render(
      <SeverityPill tone="medium" className="px-1">
        medium
      </SeverityPill>
    );
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe('medium');
    // The px-1 override should win (Tailwind cascade)
    expect(el.className).toMatch(/px-1/);
    expect(el.className).toMatch(/amber/);
  });

  it('renders the GlobalPulse style (children = severity name)', () => {
    const { container } = render(<SeverityPill tone="critical">critical</SeverityPill>);
    const el = container.firstChild as HTMLElement;
    expect(el.textContent).toBe('critical');
    expect(el.getAttribute('data-severity')).toBe('critical');
  });
});
