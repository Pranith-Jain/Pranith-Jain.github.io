import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../ui/Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Click
      </Button>
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not call onClick when loading', async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Click
      </Button>
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders as disabled when loading', () => {
    render(<Button loading>Click</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders loader icon when loading', () => {
    render(<Button loading>Click</Button>);
    const button = screen.getByRole('button');
    expect(button.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('sets aria-busy when loading', () => {
    render(<Button loading>Click</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders as anchor when href is provided', () => {
    render(<Button href="https://example.com">Link</Button>);
    const link = screen.getByRole('link', { name: /link/i });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('applies variant classes', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-slate-900');

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-red-700');
  });

  it('applies size classes', () => {
    const { rerender } = render(<Button size="xs">XS</Button>);
    expect(screen.getByRole('button')).toHaveClass('px-1.5');

    rerender(<Button size="xl">XL</Button>);
    expect(screen.getByRole('button')).toHaveClass('px-5');
  });

  it('renders icon on left by default', () => {
    render(<Button icon={<span data-testid="icon" />}>With Icon</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies fullWidth class', () => {
    render(<Button fullWidth>Full</Button>);
    expect(screen.getByRole('button')).toHaveClass('w-full');
  });
});
