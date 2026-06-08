import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminApp from '../pages/admin/AdminApp';

// The shared test setup (src/test/setup.ts) mocks localStorage with bare
// `vi.fn()` stubs that don't actually persist values. The admin UI relies on
// localStorage as a real store (token round-trips between setItem/getItem),
// so we install a minimal Map-backed implementation just for this suite.
beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
  vi.restoreAllMocks();
});

describe('AdminApp', () => {
  it('shows login screen when no token is set', () => {
    render(
      <MemoryRouter>
        <AdminApp />
      </MemoryRouter>
    );
    expect(screen.getByText(/admin token/i)).toBeInTheDocument();
  });

  it('stores token and shows the admin shell on login', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ pending: [] }))) as unknown as typeof fetch;
    render(
      <MemoryRouter>
        <AdminApp />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText(/admin token/i), {
      target: { value: 'sekret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(localStorage.getItem('adminToken')).toBe('sekret');
      expect(screen.getByText(/pending/i)).toBeInTheDocument();
    });
  });

  it('renders pending candidates and approves one', async () => {
    localStorage.setItem('adminToken', 'sekret');
    const calls: string[] = [];
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? 'GET'} ${u}`);
      if (u.endsWith('/candidates')) {
        return new Response(
          JSON.stringify({
            pending: [
              {
                key: 'cve-1',
                type: 'cve',
                title: 'Test CVE',
                rationale: 'r',
                score: 0.9,
                evidence: {},
                discoveredAt: '2026-05-14T06:00:00Z',
                status: 'pending',
              },
            ],
          })
        );
      }
      if (u.includes('/approve') || u.includes('/generate')) {
        return new Response(
          JSON.stringify({
            ok: true,
            approved: 'cve-1',
            result: { blog: { slug: 'test', title: 'Test', status: 'draft' } },
          })
        );
      }
      return new Response(JSON.stringify({ pending: [] }));
    }) as unknown as typeof fetch;

    render(
      <MemoryRouter>
        <AdminApp />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText('Test CVE')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => {
      expect(calls.some((c) => c.includes('POST') && c.includes('/candidates/cve-1/generate'))).toBe(true);
    });
  });
});
