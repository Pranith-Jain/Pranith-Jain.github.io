import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../ui/Toast';

function TestHarness() {
  const { toast, success, error, warning, info, dismiss } = useToast();
  return (
    <div>
      <button onClick={() => toast('Generic')}>toast</button>
      <button onClick={() => success('Success!')}>success</button>
      <button onClick={() => error('Error!')}>error</button>
      <button onClick={() => warning('Warning!')}>warning</button>
      <button onClick={() => info('Info!')}>info</button>
      <button onClick={() => dismiss('nonexistent')}>dismiss</button>
    </div>
  );
}

describe('Toast', () => {
  it('renders children in provider', () => {
    render(
      <ToastProvider>
        <div>App</div>
      </ToastProvider>
    );
    expect(screen.getByText('App')).toBeInTheDocument();
  });

  it('shows toast when success is called', async () => {
    render(
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
  });

  it('shows toast when error is called', async () => {
    render(
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('error'));
    expect(screen.getByText('Error!')).toBeInTheDocument();
  });

  it('shows toast when warning is called', async () => {
    render(
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('warning'));
    expect(screen.getByText('Warning!')).toBeInTheDocument();
  });

  it('shows toast when info is called', async () => {
    render(
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('info'));
    expect(screen.getByText('Info!')).toBeInTheDocument();
  });

  it('shows toast when toast is called', async () => {
    render(
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('toast'));
    expect(screen.getByText('Generic')).toBeInTheDocument();
  });

  it('dismisses toast when dismiss button is clicked', async () => {
    render(
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText('success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
    const dismissBtn = screen.getByLabelText('Dismiss');
    await userEvent.click(dismissBtn);
    expect(screen.queryByText('Success!')).not.toBeInTheDocument();
  });

  it('auto-dismisses after duration', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TestHarness />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText('success'));
    expect(screen.getByText('Success!')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.queryByText('Success!')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('throws when useToast is used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestHarness />)).toThrow('useToast must be used within a ToastProvider');
    consoleError.mockRestore();
  });
});
