import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AiSummaryCard } from '../AiSummaryCard';

// Mock the admin-token module so requireAdmin gating is testable without the
// jsdom localStorage mock (which is a vi.fn() no-op in src/test/setup.ts).
vi.mock('../../../lib/admin-token', () => ({
  readAdminToken: vi.fn(() => null),
  adminAuthHeaders: vi.fn(() => ({})),
  writeAdminToken: vi.fn(),
  clearAdminToken: vi.fn(),
}));

// Import AFTER the mock so the mocked module is used.
import { readAdminToken } from '../../../lib/admin-token';
const mockedReadAdminToken = vi.mocked(readAdminToken);

// Stub fetch so the card's POST to /api/v1/ai-summary is deterministic.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const items = [
  { title: 'CVE-2026-9999 in foo', body: 'Critical RCE', source: 'test' },
  { title: 'LockBit resurfaces', body: 'New affiliate', source: 'test' },
];

function renderCard(overrides: Partial<Parameters<typeof AiSummaryCard>[0]> = {}) {
  const props: Parameters<typeof AiSummaryCard>[0] = {
    surface: 'Test Surface',
    items,
    requireAdmin: false,
    ...overrides,
  };
  return render(<AiSummaryCard {...props} />);
}

describe('<AiSummaryCard>', () => {
  it('renders nothing when items is empty', () => {
    const { container } = renderCard({ items: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the surface name + Generate button before fetch', () => {
    renderCard();
    expect(screen.getByText(/AI Summary - Test Surface/i)).toBeInTheDocument();
    // The inline Generate text button (not the header toggle).
    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  it('fetches + renders the summary on Generate click', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          summary: '**Headline**: Test summary.\n- Theme one',
          tweet: 'Test tweet #ThreatIntel',
          modelUsed: 'groq:stub',
          itemCount: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    renderCard();
    // Click the inline Generate text button (not the header toggle).
    await fireEvent.click(screen.getByText('Generate'));
    await waitFor(() => {
      expect(screen.getByText(/Test summary/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/ai-summary');
    expect((opts as RequestInit).method).toBe('POST');
  });

  it('shows an error + Retry on a 503', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }));
    renderCard();
    await fireEvent.click(screen.getByText('Generate'));
    await waitFor(() => {
      expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows an error on a non-2xx with a message body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'bad surface' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    );
    renderCard();
    await fireEvent.click(screen.getByText('Generate'));
    await waitFor(() => {
      expect(screen.getByText(/bad surface/i)).toBeInTheDocument();
    });
  });

  it('collapses + expands on header click', async () => {
    renderCard();
    const header = screen.getByRole('button', { name: /AI Summary - Test Surface/i });
    // Initially expanded — shows the Generate hint
    expect(screen.getByText(/Click "Generate"/i)).toBeInTheDocument();
    await fireEvent.click(header);
    // Collapsed — hint gone
    expect(screen.queryByText(/Click "Generate"/i)).not.toBeInTheDocument();
    await fireEvent.click(header);
    expect(screen.getByText(/Click "Generate"/i)).toBeInTheDocument();
  });

  it('auto-fetches on mount when autoFetch is set', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ summary: 'Auto summary', tweet: 't', modelUsed: 'm', itemCount: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    renderCard({ autoFetch: true });
    await waitFor(() => {
      expect(screen.getByText(/Auto summary/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not render when requireAdmin is true and no admin token is present', () => {
    mockedReadAdminToken.mockReturnValue(null);
    const { container } = renderCard({ requireAdmin: true });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders when requireAdmin is true and an admin token is present', () => {
    mockedReadAdminToken.mockReturnValue('__cookie__');
    const { container } = renderCard({ requireAdmin: true });
    expect(container).not.toBeEmptyDOMElement();
    mockedReadAdminToken.mockReturnValue(null);
  });
});
