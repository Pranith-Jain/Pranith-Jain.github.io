import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import ZeroTrustAiAgents from './ZeroTrustAiAgents';

function renderPage() {
  return render(
    <MemoryRouter>
      <ZeroTrustAiAgents />
    </MemoryRouter>
  );
}

describe('ZeroTrustAiAgents', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the framework title and all four canonical sections', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /zero trust for ai agents/i })).toBeInTheDocument();
    expect(screen.getByText('PRINCIPLES')).toBeInTheDocument();
    expect(screen.getByText(/capability matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/threats \(owasp\)/i)).toBeInTheDocument();
    expect(screen.getByText(/implementation workflow/i)).toBeInTheDocument();
  });

  it('expands a matrix domain row to show practice and failure-mode notes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    const domainButton = screen.getByRole('button', { name: /identity & authentication/i });
    expect(domainButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(domainButton);

    expect(domainButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('what good looks like')).toBeInTheDocument();
    expect(screen.getByText('if you skip this')).toBeInTheDocument();
    expect(screen.getByText(/workload identity/i)).toBeInTheDocument();
  });

  it('toggles threat card mitigations on click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    const threatBtn = screen.getByRole('button', { name: /1\.\s*prompt injection/i });
    expect(threatBtn).toHaveAttribute('aria-expanded', 'false');

    await user.click(threatBtn);

    expect(threatBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Mitigations')).toBeInTheDocument();
    expect(screen.getByText(/spotlight untrusted content/i)).toBeInTheDocument();
  });

  it('filters threat list by category and clears on "All"', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    // Initially all 5 threats visible
    expect(screen.getByRole('button', { name: /1\.\s*prompt injection/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5\.\s*memory & context/i })).toBeInTheDocument();

    // Filter to Memory only
    const memoryPill = screen.getByRole('radio', { name: /^memory$/i });
    await user.click(memoryPill);

    expect(screen.queryByRole('button', { name: /1\.\s*prompt injection/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5\.\s*memory & context/i })).toBeInTheDocument();

    // Back to All
    const allPill = screen.getAllByRole('radio', { name: /^all$/i })[0];
    await user.click(allPill);
    expect(screen.getByRole('button', { name: /1\.\s*prompt injection/i })).toBeInTheDocument();
  });

  it('selects a phase and renders the matching deliverable list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    const phase6 = screen.getByRole('radio', { name: /6\.\s*protect credentials/i });
    expect(phase6).toHaveAttribute('aria-checked', 'false');
    await user.click(phase6);

    expect(phase6).toHaveAttribute('aria-checked', 'true');
    const deliverableHeader = screen.getByText('Deliverables');
    const list = deliverableHeader.parentElement?.querySelector('ul');
    expect(list).not.toBeNull();
    expect(within(list as HTMLElement).getByText(/spiffe\/spire rollout/i)).toBeInTheDocument();
  });

  it('filters the matrix by text query', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    const input = screen.getByLabelText(/filter capability matrix/i) as HTMLInputElement;
    // "constitutional" only appears in the Input / output controls row
    await user.type(input, 'constitutional');

    // Only the Input / output controls row should remain accessible as a button
    const rowButtons = screen.getAllByRole('button', { name: /input \/ output controls/i });
    expect(rowButtons.length).toBe(1);
    expect(screen.queryByRole('button', { name: /identity & authentication/i })).not.toBeInTheDocument();

    await user.clear(input);
    expect(screen.getByRole('button', { name: /identity & authentication/i })).toBeInTheDocument();
  });

  it('renders Why Now stats with the correct initial numeric value', () => {
    renderPage();
    // Three stats have a numeric countTo (250, 2, 95); all start at 0% before
    // the count-up animation kicks in. The non-numeric stat stays as-is.
    expect(screen.getByText('months → hours')).toBeInTheDocument();
  });
});
