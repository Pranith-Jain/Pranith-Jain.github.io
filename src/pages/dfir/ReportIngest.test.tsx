// src/pages/dfir/ReportIngest.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportIngest from './ReportIngest';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/dfir/report-ingest']}>
      <ReportIngest />
    </MemoryRouter>
  );
}

const VIEW = {
  reportId: 'r1',
  bundleId: 'bundle--abc',
  title: 'ACME APT Report',
  source: { id: 'upload', name: 'acme.txt' },
  publishedAt: null,
  summary: 'A short summary of the threat.',
  keywords: [],
  threatActors: [{ name: 'APT-ACME', aliases: ['ACME Spider'], mitreId: 'G9999' }],
  malware: [],
  cves: [{ id: 'CVE-2024-1234', kevListed: true }],
  iocs: [
    {
      type: 'ipv4',
      value: '1.2.3.4',
      confidence: 80,
      riskScore: 90,
      tags: [],
      listedIn: ['abuseipdb'],
      verdict: 'malicious',
    },
  ],
  iocsOverflow: [],
  attackPatterns: [{ name: 'Phishing', mitreId: 'T1566' }],
  tlp: 'AMBER',
  partial: false,
  generatedAt: '2026-06-10T00:00:00Z',
  extractedHash: 'sha256:deadbeef',
};
const OK_BODY = {
  bundle: {
    type: 'bundle',
    id: 'bundle--abc',
    objects: [{ type: 'indicator', id: 'indicator--1', pattern: "[ipv4-addr:value = '1.2.3.4']" }],
  },
  view: VIEW,
  cache: 'computed',
  ingest: { kind: 'text', method: 'inline', truncated: false },
};

function textFile(name = 'acme.txt', bytes = 50): File {
  return new File([new Uint8Array(bytes)], name, { type: 'text/plain' });
}

afterEach(() => vi.restoreAllMocks());

describe('ReportIngest', () => {
  it('renders the upload dropzone', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /report ingest/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload a report file/i)).toBeInTheDocument();
  });

  it('uploads a file and renders the intel view summary + STIX table', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(OK_BODY), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    fireEvent.change(screen.getByLabelText(/upload a report file/i), { target: { files: [textFile()] } });

    await waitFor(() => expect(screen.getByText('ACME APT Report')).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/report/ingest');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    expect(screen.getByText(/CVE-2024-1234/)).toBeInTheDocument();
    expect(screen.getByText(/APT-ACME/)).toBeInTheDocument();
  });

  it('maps a 503 to the bridge hint with a Report Parser link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    renderPage();
    fireEvent.change(screen.getByLabelText(/upload a report file/i), { target: { files: [textFile('r.pdf')] } });
    await waitFor(() => expect(screen.getByText(/needs the optional bridge/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /report parser/i })).toHaveAttribute('href', '/dfir/report-analyzer');
  });

  it('rejects an oversize file client-side without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    // jsdom's Blob/File size from a typed array is unreliable; pin it explicitly.
    const big = new File(['x'], 'big.txt', { type: 'text/plain' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText(/upload a report file/i), { target: { files: [big] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/file too large/i));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
