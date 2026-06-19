/**
 * OpenAPI 3.1 Specification Generator
 *
 * Generates an OpenAPI spec from the Hono route definitions.
 * Serves as living API documentation that stays in sync with the code.
 *
 * The spec is served at /api/v1/openapi.json and can be used with:
 *   - Swagger UI (interactive API explorer)
 *   - Postman (import collection)
 *   - Code generators (TypeScript, Python, Go clients)
 *
 * Usage:
 *   import { generateOpenApiSpec } from '../lib/openapi';
 *   app.get('/api/v1/openapi.json', (c) => c.json(generateOpenApiSpec()));
 */

export function generateOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'DFIR & Threat Intelligence Platform API',
      description:
        'Comprehensive DFIR (Digital Forensics & Incident Response) and CTI (Cyber Threat Intelligence) platform API. ' +
        'Provides IOC checking, threat actor enrichment, CVE lookup, phishing analysis, and 50+ security tools.\n\n' +
        '## Authentication\n' +
        '- **Public endpoints**: No authentication required for read-only GET requests\n' +
        '- **API key**: Provide via `Authorization: Bearer <key>` or `X-API-Key` header\n' +
        '- **Admin**: Admin mutations require `Authorization: Bearer <admin-token>` or `X-Admin-Token`\n\n' +
        '## Rate Limiting\n' +
        '- 30 requests/minute per IP for user-input endpoints\n' +
        '- 5 requests/minute for admin mutations\n' +
        '- Cached read-only feeds are exempt\n\n' +
        '## Response Format\n' +
        'All responses use JSON with consistent error shape:\n' +
        '```json\n{ "error": "error_code", "message": "human readable" }\n```',
      version: '1.0.0',
      contact: {
        name: 'Pranith Jain',
        url: 'https://pranithjain.qzz.io',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'https://pranithjain.qzz.io',
        description: 'Production',
      },
      {
        url: 'http://localhost:8787',
        description: 'Local development (wrangler dev)',
      },
    ],
    tags: [
      { name: 'IOC', description: 'Indicator of Compromise checking and enrichment' },
      { name: 'CVE', description: 'Vulnerability lookup and prioritization' },
      { name: 'Threat Actors', description: 'Threat actor profiles, enrichment, and attribution' },
      { name: 'Domain Intelligence', description: 'Domain, DNS, WHOIS, and certificate analysis' },
      { name: 'IP Intelligence', description: 'IP geolocation, reputation, and ASN lookup' },
      { name: 'Phishing', description: 'Phishing URL and email analysis' },
      { name: 'Ransomware', description: 'Ransomware tracking, leak sites, and victim data' },
      { name: 'Dark Web', description: 'Dark web monitoring and breach data' },
      { name: 'Detection', description: 'Detection rules (YARA, Sigma, Snort)' },
      { name: 'Briefings', description: 'Threat intelligence briefings (daily/weekly)' },
      { name: 'Feeds', description: 'Aggregated threat intelligence feeds' },
      { name: 'Analysis', description: 'File, URL, and artifact analysis tools' },
      { name: 'Admin', description: 'Administrative operations (requires admin token)' },
      { name: 'Health', description: 'Service health and dependency checks' },
    ],
    paths: {
      '/api/v1/health': {
        get: {
          tags: ['Health'],
          summary: 'Service health check',
          description: 'Returns basic health status. Always returns 200 if the worker is running.',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: { type: 'boolean' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/features': {
        get: {
          tags: ['Health'],
          summary: 'Configured optional feature bridges',
          description:
            'Public boolean map of which optional self-hosted bridges this deployment has configured. Booleans only — never the bridge URLs or tokens. Today only `samples` is advertised (the /api/v1/sample/scan endpoint is free and self-contained, no bridge required).',
          responses: {
            '200': {
              description: 'Feature flag map',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      samples: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/sample/scan': {
        post: {
          tags: ['Malware Analysis'],
          summary: 'Free "lite 0x12" multi-provider hash fan-out',
          description:
            'Always-on free hash fan-out across 9 public reputation providers (VirusTotal, MalwareBazaar, YARAify, ' +
            'Hybrid Analysis, OTX, ThreatFox, Malshare, Hashlookup, Kaspersky). Streams per-provider ' +
            'results as SSE, then a final `done` event with composite score, verdict, signatures, families, and ' +
            'one-click deep links to 12 free public sandboxes (Triage, ANY.RUN, Joe Sandbox, Intezer, ' +
            'InQuest, etc). The frontend `SampleScan` page computes the SHA-256 client-side (via `analyseFile`) and ' +
            'posts just the hash here — Cloudflare Workers Free caps CPU at 10ms/invocation so server-side hashing ' +
            'is not viable. `GET ?hash=<hex>` is also accepted as a quick smoke-test.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['hash'],
                  properties: { hash: { type: 'string', description: 'MD5 / SHA-1 / SHA-256 hex' } },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'SSE stream of provider results, terminating with composite verdict + public-sandbox links',
              content: { 'text/event-stream': { schema: { type: 'string' } } },
            },
            '400': { description: 'Invalid or missing hash' },
            '429': { description: 'SSE concurrent limit reached' },
          },
        },
      },
      '/api/v1/health/{dependency}': {
        get: {
          tags: ['Health'],
          summary: 'Dependency health check',
          description: 'Check health of specific dependencies: d1, kv, ai, vectorize',
          parameters: [
            {
              name: 'dependency',
              in: 'path',
              required: true,
              schema: { type: 'string', enum: ['d1', 'kv', 'ai', 'vectorize'] },
            },
          ],
          responses: {
            '200': { description: 'Dependency is healthy' },
            '503': { description: 'Dependency is unavailable' },
          },
        },
      },
      '/api/v1/ioc/check': {
        get: {
          tags: ['IOC'],
          summary: 'Check IOC reputation',
          description:
            'Check reputation of an IP, domain, URL, or hash across 30+ threat intelligence providers. ' +
            'Returns composite score, admiralty grade, and per-provider verdicts.',
          parameters: [
            {
              name: 'indicator',
              in: 'query',
              required: true,
              description: 'The IOC to check (IP, domain, URL, or hash)',
              schema: { type: 'string', maxLength: 2048 },
              example: '8.8.8.8',
            },
          ],
          responses: {
            '200': {
              description: 'IOC check results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      indicator: { type: 'string' },
                      type: { type: 'string', enum: ['ipv4', 'ipv6', 'domain', 'url', 'hash', 'email'] },
                      score: { type: 'number', minimum: 0, maximum: 100 },
                      grade: { type: 'string' },
                      verdicts: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            source: { type: 'string' },
                            malicious: { type: 'boolean' },
                            score: { type: 'number' },
                            details: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid indicator format' },
            '429': { description: 'Rate limited' },
          },
        },
      },
      '/api/v1/domain/lookup': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'Domain intelligence lookup',
          description:
            'Comprehensive domain analysis: DNS records, WHOIS/RDAP, CT logs, SPF/DKIM/DMARC, and threat intel.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
          ],
          responses: {
            '200': { description: 'Domain intelligence results' },
            '400': { description: 'Invalid domain format' },
          },
        },
      },
      '/api/v1/intodns/snapshot': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'IntoDNS.ai Everything Report snapshot',
          description:
            'Full DNS and email security report from IntoDNS.ai — DNS records, DNSSEC chain, DANE/TLSA, SPF lookup graph and flattening guidance, DKIM, DMARC, BIMI logo and VMC/CMC, MTA-STS, SMTP STARTTLS, FCrDNS, blacklists, sender requirements, web security, and preferred citation URLs. Cached 6h. Backed by https://intodns.ai/api/report/everything.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
            {
              name: 'format',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['json', 'markdown'] },
              description: 'When `markdown`, returns the LLM-ready Markdown form per https://intodns.ai/llm/api.md.',
            },
          ],
          responses: {
            '200': {
              description: 'JSON or Markdown body, depending on `format`.',
              content: {
                'application/json': { schema: { type: 'object' } },
                'text/markdown': { schema: { type: 'string' } },
              },
            },
            '400': { description: 'Invalid or missing domain' },
            '429': { description: 'Upstream rate-limited; `Retry-After` honored' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/intodns/explain': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'IntoDNS.ai LLM-explained report',
          description:
            'Fetches the IntoDNS Everything Report and returns a Groq (or Workers AI) plain-English interpretation with four sections: headline, critical issues, recommendations, and notes. Caches the explanation for 24h; degrades gracefully to `{ explanation: null, degraded: true }` when the LLM call fails. Per https://intodns.ai/llm/api.md the LLM doc recommends the Everything Report as the canonical evidence source.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
          ],
          responses: {
            '200': {
              description: 'Explanation object. `degraded: true` means the LLM call failed and `explanation` is null.',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            '400': { description: 'Invalid or missing domain' },
            '429': { description: 'Upstream rate-limited; `Retry-After` honored' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/intodns/blacklist': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'IntoDNS.ai DNSBL rollup for mail-server IPs',
          description:
            'Returns the blacklist status of every mail-server IP across Spamhaus, SpamCop, Barracuda, and other DNSBLs. Backed by https://intodns.ai/api/email/blacklist.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
          ],
          responses: {
            '200': { description: 'JSON object' },
            '400': { description: 'Invalid domain' },
            '429': { description: 'Upstream rate-limited' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/intodns/sender-requirements': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'IntoDNS.ai Google/Yahoo/Microsoft sender-requirements compliance',
          description:
            'Returns pass/fail status for every common mailbox-provider requirement (SPF, DKIM, DMARC, FCrDNS, etc.). Backed by https://intodns.ai/api/email/sender-requirements.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
          ],
          responses: {
            '200': { description: 'JSON object' },
            '400': { description: 'Invalid domain' },
            '429': { description: 'Upstream rate-limited' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/intodns/smtp-tls': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'IntoDNS.ai SMTP STARTTLS certificate checks',
          description:
            'Connects to MX servers and reports STARTTLS support, TLS protocol, certificate trust, hostname match, expiry. Backed by https://intodns.ai/api/email/smtp-tls.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
          ],
          responses: {
            '200': { description: 'JSON object' },
            '400': { description: 'Invalid domain' },
            '429': { description: 'Upstream rate-limited' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/intodns/fcrdns': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'IntoDNS.ai FCrDNS (PTR + forward-confirmation) for mail-server IPs',
          description:
            'Isolates PTR and forward-confirmed reverse DNS for mail-server IPs. Backed by https://intodns.ai/api/email/fcrdns.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
          ],
          responses: {
            '200': { description: 'JSON object' },
            '400': { description: 'Invalid domain' },
            '429': { description: 'Upstream rate-limited' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/intodns/dnssec': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'IntoDNS.ai DNSSEC chain-of-trust validation',
          description:
            'Validates the DNSSEC chain and reports each link with algorithm and flags. Backed by https://intodns.ai/api/dns/dnssec.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
          ],
          responses: {
            '200': { description: 'JSON object' },
            '400': { description: 'Invalid domain' },
            '429': { description: 'Upstream rate-limited' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/intodns/sec-headers': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'IntoDNS.ai live HTTP security-headers analysis',
          description:
            'Fetches the domain live and reports per-header pass/missing status with ready-to-paste fixes. Backed by https://intodns.ai/api/security-headers/analyze.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
          ],
          responses: {
            '200': { description: 'JSON object' },
            '400': { description: 'Invalid domain' },
            '429': { description: 'Upstream rate-limited' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/intodns/badge': {
        get: {
          tags: ['Domain Intelligence'],
          summary: 'IntoDNS.ai inline SVG security badge',
          description:
            'Returns the security-grade badge as image/svg+xml, embeddable in markdown/HTML. Backed by https://intodns.ai/api/badge/{domain}.',
          parameters: [
            {
              name: 'domain',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 253 },
              example: 'example.com',
            },
          ],
          responses: {
            '200': { description: 'image/svg+xml', content: { 'image/svg+xml': { schema: { type: 'string' } } } },
            '400': { description: 'Invalid domain' },
            '429': { description: 'Upstream rate-limited' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/intodns/debug-email': {
        post: {
          tags: ['Email Security'],
          summary: 'IntoDNS.ai raw-MIME email debug (spam score, alignment, suggestions)',
          description:
            'POST the raw MIME source of an email (or an .eml body) to get back a spam score, SPF/DKIM/DMARC alignment status, header issues, and prioritized suggestions. Backed by https://intodns.ai/api/debug-email. Accepts JSON { raw_email } or text/plain.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['raw_email'],
                  properties: { raw_email: { type: 'string', maxLength: 262144 } },
                },
              },
              'text/plain': { schema: { type: 'string', maxLength: 262144 } },
            },
          },
          responses: {
            '200': { description: 'JSON object with spamScore, alignment, headerAnalysis, suggestions' },
            '400': { description: 'Missing or too-large raw email' },
            '429': { description: 'Upstream rate-limited' },
            '502': { description: 'Upstream fetch failed' },
          },
        },
      },
      '/api/v1/cve/lookup': {
        get: {
          tags: ['CVE'],
          summary: 'CVE lookup',
          description:
            'Look up a CVE by ID or search by keyword. Returns CVSS score, EPSS probability, CISA KEV status, and references.',
          parameters: [
            {
              name: 'id',
              in: 'query',
              description: 'CVE identifier (e.g., CVE-2024-3094)',
              schema: { type: 'string', pattern: '^CVE-\\d{4}-\\d{4,7}$' },
            },
            {
              name: 'q',
              in: 'query',
              description: 'Search keyword (vendor, product, or vulnerability type)',
              schema: { type: 'string', maxLength: 500 },
            },
          ],
          responses: {
            '200': { description: 'CVE details' },
            '400': { description: 'Invalid parameters' },
          },
        },
      },
      '/api/v1/ip-geo': {
        get: {
          tags: ['IP Intelligence'],
          summary: 'IP geolocation and reputation',
          description: 'Get IP geolocation, ASN, company, and privacy detection (VPN/proxy/tor/hosting).',
          parameters: [
            {
              name: 'ip',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 45 },
              example: '8.8.8.8',
            },
          ],
          responses: {
            '200': { description: 'IP intelligence results' },
          },
        },
      },
      '/api/v1/phishing/analyze': {
        post: {
          tags: ['Phishing'],
          summary: 'Analyze email for phishing',
          description:
            'Parse raw email source for phishing indicators. Checks SPF/DKIM/DMARC, extracts URLs, computes risk score.',
          requestBody: {
            required: true,
            content: {
              'text/plain': {
                schema: { type: 'string', description: 'Full raw email source (headers + body)' },
              },
            },
          },
          responses: {
            '200': { description: 'Phishing analysis results' },
          },
        },
      },
      '/api/v1/briefings/today': {
        get: {
          tags: ['Briefings'],
          summary: "Today's threat briefing",
          description: "Get today's threat intelligence briefing with CVEs, ransomware activity, and emerging threats.",
          responses: {
            '200': { description: 'Daily briefing' },
          },
        },
      },
      '/api/v1/ransomware/recent': {
        get: {
          tags: ['Ransomware'],
          summary: 'Recent ransomware activity',
          description: 'Latest ransomware victims, group activity, and leak-site posts.',
          responses: {
            '200': { description: 'Ransomware activity data' },
          },
        },
      },
      '/api/v1/unified-search': {
        get: {
          tags: ['Analysis'],
          summary: 'Unified cross-source search',
          description: 'Search across all threat intelligence feeds by keyword, IOC, actor, malware, or CVE.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string', maxLength: 500 },
            },
          ],
          responses: {
            '200': { description: 'Search results across all sources' },
          },
        },
      },
      '/api/v1/openapi.json': {
        get: {
          tags: ['Health'],
          summary: 'OpenAPI specification',
          description: 'Returns this OpenAPI 3.1 specification in JSON format.',
          responses: {
            '200': {
              description: 'OpenAPI spec',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authenticated access. Create via admin panel.',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Bearer token (API key or admin token).',
        },
        AdminToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Admin-Token',
          description: 'Admin token for mutation endpoints. Set via Worker secrets.',
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing or invalid authentication',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string', example: 'unauthorized' },
                  message: { type: 'string', example: 'api key required' },
                },
              },
            },
          },
        },
        RateLimited: {
          description: 'Rate limit exceeded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string', example: 'rate_limited' },
                  message: { type: 'string' },
                  limit: { type: 'number' },
                  window_seconds: { type: 'number' },
                },
              },
            },
          },
          headers: {
            'Retry-After': {
              schema: { type: 'integer' },
              description: 'Seconds until rate limit resets',
            },
          },
        },
      },
    },
  };
}
