import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getJson = vi.fn();
const postJson = vi.fn();
vi.mock('../pages/admin/adminApi', () => ({
  getJson: (...a: unknown[]) => getJson(...a),
  postJson: (...a: unknown[]) => postJson(...a),
}));

import PendingTab from '../pages/admin/PendingTab';

describe('PendingTab clear-all', () => {
  beforeEach(() => {
    getJson.mockReset();
    postJson.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders a Clear all button and calls skip-all', async () => {
    getJson.mockResolvedValueOnce({
      pending: [
        {
          key: 'cve-1',
          type: 'cve',
          title: 'T',
          rationale: 'r',
          score: 0.9,
          evidence: {},
          discoveredAt: '2026-06-04T06:00:00Z',
          status: 'pending',
        },
      ],
    });
    postJson.mockResolvedValueOnce({ ok: true, cleared: 1 });
    getJson.mockResolvedValueOnce({ pending: [] });

    render(<PendingTab />);
    await screen.findByText('T');
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    await waitFor(() => expect(postJson).toHaveBeenCalledWith('/candidates/skip-all'));
  });

  it('does not call skip-all when the confirm is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    getJson.mockResolvedValueOnce({
      pending: [
        {
          key: 'cve-1',
          type: 'cve',
          title: 'T',
          rationale: 'r',
          score: 0.9,
          evidence: {},
          discoveredAt: '2026-06-04T06:00:00Z',
          status: 'pending',
        },
      ],
    });

    render(<PendingTab />);
    await screen.findByText('T');
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(postJson).not.toHaveBeenCalled();
  });
});
