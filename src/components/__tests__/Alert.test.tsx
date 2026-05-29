import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert } from '../ui/Alert';

describe('Alert', () => {
  it('renders children', () => {
    render(<Alert variant="info">Alert message</Alert>);
    expect(screen.getByText('Alert message')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(
      <Alert variant="error" title="Error title">
        Message
      </Alert>
    );
    expect(screen.getByText('Error title')).toBeInTheDocument();
  });

  it('renders with role="alert"', () => {
    render(<Alert variant="warning">Warning</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders dismiss button when onDismiss is provided', () => {
    render(
      <Alert variant="info" onDismiss={vi.fn()}>
        Dismissible
      </Alert>
    );
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('renders action element', () => {
    render(
      <Alert variant="success" action={<button>Retry</button>}>
        Action alert
      </Alert>
    );
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    const userEvent = (await import('@testing-library/user-event')).default;
    render(
      <Alert variant="info" onDismiss={onDismiss}>
        Dismissible
      </Alert>
    );
    await userEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
