import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { eyebrow, displayHeading, chip } from '../styled/recipes';

/**
 * Phase 4 tests for the 3 new high-leverage recipes.
 * These are the patterns that appear 100+ times in the codebase:
 *   - eyebrow (151 uses) — uppercase mono tracked label
 *   - displayHeading (16+ uses) — h1/h2 with display font
 *   - chip (12+ uses) — small inline label / skill tag
 */
describe('Phase 4: High-leverage recipes', () => {
  describe('eyebrow', () => {
    it('renders with default tracking (0.2em)', () => {
      const { container } = render(<div className={eyebrow()}>Section</div>);
      const el = container.firstChild as HTMLElement;
      expect(el.textContent).toBe('Section');
      expect(el.className).toMatch(/uppercase/);
      expect(el.className).toMatch(/mono/);
      expect(el.className).toMatch(/slate.500/);
    });

    it('respects the tracking variant', () => {
      const { container } = render(<div className={eyebrow({ tracking: 'tight' })}>Tight</div>);
      const el = container.firstChild as HTMLElement;
      // tight = 0.16em
      expect(el.className).toMatch(/0.16em/);
    });
  });

  describe('displayHeading', () => {
    it('renders the lg size (h1 hero)', () => {
      const { container } = render(<h1 className={displayHeading({ size: 'lg' })}>Title</h1>);
      const el = container.firstChild as HTMLElement;
      expect(el.textContent).toBe('Title');
      expect(el.className).toMatch(/display/);
      expect(el.className).toMatch(/bold/);
    });

    it('renders the md size (h2 section)', () => {
      const { container } = render(<h2 className={displayHeading({ size: 'md' })}>Section</h2>);
      const el = container.firstChild as HTMLElement;
      expect(el.className).toMatch(/display/);
    });
  });

  describe('chip', () => {
    it('renders a default (neutral) chip', () => {
      const { container } = render(<span className={chip()}>Python</span>);
      const el = container.firstChild as HTMLElement;
      expect(el.textContent).toBe('Python');
      expect(el.className).toMatch(/bdr_md/);
      expect(el.className).toMatch(/bd-c_slate\.200/);
    });

    it('renders a brand chip with hover state', () => {
      const { container } = render(<span className={chip({ tone: 'brand' })}>Active</span>);
      const el = container.firstChild as HTMLElement;
      expect(el.className).toMatch(/bd-c_brand\.500\/30/);
      expect(el.className).toMatch(/hover/);
    });
  });
});
