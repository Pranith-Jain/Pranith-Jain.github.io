import type { Context } from 'hono';
import type { Env } from '../env';

export async function openapiHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Pranith Jain CTI Platform API',
      version: '1.0.0',
      description: 'Threat intelligence API with AI-powered analysis, IOC extraction, MITRE mapping, and more.',
    },
    servers: [{ url: 'https://pranithjain.qzz.io' }],
    paths: {
      '/api/v1/threat-analysis': {
        post: {
          summary: 'AI threat analysis',
          description: 'Analyze a threat event, country, indicator, or research post using GPT-120b.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['event', 'country', 'indicator', 'research'] },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    country: { type: 'string' },
                    indicator: { type: 'string' },
                    source: { type: 'string' },
                  },
                  required: ['type'],
                },
              },
            },
          },
          responses: { '200': { description: 'Analysis result' } },
        },
      },
      '/api/v1/ioc-extraction': {
        post: {
          summary: 'Extract IOCs from text',
          description: 'Extract indicators of compromise (IPs, domains, hashes, CVEs, etc.) from article text.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    title: { type: 'string' },
                    source: { type: 'string' },
                  },
                  required: ['text'],
                },
              },
            },
          },
          responses: { '200': { description: 'Extracted IOCs' } },
        },
      },
      '/api/v1/mitre-mapping': {
        post: {
          summary: 'Map to MITRE ATT&CK',
          description: 'Automatically map threat intelligence to MITRE ATT&CK techniques.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    title: { type: 'string' },
                  },
                  required: ['text'],
                },
              },
            },
          },
          responses: { '200': { description: 'ATT&CK mapping' } },
        },
      },
      '/api/v1/country-intel': {
        post: {
          summary: 'Country threat intelligence',
          description: 'Generate a comprehensive threat profile for a country.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    country: { type: 'string' },
                    events: { type: 'array', items: { type: 'object' } },
                  },
                  required: ['country'],
                },
              },
            },
          },
          responses: { '200': { description: 'Country intelligence brief' } },
        },
      },
      '/api/v1/feed-digest': {
        post: {
          summary: 'AI feed digest',
          description: 'Generate a daily/weekly intelligence digest from feed articles.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { type: 'object' } },
                    period: { type: 'string', enum: ['daily', 'weekly'] },
                  },
                  required: ['items'],
                },
              },
            },
          },
          responses: { '200': { description: 'Intelligence digest' } },
        },
      },
      '/api/v1/event-correlation': {
        post: {
          summary: 'Correlate events',
          description: 'Identify related events across feeds that belong to the same campaign or incident.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    events: { type: 'array', items: { type: 'object' } },
                  },
                  required: ['events'],
                },
              },
            },
          },
          responses: { '200': { description: 'Correlation results' } },
        },
      },
      '/api/v1/campaign-tracker': {
        post: {
          summary: 'Track campaigns',
          description: 'Build a campaign timeline from related threat events.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    events: { type: 'array', items: { type: 'object' } },
                  },
                  required: ['title', 'events'],
                },
              },
            },
          },
          responses: { '200': { description: 'Campaign analysis' } },
        },
      },
      '/api/v1/feed-quality': {
        post: {
          summary: 'Assess feed quality',
          description: 'Rate feed source reliability using NATO intelligence grading.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sources: { type: 'array', items: { type: 'object' } },
                  },
                  required: ['sources'],
                },
              },
            },
          },
          responses: { '200': { description: 'Quality assessment' } },
        },
      },
      '/api/v1/story-cluster': {
        post: {
          summary: 'Cluster duplicate stories',
          description: 'Group articles covering the same incident into clusters.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    articles: { type: 'array', items: { type: 'object' } },
                  },
                  required: ['articles'],
                },
              },
            },
          },
          responses: { '200': { description: 'Story clusters' } },
        },
      },
      '/api/v1/research-digest': {
        post: {
          summary: 'Weekly research digest',
          description: 'Generate a weekly research digest from security research articles.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    articles: { type: 'array', items: { type: 'object' } },
                  },
                  required: ['articles'],
                },
              },
            },
          },
          responses: { '200': { description: 'Research digest' } },
        },
      },
      '/api/v1/darkweb-intel': {
        post: {
          summary: 'Dark web intelligence',
          description: 'Analyze dark web monitoring items for threat intelligence.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: { type: 'array', items: { type: 'object' } },
                  },
                  required: ['items'],
                },
              },
            },
          },
          responses: { '200': { description: 'Dark web intel brief' } },
        },
      },
      '/api/v1/knowledge-graph': {
        post: {
          summary: 'Generate knowledge graph',
          description: 'Build a threat intelligence knowledge graph from actors, campaigns, and TTPs.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    actors: { type: 'array', items: { type: 'string' } },
                    campaigns: { type: 'array', items: { type: 'string' } },
                    ttps: { type: 'array', items: { type: 'string' } },
                    context: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Knowledge graph' } },
        },
      },
    },
  };

  return c.json(spec);
}
