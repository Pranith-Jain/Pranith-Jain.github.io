import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from '../ui/Toggle';

describe('Toggle', () => {
  it('renders label', () => {
    render(<Toggle label="Dark mode" checked={false} onChange={vi.fn()} />);
    expect(screen.getByText('Dark mode')).toBeInTheDocument();
  });

  it('renders switch role', () => {
    render(<Toggle label="Dark mode" checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('sets aria-checked based on checked prop', () => {
    const { rerender } = render(<Toggle label="Dark mode" checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    rerender(<Toggle label="Dark mode" checked={true} onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with inverted value when clicked', async () => {
    const onChange = vi.fn();
    render(<Toggle label="Dark mode" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders description when provided', () => {
    render(<Toggle label="Dark mode" checked={false} onChange={vi.fn()} description="Toggle dark theme" />);
    expect(screen.getByText('Toggle dark theme')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Toggle label="Dark mode" checked={false} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
