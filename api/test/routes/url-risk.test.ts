/**
 * Route tests for POST /api/v1/url-risk/analyze.
 *
 * All upstream network calls (DNS, VT, GSB, urlscan, AbuseIPDB, RDAP) are
 * mocked with `vi.spyOn(globalThis, 'fetch')`; assertions check the route →
 * correlator wiring and the Intel engine's score math. Run locally with
 * the route-test suite (skipped in CI):
 *   cd api && npx vitest run test/routes/url-risk.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withTestApiKey } from '../test-helpers';

beforeEach(() => {
  vi.restoreAllMocks();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const VT_CLEAN = { malicious: 0, suspicious: 0, harmless: 40, undetected: 59 };
const VT_FLAGGED = { malicious: 21, suspicious: 3, harmless: 40, undetected: 36 };

/**
 * Mock the analyzer's upstream hops. Returns the response record for a
 * specific provider so tests can adjust single legs.
 */
function mockProviders(options?: {
  vtStats?: typeof VT_CLEAN;
  gsbSafe?: boolean;
  urlscanFlagged?: boolean;
  abuseConfidence?: number;
  rdapDaysOld?: number;
  dnsAnswer?: string[];
}) {
  const o = {
    vtStats: VT_FLAGGED,
    gsbSafe: true,
    urlscanFlagged: true,
    abuseConfidence: 90,
    rdapDaysOld: 3,
    dnsAnswer: ['93.184.216.34'],
    ...options,
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('cloudflare-dns.com')) {
      return json({ Answer: o.dnsAnswer.map((data) => ({ data })) });
    }
    if (url.includes('safebrowsing.googleapis.com')) {
      if (o.gsbSafe) return json({});
      return json({ matches: [{ threatType: 'SOCIAL_ENGAGEMENT', platformType: 'ANY_PLATFORM' }] });
    }
    if (url.includes('urlscan.io')) {
      return json({
        total: o.urlscanFlagged ? 1 : 0,
        results: o.urlscanFlagged ? [{ tags: ['phishing'], task: { url: 'https://example.com/x' } }] : [],
      });
    }
    if (url.includes('www.virustotal.com')) {
      return json({ data: { attributes: { last_analysis_stats: o.vtStats } } });
    }
    if (url.includes('api.abuseipdb.com')) {
      return json({
        data: {
          abuseConfidenceScore: o.abuseConfidence,
          totalReports: 12,
          usageType: 'VPS',
          countryCode: 'US',
          isp: 'Example ISP',
        },
      });
    }
    if (url.includes('rdap')) {
      const created = new Date(Date.now() - o.rdapDaysOld * 86_400_000).toISOString();
      return json({
        events: [{ eventAction: 'registration', eventDate: created }],
        handle: 'example.com-DOMAIN',
        entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Namecheap']]] }],
        status: ['active'],
        secureDNS: { delegationSigned: false },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function postUrlRisk(body: unknown): Promise<Response> {
  return withTestApiKey().then((fetchAuthed) =>
    fetchAuthed('https://x/api/v1/url-risk/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/v1/url-risk/analyze — validation', () => {
  it('rejects a missing url', async () => {
    const r = await postUrlRisk({});
    expect(r.status).toBe(400);
  });

  it('rejects non-http(s) schemes', async () => {
    const r = await postUrlRisk({ url: 'ftp://example.com/file' });
    expect(r.status).toBe(400);
  });

  it('rejects malformed urls', async () => {
    const r = await postUrlRisk({ url: 'not a url at all' });
    expect(r.status).toBe(400);
  });
});

describe('POST /api/v1/url-risk/analyze — correlation', () => {
  it('correlates a fully flagged URL into High Risk (73)', async () => {
    mockProviders(); // VT 21 → 35, Abuse 90 → 18, WHOIS 3d → 20
    const r = await postUrlRisk({ url: 'https://example.com/login' });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      hostname: string;
      ip_address: string;
      static: { flags: string[]; suspicious_keywords: string[] };
      risk: {
        risk_score: number;
        verdict: string;
        confidence: number;
        evidence: string[];
        score_breakdown: Record<string, number>;
        provider_status: Record<string, boolean>;
        domain_age_days: number;
      };
      providers: Record<string, { status: string }>;
    };

    expect(body.hostname).toBe('example.com');
    expect(body.ip_address).toBe('93.184.216.34');

    expect(body.risk.risk_score).toBe(73); // 35 + 0 + 0 + 18 + 20
    expect(body.risk.verdict).toBe('High Risk');
    expect(body.risk.score_breakdown).toEqual({
      virustotal: 35,
      urlscan: 0,
      abuseipdb: 18,
      whois: 20,
      google_safe_browsing: 0,
    });
    expect(body.risk.provider_status).toEqual({
      virustotal: true,
      urlscan: true,
      abuseipdb: true,
      whois: true,
      google_safe_browsing: true,
    });
    expect(body.risk.domain_age_days).toBe(3);
    expect(body.risk.evidence.some((e) => e.includes('+35 VirusTotal'))).toBe(true);
    expect(body.risk.evidence.some((e) => e.includes('+18 AbuseIPDB'))).toBe(true);
    expect(body.risk.evidence.some((e) => e.includes('+20 WHOIS'))).toBe(true);

    // static heuristics ran on the URL text
    expect(body.static.flags).toContain('suspicious-keywords');
    expect(body.static.suspicious_keywords).toContain('login');
    expect(body.static.flags).not.toContain('long-url');

    // per-provider trim blocks are present
    expect(body.providers.virustotal?.status).toBe('ok');
    expect(body.providers.whois?.status).toBe('ok');
  });

  it('classifies a clean URL as No Strong Threat Evidence', async () => {
    mockProviders({
      vtStats: VT_CLEAN,
      urlscanFlagged: false,
      abuseConfidence: 0,
      rdapDaysOld: 5500, // registered 15y ago
    });
    const r = await postUrlRisk({ url: 'https://example.com' });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      risk: {
        risk_score: number;
        verdict: string;
        evidence: string[];
        informational_findings: string[];
        provider_status: Record<string, boolean>;
      };
    };
    expect(body.risk.risk_score).toBe(0);
    expect(body.risk.verdict).toBe('No Strong Threat Evidence');
    expect(body.risk.evidence).toEqual(['No provider contributed a positive risk-scoring indicator.']);
    expect(
      body.risk.informational_findings.some((f) => f.includes('Google Safe Browsing returned no threat-list match'))
    ).toBe(true);
    expect(body.risk.informational_findings.some((f) => f.includes('VirusTotal did not report'))).toBe(true);
    // all five providers still ran (they had data, just no findings)
    expect(Object.values(body.risk.provider_status).every(Boolean)).toBe(true);
  });

  it('adds 30 points when Google Safe Browsing flags the URL', async () => {
    mockProviders({ gsbSafe: false });
    const r = await postUrlRisk({ url: 'https://example.com/verify' });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { risk: { risk_score: number; evidence: string[] } };
    expect(body.risk.risk_score).toBe(100); // 35 + 30 + 18 + 20 = 103 → capped 100
    expect(body.risk.evidence.some((e) => e.includes('SOCIAL_ENGAGEMENT'))).toBe(true);
  });

  it('drops the AbuseIPDB leg when DNS resolution returns nothing', async () => {
    mockProviders({ dnsAnswer: [] });
    const r = await postUrlRisk({ url: 'https://example.com/login' });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      ip_address: string | null;
      risk: { risk_score: number; score_breakdown: Record<string, number>; provider_status: Record<string, boolean> };
    };
    expect(body.ip_address).toBeNull();
    expect(body.risk.score_breakdown.abuseipdb).toBe(0);
    expect(body.risk.provider_status.abuseipdb).toBe(false);
    expect(body.risk.risk_score).toBe(55); // 35 + 20
  });

  it('uses the IP-literal host directly for AbuseIPDB without DNS', async () => {
    mockProviders({});
    const r = await postUrlRisk({ url: 'http://93.184.216.34:8080/admin' });
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      ip_address: string;
      static: { ip_hostname: boolean; non_standard_port: boolean; scheme: string };
      risk: { risk_score: number };
    };
    expect(body.ip_address).toBe('93.184.216.34');
    expect(body.static.ip_hostname).toBe(true);
    expect(body.static.non_standard_port).toBe(true);
    expect(body.static.scheme).toBe('http');
    // 35 (VT) + 18 (Abuse 90) + 0 (no whois on IP) = 53
    expect(body.risk.risk_score).toBe(53);
  });
});
