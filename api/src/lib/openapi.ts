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
            'Public boolean map of which optional self-hosted bridges this deployment has configured (CAPE sandbox, recon bridge). Booleans only — never the bridge URLs or tokens. Used by the frontend to hide dormant tools until their *_BRIDGE_URL secret is set.',
          responses: {
            '200': {
              description: 'Feature flag map',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      cape: { type: 'boolean' },
                      recon: { type: 'boolean' },
                    },
                  },
                },
              },
            },
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
