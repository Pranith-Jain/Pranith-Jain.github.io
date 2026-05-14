import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Blog from '../pages/Blog';

describe('Blog index page', () => {
  it('renders the list of posts fetched from API', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            posts: [
              {
                slug: 'a',
                title: 'Alpha',
                type: 'cve',
                excerpt: 'x',
                publishedAt: '2026-05-19T15:05:00Z',
                tags: [],
              },
            ],
          })
        )
    ) as unknown as typeof fetch;
    render(
      <MemoryRouter>
        <Blog />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeInTheDocument();
    });
  });
});
