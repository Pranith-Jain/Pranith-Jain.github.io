import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { memoryCache } from '../infrastructure/cache/memory-cache';
import CloudReference from '../pages/CloudReference';

const BASE_INDEX = {
  source: 'test',
  sourceUrl: 'https://example.invalid/',
  license: 'test',
  replicatedAt: '2026-09-21',
  counts: { domains: 1, queries: 0, providers: 1 },
  providerCounts: { AWS: 0 },
  srm: {
    name: 'Cloud Shared Responsibility Matrix',
    description: 'Who secures what.',
    domains: [
      {
        id: 'd1',
        name: 'Identity',
        description: 'Who are you.',
        iaas: { aws: 'C', azure: 'C', gcp: 'C' },
        paas: { aws: 'S', azure: 'S', gcp: 'S' },
        saas: { aws: 'P', azure: 'P', gcp: 'P' },
      },
    ],
  },
  queryIndex: [],
};

function mockIndex(srmExtra: Record<string, unknown> = {}) {
  const body = { ...BASE_INDEX, srm: { ...BASE_INDEX.srm, ...srmExtra } };
  global.fetch = vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
  memoryCache.clear();
});

describe('CloudReference page', () => {
  it('renders the SRM tab when stakeholders is present', async () => {
    mockIndex({ stakeholders: ['Customer', 'Cloud provider'] });
    render(
      <MemoryRouter>
        <CloudReference />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText(/Who secures what\./)).toBeInTheDocument();
    });
    expect(screen.getByText(/Stakeholders: Customer, Cloud provider\./)).toBeInTheDocument();
  });

  it('renders the SRM tab without crashing when stakeholders is missing (regression: prod white-screen)', async () => {
    mockIndex();
    let crashed: unknown = null;
    try {
      render(
        <MemoryRouter>
          <CloudReference />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.getByText(/Who secures what\./)).toBeInTheDocument();
      });
    } catch (e) {
      crashed = e;
    }
    expect(crashed).toBeNull();
    expect(screen.queryByText(/Stakeholders:/)).not.toBeInTheDocument();
  });
});
