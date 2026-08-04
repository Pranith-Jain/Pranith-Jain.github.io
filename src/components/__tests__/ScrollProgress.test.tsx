import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollProgress } from '../ui/ScrollProgress';

describe('ScrollProgress', () => {
  it('renders a progressbar with the correct width', () => {
    const { container } = render(<ScrollProgress progress={42} />);
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.width).toBe('42%');
  });

  it('sets aria-valuenow to the rounded progress', () => {
    render(<ScrollProgress progress={67.8} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '68');
  });

  it('sets aria-valuemin=0 and aria-valuemax=100', () => {
    render(<ScrollProgress progress={50} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('has an accessible label', () => {
    render(<ScrollProgress progress={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Page scroll progress');
  });

  it('handles 0% and 100% bounds', () => {
    const { container: c0 } = render(<ScrollProgress progress={0} />);
    expect((c0.querySelector('[role="progressbar"]') as HTMLElement).style.width).toBe('0%');
    const { container: c100 } = render(<ScrollProgress progress={100} />);
    expect((c100.querySelector('[role="progressbar"]') as HTMLElement).style.width).toBe('100%');
  });
});
