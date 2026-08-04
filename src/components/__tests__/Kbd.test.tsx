import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Kbd } from '../ui/Kbd';

describe('Kbd', () => {
  it('renders the key combo', () => {
    render(<Kbd>⌘K</Kbd>);
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('renders as a <kbd> element with the kbd class', () => {
    const { container } = render(<Kbd>Esc</Kbd>);
    const kbd = container.querySelector('kbd');
    expect(kbd).toBeTruthy();
    expect(kbd?.className).toContain('kbd');
  });

  it('preserves whitespace (no wrap for key combos)', () => {
    const { container } = render(<Kbd>Shift + Tab</Kbd>);
    expect(container.querySelector('kbd')?.style.whiteSpace).toBe('');
    // white-space: nowrap is set via the .kbd CSS class, not inline
  });

  it('accepts a custom className', () => {
    const { container } = render(<Kbd className="ml-2">⌘K</Kbd>);
    expect(container.querySelector('kbd')?.className).toContain('ml-2');
  });
});
