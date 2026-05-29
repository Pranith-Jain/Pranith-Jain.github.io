import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '../ui/Checkbox';

describe('Checkbox', () => {
  it('renders label', () => {
    render(<Checkbox label="Accept terms" checked={false} onChange={vi.fn()} />);
    expect(screen.getByText('Accept terms')).toBeInTheDocument();
  });

  it('renders checkbox input', () => {
    render(<Checkbox label="Accept" checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('calls onChange when clicked', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Accept" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is checked when checked is true', () => {
    render(<Checkbox label="Accept" checked={true} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('renders description', () => {
    render(<Checkbox label="Accept" checked={false} onChange={vi.fn()} description="This is required" />);
    expect(screen.getByText('This is required')).toBeInTheDocument();
  });

  it('is disabled when disabled is true', () => {
    render(<Checkbox label="Accept" checked={false} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
