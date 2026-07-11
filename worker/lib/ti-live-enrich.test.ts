import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchOtxPulses, searchThreatfox, searchMalwarebazaar, searchRansomwareLive } from './ti-live-enrich';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain' },
  });
}

// ── OTX ──────────────────────────────────────────────────────────────────

describe('searchOtxPulses', () => {
  it('returns skipped diagnostic when no API key', async () => {
    const result = await searchOtxPulses('LockBit');
    expect(result.diagnostics[0]?.status).toBe('skipped');
    expect(result.pulses).toHaveLength(0);
  });

  it('returns pulses on successful search', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            id: 'pulse-1',
            name: 'LockBit Campaign',
            description: 'LockBit ransomware activity',
            tags: ['lockbit', 'ransomware'],
            created: '2026-01-01',
            modified: '2026-01-02',
            tlp: 'white',
            indicator_count: 10,
            malware_families: ['LockBit'],
            attack_ids: [{ display_name: 'T1486' }],
          },
        ],
      })
    );
    // Mock indicator fetches for top 5 pulses
    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [{ type: 'IPv4', indicator: '1.2.3.4' }] }));

    const result = await searchOtxPulses('LockBit', 'test-key');
    expect(result.diagnostics[0]?.status).toBe('ok');
    expect(result.pulses).toHaveLength(1);
    expect(result.pulses[0]?.name).toBe('LockBit Campaign');
    expect(result.pulses[0]?.malware_families).toEqual(['LockBit']);
    expect(result.pulses[0]?.attack_ids).toEqual(['T1486']);
    expect(result.pulses[0]?.indicators).toHaveLength(1);
    expect(result.pulses[0]?.indicators[0]?.value).toBe('1.2.3.4');
  });

  it('handles HTTP errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce(new Response('rate limited', { status: 429 }));
    const result = await searchOtxPulses('test', 'key');
    expect(result.diagnostics[0]?.status).toBe('failed');
    expect(result.pulses).toHaveLength(0);
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network timeout'));
    const result = await searchOtxPulses('test', 'key');
    expect(result.diagnostics[0]?.status).toBe('failed');
  });
});

// ── ThreatFox ────────────────────────────────────────────────────────────

describe('searchThreatfox', () => {
  it('returns IOCs on successful search', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        query_status: 'ok',
        data: [
          {
            ioc_type: 'ip:port',
            ioc: '1.2.3.4:443',
            malware: 'Emotet',
            malware_printable: 'Emotet',
            confidence_level: 80,
            first_seen: '2026-01-01',
            last_seen: '2026-01-02',
            tags: ['Emotet'],
            comment: 'C2 server',
            reporter: 'researcher1',
          },
        ],
      })
    );

    const result = await searchThreatfox('Emotet');
    expect(result.diagnostics[0]?.status).toBe('ok');
    expect(result.iocs).toHaveLength(1);
    expect(result.iocs[0]?.ioc_value).toBe('1.2.3.4:443');
    expect(result.iocs[0]?.malware_printable).toBe('Emotet');
    expect(result.iocs[0]?.confidence).toBe(0.8);
  });

  it('handles no_data gracefully', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ query_status: 'no_data' }));
    const result = await searchThreatfox('nonexistent');
    expect(result.diagnostics[0]?.status).toBe('ok');
    expect(result.iocs).toHaveLength(0);
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const result = await searchThreatfox('test');
    expect(result.diagnostics[0]?.status).toBe('failed');
  });
});

// ── MalwareBazaar ────────────────────────────────────────────────────────

describe('searchMalwarebazaar', () => {
  it('returns samples on tag search', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        query_status: 'ok',
        data: [
          {
            sha256_hash: 'abc123',
            md5_hash: 'def456',
            file_name: 'sample.exe',
            file_type: 'exe',
            signature: 'Emotet',
            tags: ['emotet', 'banker'],
            first_seen: '2026-01-01',
            last_seen: '2026-01-02',
            reporter: 'abusech',
          },
        ],
      })
    );

    const result = await searchMalwarebazaar('Emotet');
    expect(result.diagnostics[0]?.status).toBe('ok');
    expect(result.search_mode).toBe('tag');
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]?.sha256).toBe('abc123');
    expect(result.samples[0]?.signature).toBe('Emotet');
  });

  it('falls back to signature search when tag returns no results', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ query_status: 'no_results' }));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        query_status: 'ok',
        data: [
          {
            sha256_hash: 'xyz',
            md5_hash: 'uvw',
            file_name: 'dropper.dll',
            file_type: 'dll',
            signature: 'AgentTesla',
            tags: [],
            first_seen: '2026-01-01',
            last_seen: '',
            reporter: '',
          },
        ],
      })
    );

    const result = await searchMalwarebazaar('AgentTesla');
    expect(result.search_mode).toBe('signature');
    expect(result.samples).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('timeout'));
    const result = await searchMalwarebazaar('test');
    expect(result.diagnostics[0]?.status).toBe('failed');
  });
});

// ── ransomware.live ──────────────────────────────────────────────────────

describe('searchRansomwareLive', () => {
  it('returns group profiles on match', async () => {
    // Mock groups list
    mockFetch.mockResolvedValueOnce(jsonResponse([{ name: 'LockBit' }, { name: 'BlackCat' }, { name: 'Cl0p' }]));
    // Mock group detail
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        name: 'LockBit',
        description: 'LockBit ransomware group',
        locations: [{ fqdn: 'abc123.onion', available: true }],
        ttps: ['T1486', 'T1490'],
        tools: ['LockBit Black'],
        _victim_count: 1500,
      })
    );
    // Mock recent victims
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { group: 'LockBit', victim: 'Acme Corp', country: 'US', attackdate: '2026-01-15' },
        { group: 'BlackCat', victim: 'Other Inc', country: 'UK' },
      ])
    );

    const result = await searchRansomwareLive('LockBit');
    expect(result.diagnostics[0]?.status).toBe('ok');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.name).toBe('LockBit');
    expect(result.groups[0]?.onion_urls).toEqual(['abc123.onion']);
    expect(result.groups[0]?.ttps).toEqual(['T1486', 'T1490']);
    expect(result.groups[0]?.victim_count).toBe(1500);
    expect(result.groups[0]?.victims).toHaveLength(1);
    expect(result.groups[0]?.victims[0]?.victim).toBe('Acme Corp');
  });

  it('returns empty when no groups match', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([{ name: 'LockBit' }, { name: 'BlackCat' }]));

    const result = await searchRansomwareLive('NonExistent');
    expect(result.diagnostics[0]?.status).toBe('ok');
    expect(result.groups).toHaveLength(0);
  });

  it('handles HTTP errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce(new Response('error', { status: 500 }));
    const result = await searchRansomwareLive('test');
    expect(result.diagnostics[0]?.status).toBe('failed');
  });
});
