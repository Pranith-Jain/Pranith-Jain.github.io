import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardBody, CardFooter } from '../components/ui/Card';

describe('Card', () => {
  it('renders children inside the card', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies a non-empty className with the default variant', () => {
    render(<Card data-testid="card">X</Card>);
    const card = screen.getByTestId('card');
    expect(card.className).toBeTruthy();
    expect(card.className.length).toBeGreaterThan(5);
  });

  it('emits the glass variant class for variant="glass"', () => {
    render(
      <Card variant="glass" data-testid="card">
        X
      </Card>
    );
    const card = screen.getByTestId('card');
    // Glass variant overrides bg + border to translucent values.
    expect(card.className).toMatch(/rgba\(255/);
  });

  it('emits the elevated variant class for variant="elevated"', () => {
    render(
      <Card variant="elevated" data-testid="card">
        X
      </Card>
    );
    const card = screen.getByTestId('card');
    // Elevated uses the e3 shadow token.
    expect(card.className).toMatch(/e3/);
  });

  it('respects the interactive boolean', () => {
    const { rerender } = render(
      <Card interactive data-testid="card">
        X
      </Card>
    );
    const interactive = screen.getByTestId('card');
    expect(interactive.className).toMatch(/cursor_pointer/);

    rerender(<Card data-testid="card">Y</Card>);
    const staticCard = screen.getByTestId('card');
    expect(staticCard.className).not.toMatch(/cursor_pointer/);
  });

  it('respects the tone variant', () => {
    const { rerender } = render(
      <Card tone="brand" interactive data-testid="card">
        X
      </Card>
    );
    const brand = screen.getByTestId('card');
    expect(brand.className).toMatch(/brand\.500/);

    rerender(
      <Card tone="rose" interactive data-testid="card">
        Y
      </Card>
    );
    const rose = screen.getByTestId('card');
    expect(rose.className).toMatch(/rose\.500/);
  });

  it('respects the padding variant', () => {
    const { rerender } = render(
      <Card padding="sm" data-testid="card">
        X
      </Card>
    );
    const sm = screen.getByTestId('card');
    expect(sm.className).toMatch(/p_4/);

    rerender(
      <Card padding="lg" data-testid="card">
        Y
      </Card>
    );
    const lg = screen.getByTestId('card');
    expect(lg.className).toMatch(/p_6/);
  });

  it('auto-detects interactivity when onClick is provided', () => {
    render(
      <Card onClick={() => {}} data-testid="card">
        X
      </Card>
    );
    const card = screen.getByTestId('card');
    expect(card.className).toMatch(/cursor_pointer/);
  });
});

describe('Card subcomponents', () => {
  it('CardHeader renders a flex container with items-start', () => {
    const { container } = render(<CardHeader>header</CardHeader>);
    const header = container.firstChild as HTMLElement;
    expect(header.className).toMatch(/flex/);
    expect(header.className).toMatch(/items-start/);
  });

  it('CardBody renders a plain div', () => {
    const { container } = render(<CardBody>body</CardBody>);
    const body = container.firstChild as HTMLElement;
    expect(body.className).toBe('');
  });

  it('CardFooter renders a top-bordered container', () => {
    const { container } = render(<CardFooter>footer</CardFooter>);
    const footer = container.firstChild as HTMLElement;
    expect(footer.className).toMatch(/border-t/);
  });
});
