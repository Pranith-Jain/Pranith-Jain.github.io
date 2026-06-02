import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IocCheck from './IocCheck';

// jsdom has no EventSource; the CVE / unknown deep-links don't stream, but the
// page references the symbol, so stub it.
beforeAll(() => {
  if (typeof EventSource === 'undefined') {
    (globalThis as unknown as { EventSource: unknown }).EventSource = class {
      addEventListener() {}
      close() {}
      onerror: (() => void) | null = null;
    };
  }
});

function renderAt(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/dfir/ioc-check${search}`]}>
      <IocCheck />
    </MemoryRouter>
  );
}

describe('IocCheck deep-link routing', () => {
  it('routes a CVE deep-link to CVE Lookup instead of dead-ending as "unrecognized"', () => {
    renderAt('?indicator=CVE-2024-1234');
    const link = screen.getByRole('link', { name: /CVE Lookup/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/dfir/cve'));
    expect(screen.queryByText(/Unrecognized format/i)).not.toBeInTheDocument();
  });

  it('routes an ASN deep-link to ASN Lookup', () => {
    renderAt('?indicator=AS12345');
    expect(screen.getByRole('link', { name: /ASN Lookup/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/dfir/asn-lookup')
    );
  });

  it('still shows the unrecognized-format hint for genuinely unknown input', () => {
    renderAt('?indicator=notanioc');
    expect(screen.getByText(/Unrecognized format/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Lookup/i })).not.toBeInTheDocument();
  });
});
