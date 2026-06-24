import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getJson = vi.fn();
const postJson = vi.fn();
const postJsonWithBody = vi.fn();
const getSocialQueue = vi.fn();
const approveSocialPlatform = vi.fn();
const unapproveSocialPlatform = vi.fn();
vi.mock('../pages/admin/adminApi', () => ({
  getJson: (...a: unknown[]) => getJson(...a),
  postJson: (...a: unknown[]) => postJson(...a),
  postJsonWithBody: (...a: unknown[]) => postJsonWithBody(...a),
  getSocialQueue: (...a: unknown[]) => getSocialQueue(...a),
  approveSocialPlatform: (...a: unknown[]) => approveSocialPlatform(...a),
  unapproveSocialPlatform: (...a: unknown[]) => unapproveSocialPlatform(...a),
}));

import PublishedTab from '../pages/admin/PublishedTab';

describe('PublishedTab social-index load + lazy expand', () => {
  beforeEach(() => {
    getJson.mockReset();
    getSocialQueue.mockResolvedValue({ autopostEnabled: false, queue: [] });
    approveSocialPlatform.mockResolvedValue({ ok: true, schedule: {} });
    unapproveSocialPlatform.mockResolvedValue({ ok: true, schedule: {} });
  });

  it('loads via /social-index (no per-post /social) and lazy-fetches content on View', async () => {
    getJson.mockImplementation(async (path: string) => {
      if (path === '/posts')
        return {
          posts: [{ slug: 'p1', title: 'P1', type: 'cve', excerpt: '', publishedAt: '2026-06-04T00:00:00Z', tags: [] }],
        };
      if (path === '/social-index') return { index: { p1: { twitter: true, linkedin: false } } };
      if (path === '/social/p1')
        return {
          ok: true,
          social: { slug: 'p1', twitter: 'tweet text', linkedin: '', generatedAt: '2026-06-04T00:00:00Z' },
        };
      return {};
    });

    render(<PublishedTab />);
    await screen.findByText('P1');

    // Load used the cheap index, NOT a per-post /social fetch.
    expect(getJson).toHaveBeenCalledWith('/social-index');
    expect(getJson).not.toHaveBeenCalledWith('/social/p1');

    // Button state comes from the index (has twitter → "Re-Tweet").
    expect(screen.getByRole('button', { name: /re-tweet/i })).toBeTruthy();

    // Expanding lazily fetches the full content.
    fireEvent.click(screen.getByRole('button', { name: /^view$/i }));
    await waitFor(() => expect(getJson).toHaveBeenCalledWith('/social/p1'));
  });
});
