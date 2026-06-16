import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UnifiedSearch from '../UnifiedSearch';

// The omnibox's tool matches + entity quick-actions are computed CLIENT-SIDE
// from the query (detectIoc/getIocPivots + the tool catalog) — no network. We
// stub fetch so the debounced live-data call resolves empty and never errors.
function stubFetchEmpty() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify({ q: '', generated_at: '', total: 0, sections: [] }), { status: 200 })
    )
  );
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <UnifiedSearch />
    </MemoryRouter>
  );
}

describe('UnifiedSearch omnibox', () => {
  beforeEach(stubFetchEmpty);
  afterEach(() => vi.unstubAllGlobals());

  it('renders entity quick-actions with the right deep-link for a typed IPv4', () => {
    renderAt('/threatintel/unified-search?q=1.2.3.4');
    // Detected-entity header + a pivot link into the IOC Checker, pre-filled.
    expect(screen.getByText(/quick actions/i)).toBeInTheDocument();
    const checker = screen.getByRole('link', { name: /IOC Checker/i });
    expect(checker).toHaveAttribute('href', '/dfir/ioc-check?indicator=1.2.3.4');
  });

  it('shows no quick-actions row for a plain keyword (no detected indicator)', () => {
    renderAt('/threatintel/unified-search?q=ransomware');
    expect(screen.queryByText(/quick actions/i)).not.toBeInTheDocument();
  });

  it('seeds the search box from the ?q= URL param', () => {
    renderAt('/threatintel/unified-search?q=LockBit');
    expect(screen.getByRole('searchbox', { name: /search across all intelligence/i })).toHaveValue('LockBit');
  });

  it('surfaces the Pages section for subpage keyword queries', () => {
    // "wiki" should match the /threatintel/wiki Knowledge Base page.
    renderAt('/threatintel/unified-search?q=wiki');
    const pagesHeader = screen.getByText(/^Pages$/);
    expect(pagesHeader).toBeInTheDocument();
    const wikiLink = screen.getByRole('link', { name: /Knowledge Base/i });
    expect(wikiLink).toHaveAttribute('href', '/threatintel/wiki');
  });

  it('surfaces the Pages section for DFIR keyword queries', () => {
    // "cve" should match the /dfir/cve page.
    renderAt('/threatintel/unified-search?q=cve');
    const cveLink = screen.getByRole('link', { name: /CVE Lookup/i });
    expect(cveLink).toHaveAttribute('href', '/dfir/cve');
  });
});
