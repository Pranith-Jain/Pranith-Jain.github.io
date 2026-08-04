import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeverityBadge, SeverityDot } from '../SeverityBadge';
import type { Severity } from '../severity';

describe('SeverityBadge', () => {
  it('renders the severity label uppercased', () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('renders a score after the label when provided', () => {
    render(<SeverityBadge severity="high" score="9.8" />);
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('9.8')).toBeInTheDocument();
  });

  it('renders children override when provided', () => {
    render(<SeverityBadge severity="medium">CUSTOM</SeverityBadge>);
    expect(screen.getByText('CUSTOM')).toBeInTheDocument();
  });

  it('applies the SEVERITY_TONE class for the severity', () => {
    const { container } = render(<SeverityBadge severity="critical" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('border-rose-500');
    expect(span?.className).toContain('text-rose-700');
  });

  it('applies the xs size class when size="xs"', () => {
    const { container } = render(<SeverityBadge severity="low" size="xs" />);
    expect(container.querySelector('span')?.className).toContain('text-micro');
  });

  it('renders all five severity levels without crashing', () => {
    const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    for (const s of severities) {
      const { unmount } = render(<SeverityBadge severity={s} />);
      unmount();
    }
  });
});

describe('SeverityDot', () => {
  it('renders a solid-fill dot with the SEVERITY_BAR color', () => {
    const { container } = render(<SeverityDot severity="critical" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-rose-500');
    expect(span?.className).toContain('rounded-full');
  });

  it('has an accessible label', () => {
    render(<SeverityDot severity="high" />);
    expect(screen.getByRole('img', { name: 'high' })).toBeInTheDocument();
  });

  it('accepts a custom label', () => {
    render(<SeverityDot severity="medium" label="Medium severity" />);
    expect(screen.getByRole('img', { name: 'Medium severity' })).toBeInTheDocument();
  });

  it('accepts a custom className for sizing', () => {
    const { container } = render(<SeverityDot severity="low" className="h-2 w-2" />);
    expect(container.querySelector('span')?.className).toContain('h-2 w-2');
  });
});
