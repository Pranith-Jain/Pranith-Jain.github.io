import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>CISA | Cybersecurity and Infrastructure Security Agency</title>
  <meta name="description" content="CISA is the nation's cyber defense agency.">
  <meta property="og:title" content="CISA Home">
  <meta property="og:description" content="Cybersecurity and Infrastructure Security Agency">
  <meta property="og:image" content="https://www.cisa.gov/og-image.png">
  <meta property="og:site_name" content="CISA">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="CISA">
  <link rel="canonical" href="https://www.cisa.gov/">
</head>
<body><h1>CISA</h1></body>
</html>`;

function mockDoH(ip: string) {
  return {
    Status: 0,
    Answer: [{ name: 'www.cisa.gov', type: 1, TTL: 300, data: ip }],
  };
}

function setupMocks({ dohIp = '104.16.1.1', upstreamHtml = SAMPLE_HTML, upstreamStatus = 200 } = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    // DoH requests
    if (url.includes('cloudflare-dns.com')) {
      return new Response(JSON.stringify(mockDoH(dohIp)), {
        status: 200,
        headers: { 'content-type': 'application/dns-json' },
      });
    }
    // Upstream HTML
    return new Response(upstreamHtml, {
      status: upstreamStatus,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  });
}

describe('GET /api/v1/url-preview', () => {
  it('returns 400 on missing url param', async () => {
    const r = await SELF.fetch('https://x/api/v1/url-preview');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/missing/i);
  });

  it('returns 400 on invalid url', async () => {
    const r = await SELF.fetch('https://x/api/v1/url-preview?url=not-a-url');
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/invalid/i);
  });

  it('returns 400 on unsupported protocol (javascript:)', async () => {
    const r = await SELF.fetch('https://x/api/v1/url-preview?url=' + encodeURIComponent('javascript:alert(1)'));
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/unsupported protocol/i);
  });

  it('returns 400 on unsupported protocol (data:)', async () => {
    const r = await SELF.fetch(
      'https://x/api/v1/url-preview?url=' + encodeURIComponent('data:text/html,<h1>test</h1>')
    );
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/unsupported protocol/i);
  });

  it('returns 403 when DNS resolves to private IP', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('cloudflare-dns.com')) {
        return new Response(JSON.stringify(mockDoH('192.168.1.1')), {
          status: 200,
          headers: { 'content-type': 'application/dns-json' },
        });
      }
      return new Response('should not reach', { status: 200 });
    });

    const r = await SELF.fetch(
      'https://x/api/v1/url-preview?url=' + encodeURIComponent('http://internal-host.example.com/')
    );
    expect(r.status).toBe(403);
    const body = (await r.json()) as { error: string };
    expect(body.error).toMatch(/private/i);
  });

  it('returns 403 for loopback address', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('cloudflare-dns.com')) {
        return new Response(JSON.stringify(mockDoH('127.0.0.1')), {
          status: 200,
          headers: { 'content-type': 'application/dns-json' },
        });
      }
      return new Response('should not reach', { status: 200 });
    });

    const r = await SELF.fetch('https://x/api/v1/url-preview?url=' + encodeURIComponent('http://localhost/'));
    expect(r.status).toBe(403);
  });

  it('returns 200 with parsed title and og metadata', async () => {
    setupMocks({ dohIp: '104.16.1.1' });

    const r = await SELF.fetch('https://x/api/v1/url-preview?url=' + encodeURIComponent('https://www.cisa.gov/'));
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      title?: string;
      description?: string;
      og?: { title?: string; site_name?: string };
      canonical?: string;
    };
    expect(body.title).toBe('CISA | Cybersecurity and Infrastructure Security Agency');
    expect(body.description).toBe("CISA is the nation's cyber defense agency.");
    expect(body.og?.title).toBe('CISA Home');
    expect(body.og?.site_name).toBe('CISA');
    expect(body.canonical).toBe('https://www.cisa.gov/');
  });

  it('returns redirect_blocked on 302 upstream', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('cloudflare-dns.com')) {
        return new Response(JSON.stringify(mockDoH('104.16.1.1')), {
          status: 200,
          headers: { 'content-type': 'application/dns-json' },
        });
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://www.example.com/redirect' },
      });
    });

    const r = await SELF.fetch('https://x/api/v1/url-preview?url=' + encodeURIComponent('https://example.com/'));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { redirect_blocked?: { location: string }; status: number };
    expect(body.status).toBe(302);
    expect(body.redirect_blocked?.location).toBe('https://www.example.com/redirect');
  });

  it('returns 502 when upstream throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('cloudflare-dns.com')) {
        return new Response(JSON.stringify(mockDoH('104.16.1.1')), {
          status: 200,
          headers: { 'content-type': 'application/dns-json' },
        });
      }
      throw new Error('connection refused');
    });

    const r = await SELF.fetch(
      'https://x/api/v1/url-preview?url=' + encodeURIComponent('https://unreachable.example.com/')
    );
    expect(r.status).toBe(502);
  });
});
