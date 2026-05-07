import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { AppContent } from '../../App';

const subRoutes = [
  { path: '/dfir/ioc-check', heading: 'IOC Checker' },
  { path: '/dfir/phishing', heading: 'Phishing Email Analyzer' },
  { path: '/dfir/domain', heading: 'Domain Lookup' },
  { path: '/dfir/exposure', heading: 'Exposure Scanner' },
  { path: '/dfir/file', heading: 'File Analyzer' },
  { path: '/dfir/wiki', heading: 'DFIR Knowledge Base' },
  { path: '/dfir/dashboard', heading: 'Recent Lookups' },
];

describe('DFIR sub-routes', () => {
  it.each(subRoutes)('renders placeholder for $path', async ({ path, heading }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppContent />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
