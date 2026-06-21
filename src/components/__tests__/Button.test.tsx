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
    // Panda atomic class for bg-slate-900 (post-migration); the
    // legacy Tailwind class was 'bg-slate-900'.
    expect(screen.getByRole('button')).toHaveClass('bg_slate.900');

    rerender(<Button variant="danger">Danger</Button>);
    // The Panda atomic class is a re-mapping of the Tailwind token
    // (red.700 in our color ramp). The exact class string changes;
    // what matters is that the rendered button picks up the variant.
    expect(screen.getByRole('button').className).toMatch(/red\.700|bg_red/);
  });

  it('applies size classes', () => {
    const { rerender } = render(<Button size="xs">XS</Button>);
    // Panda atomic class for px-1.5 (post-migration). The recipe's
    // size variant sets both height and horizontal padding.
    expect(screen.getByRole('button').className).toMatch(/px_1\.5/);
    expect(screen.getByRole('button').className).toMatch(/h_7/);

    rerender(<Button size="xl">XL</Button>);
    expect(screen.getByRole('button').className).toMatch(/px_5/);
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
