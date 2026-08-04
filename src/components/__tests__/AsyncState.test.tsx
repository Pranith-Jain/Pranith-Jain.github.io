import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AsyncState } from '../AsyncState';

describe('AsyncState — loading', () => {
  it('renders list skeleton variant by default', () => {
    const { container } = render(<AsyncState loading>Content</AsyncState>);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    // list skeleton = uniform bars
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders table skeleton variant with header row', () => {
    const { container } = render(
      <AsyncState loading skeletonVariant="table" skeletonRows={3}>
        Content
      </AsyncState>
    );
    // table variant has a border-b header row
    expect(container.querySelector('.border-b')).toBeTruthy();
  });

  it('renders cards skeleton variant with surface-card', () => {
    const { container } = render(
      <AsyncState loading skeletonVariant="cards" skeletonRows={4}>
        Content
      </AsyncState>
    );
    expect(container.querySelectorAll('.surface-card').length).toBe(4);
  });
});

describe('AsyncState — empty (rich states)', () => {
  it('renders default Inbox icon when no emptyIcon provided', () => {
    render(<AsyncState empty emptyLabel="No IOCs found" />);
    // lucide Inbox renders as an svg
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('No IOCs found')).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeTruthy();
  });

  it('renders custom emptyIcon when provided', () => {
    render(<AsyncState empty emptyLabel="No results" emptyIcon={<span data-testid="custom-icon">🔍</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders emptyAction CTA when provided', () => {
    render(<AsyncState empty emptyLabel="No IOCs found" emptyAction={<button>Try a different indicator</button>} />);
    expect(screen.getByRole('button', { name: /try a different indicator/i })).toBeInTheDocument();
  });

  it('does not render action area when emptyAction is absent', () => {
    const { container } = render(<AsyncState empty emptyLabel="Empty" />);
    // no button in the empty state
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('AsyncState — error (recovery hints)', () => {
  it('renders error message and retry button', () => {
    const onRetry = vi.fn();
    render(
      <AsyncState error="Upstream timeout" onRetry={onRetry}>
        Content
      </AsyncState>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Upstream timeout')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders errorHint when provided', () => {
    render(
      <AsyncState error="Rate limited" errorHint="The upstream provider may be rate-limiting — try again in 60s.">
        Content
      </AsyncState>
    );
    expect(screen.getByText(/rate-limiting/i)).toBeInTheDocument();
  });

  it('does not render errorHint when absent', () => {
    render(<AsyncState error="Failed">Content</AsyncState>);
    expect(screen.queryByText(/rate-limiting/i)).toBeNull();
  });

  it('calls onRetry when retry button clicked', async () => {
    const onRetry = vi.fn();
    render(
      <AsyncState error="Failed" onRetry={onRetry}>
        Content
      </AsyncState>
    );
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render retry button when onRetry is absent', () => {
    render(<AsyncState error="Failed">Content</AsyncState>);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});

describe('AsyncState — children', () => {
  it('renders children when not loading/error/empty', () => {
    render(<AsyncState>Actual content</AsyncState>);
    expect(screen.getByText('Actual content')).toBeInTheDocument();
  });

  it('renders idleContent when idle', () => {
    render(
      <AsyncState idle idleContent={<div>Idle state</div>}>
        Content
      </AsyncState>
    );
    expect(screen.getByText('Idle state')).toBeInTheDocument();
    expect(screen.queryByText('Content')).toBeNull();
  });
});
