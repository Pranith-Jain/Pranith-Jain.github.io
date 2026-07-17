import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner, SpinnerCentered } from '../ui/Spinner';

describe('Spinner', () => {
  it('renders the loading indicator', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('has role="status" and aria-live="polite"', () => {
    render(<Spinner />);
    const el = screen.getByRole('status');
    expect(el).toHaveAttribute('aria-live', 'polite');
  });

  it('renders screen-reader-only label', () => {
    render(<Spinner label="Fetching data…" />);
    expect(screen.getByText('Fetching data…')).toHaveClass('sr-only');
  });

  it('uses default label', () => {
    render(<Spinner />);
    expect(screen.getByText('Loading…')).toHaveClass('sr-only');
  });

  it('applies default md size', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('h-5 w-5');
  });

  it('applies sm size', () => {
    const { container } = render(<Spinner size="sm" />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('h-4 w-4');
  });

  it('applies lg size', () => {
    const { container } = render(<Spinner size="lg" />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('h-8 w-8');
  });

  it('applies xl size', () => {
    const { container } = render(<Spinner size="xl" />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('h-12 w-12');
  });

  it('applies spin animation', () => {
    const { container } = render(<Spinner />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('animate-spin');
  });

  it('applies additional className', () => {
    const { container } = render(<Spinner className="my-class" />);
    expect(container.firstChild).toHaveClass('my-class');
  });
});

describe('SpinnerCentered', () => {
  it('renders centered spinner', () => {
    const { container } = render(<SpinnerCentered />);
    expect(container.firstChild).toHaveClass('flex', 'min-h-[200px]', 'items-center', 'justify-center');
  });

  it('renders spinner inside', () => {
    render(<SpinnerCentered />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
