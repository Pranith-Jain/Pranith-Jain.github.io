import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusDot } from '../ui/StatusDot';

describe('StatusDot', () => {
  it('renders a span element', () => {
    const { container } = render(<StatusDot />);
    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('applies neutral variant by default', () => {
    const { container } = render(<StatusDot />);
    expect(container.firstChild).toHaveClass('bg-slate-400');
  });

  it('applies success variant', () => {
    const { container } = render(<StatusDot variant="success" />);
    expect(container.firstChild).toHaveClass('bg-emerald-500');
  });

  it('applies warning variant', () => {
    const { container } = render(<StatusDot variant="warning" />);
    expect(container.firstChild).toHaveClass('bg-amber-500');
  });

  it('applies error variant', () => {
    const { container } = render(<StatusDot variant="error" />);
    expect(container.firstChild).toHaveClass('bg-rose-500');
  });

  it('applies info variant', () => {
    const { container } = render(<StatusDot variant="info" />);
    expect(container.firstChild).toHaveClass('bg-brand-500');
  });

  it('applies active variant', () => {
    const { container } = render(<StatusDot variant="active" />);
    expect(container.firstChild).toHaveClass('bg-sky-500');
  });

  it('applies pulse class when pulse is true', () => {
    const { container } = render(<StatusDot pulse />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  it('does not apply pulse class by default', () => {
    const { container } = render(<StatusDot />);
    expect(container.firstChild).not.toHaveClass('animate-pulse');
  });

  it('applies sm size by default', () => {
    const { container } = render(<StatusDot />);
    expect(container.firstChild).toHaveClass('h-1.5 w-1.5');
  });

  it('applies md size', () => {
    const { container } = render(<StatusDot size="md" />);
    expect(container.firstChild).toHaveClass('h-2 w-2');
  });

  it('sets role="img" when label is provided', () => {
    render(<StatusDot label="Online" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Online');
  });

  it('does not set role when label is not provided', () => {
    const { container } = render(<StatusDot />);
    expect(container.firstChild).not.toHaveAttribute('role');
  });

  it('applies additional className', () => {
    const { container } = render(<StatusDot className="custom-dot" />);
    expect(container.firstChild).toHaveClass('custom-dot');
  });

  it('renders as inline-block', () => {
    const { container } = render(<StatusDot />);
    expect(container.firstChild).toHaveClass('inline-block');
  });

  it('has rounded-full class for pill shape', () => {
    const { container } = render(<StatusDot />);
    expect(container.firstChild).toHaveClass('rounded-full');
  });
});
