import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '../ui/EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No results" description="Try a different search." />);
    expect(screen.getByText('Try a different search.')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState title="No results" />);
    expect(container.querySelector('p')).not.toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="No results" icon={<span data-testid="test-icon" />} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders action element when provided', () => {
    render(<EmptyState title="No results" action={<button>Try again</button>} />);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('clicking action button fires callback', async () => {
    const onClick = vi.fn();
    render(<EmptyState title="No results" action={<button onClick={onClick}>Try again</button>} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('has role="status"', () => {
    render(<EmptyState title="No results" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('applies default md size classes', () => {
    const { container } = render(<EmptyState title="No results" />);
    expect(container.firstChild).toHaveClass('py-10');
  });

  it('applies sm size classes', () => {
    const { container } = render(<EmptyState title="No results" size="sm" />);
    expect(container.firstChild).toHaveClass('py-6');
  });

  it('applies lg size classes', () => {
    const { container } = render(<EmptyState title="No results" size="lg" />);
    expect(container.firstChild).toHaveClass('py-16');
  });

  it('applies additional className', () => {
    const { container } = render(<EmptyState title="No results" className="my-custom-class" />);
    expect(container.firstChild).toHaveClass('my-custom-class');
  });
});
