import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Tooltip } from '../ui/Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders children', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('shows tooltip on focus', () => {
    render(
      <Tooltip content="Tooltip text" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    const button = screen.getByText('Hover me');
    act(() => {
      button.focus();
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Tooltip text')).toBeInTheDocument();
  });

  it('hides tooltip on blur', () => {
    render(
      <Tooltip content="Tooltip text" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    const button = screen.getByText('Hover me');
    act(() => {
      button.focus();
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    act(() => {
      button.blur();
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('associates tooltip with trigger via aria-describedby when visible', () => {
    render(
      <Tooltip content="Helper text" delay={0}>
        <button>Hover me</button>
      </Tooltip>
    );
    const button = screen.getByText('Hover me');
    // Before hover, no aria-describedby
    expect(button.parentElement).not.toHaveAttribute('aria-describedby');
    // After focus, tooltip appears with aria-describedby
    act(() => {
      button.focus();
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(button.parentElement).toHaveAttribute('aria-describedby');
  });
});
