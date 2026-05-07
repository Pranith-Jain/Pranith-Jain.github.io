import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { AppContent } from '../../App';

// jsdom doesn't have EventSource; stub it for tests that don't exercise streaming
if (typeof EventSource === 'undefined') {
  (globalThis as unknown as { EventSource: unknown }).EventSource = class {
    addEventListener() {}
    close() {}
    onerror: (() => void) | null = null;
  };
}

const subRoutes: Array<{ path: string; heading: string; skipComingSoon?: boolean }> = [
  { path: '/dfir/ioc-check', heading: 'IOC Checker', skipComingSoon: true },
  { path: '/dfir/phishing', heading: 'Phishing Email Analyzer' },
  { path: '/dfir/domain', heading: 'Domain Lookup' },
  { path: '/dfir/exposure', heading: 'Exposure Scanner' },
  { path: '/dfir/file', heading: 'File Analyzer' },
  { path: '/dfir/wiki', heading: 'DFIR Knowledge Base' },
  { path: '/dfir/dashboard', heading: 'Recent Lookups' },
];

describe('DFIR sub-routes', () => {
  it.each(subRoutes)('renders for $path', async ({ path, heading, skipComingSoon }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppContent />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    if (!skipComingSoon) {
      expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
    }
  });
});
