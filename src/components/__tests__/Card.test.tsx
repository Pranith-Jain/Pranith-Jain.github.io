import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardBody, CardFooter } from '../ui/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders as default div element', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.querySelector('div')).toBeInTheDocument();
  });

  it('renders as a custom element when as prop is used', () => {
    const { container } = render(<Card as="section">Content</Card>);
    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('applies default card radius class', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass('rounded-card');
  });

  it('applies panel radius class', () => {
    const { container } = render(<Card radius="panel">Content</Card>);
    expect(container.firstChild).toHaveClass('rounded-panel');
  });

  it('applies hero radius class', () => {
    const { container } = render(<Card radius="hero">Content</Card>);
    expect(container.firstChild).toHaveClass('rounded-hero');
  });

  it('applies default padding class', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass('p-5');
  });

  it('applies sm padding class', () => {
    const { container } = render(<Card padding="sm">Content</Card>);
    expect(container.firstChild).toHaveClass('p-4');
  });

  it('applies lg padding class', () => {
    const { container } = render(<Card padding="lg">Content</Card>);
    expect(container.firstChild).toHaveClass('p-6');
  });

  it('applies no padding class', () => {
    const { container } = render(<Card padding="none">Content</Card>);
    expect(container.firstChild).not.toHaveClass('p-4');
    expect(container.firstChild).not.toHaveClass('p-5');
    expect(container.firstChild).not.toHaveClass('p-6');
  });

  it('applies surface variant class', () => {
    const { container } = render(<Card variant="surface">Content</Card>);
    expect(container.firstChild).toHaveClass('surface-base');
  });

  it('applies glass variant class', () => {
    const { container } = render(<Card variant="glass">Content</Card>);
    expect(container.firstChild).toHaveClass('glass');
  });

  it('applies interactive variant with hover classes', () => {
    const { container } = render(<Card variant="interactive">Content</Card>);
    expect(container.firstChild).toHaveClass('cursor-pointer');
  });

  it('applies default brand tone', () => {
    const { container } = render(<Card variant="interactive">Content</Card>);
    expect(container.firstChild).toHaveClass('hover:border-brand-500/30');
  });

  it('applies rose tone', () => {
    const { container } = render(
      <Card variant="interactive" tone="rose">
        Content
      </Card>
    );
    expect(container.firstChild).toHaveClass('hover:border-rose-500/30');
  });

  it('applies additional className', () => {
    const { container } = render(<Card className="extra-class">Content</Card>);
    expect(container.firstChild).toHaveClass('extra-class');
  });

  it('spreads additional props to the element', () => {
    render(<Card data-testid="card-test">Content</Card>);
    expect(screen.getByTestId('card-test')).toBeInTheDocument();
  });
});

describe('CardHeader', () => {
  it('renders children', () => {
    render(<CardHeader>Header</CardHeader>);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('applies className', () => {
    const { container } = render(<CardHeader className="custom-header">Header</CardHeader>);
    expect(container.firstChild).toHaveClass('custom-header');
  });
});

describe('CardBody', () => {
  it('renders children', () => {
    render(<CardBody>Body</CardBody>);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});

describe('CardFooter', () => {
  it('renders children', () => {
    render(<CardFooter>Footer</CardFooter>);
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('includes border class', () => {
    const { container } = render(<CardFooter>Footer</CardFooter>);
    expect(container.firstChild).toHaveClass('border-t');
  });
});
