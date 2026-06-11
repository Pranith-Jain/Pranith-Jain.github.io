import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError } from '../lib/api-error';
import { resolveEntity, buildEntityProfile, type ResolvedEntity, type EntityProfile } from '../lib/entity-resolution';

interface ObserveResponse {
  query: string;
  entity_type: string;
  entity?: ResolvedEntity;
  profile?: EntityProfile;
  wiki_articles: Array<{ slug: string; title: string; category: string; description: string }>;
  cached_indicators?: {
    live_ioc_count: number;
    c2_count: number;
    malware_sample_count: number;
    breach_hits: number;
  };
  generated_at: string;
}

interface WikiArticle {
  slug: string;
  title: string;
  category: string;
  description: string;
}

const WIKI_ARTICLES: WikiArticle[] = [
  {
    slug: 'spf',
    title: 'SPF (Sender Policy Framework)',
    category: 'Email Security',
    description: 'DNS-based email authentication protocol.',
  },
  {
    slug: 'dkim',
    title: 'DKIM (DomainKeys Identified Mail)',
    category: 'Email Security',
    description: 'Cryptographic email signing standard.',
  },
  {
    slug: 'dmarc',
    title: 'DMARC (Domain-based Message Authentication)',
    category: 'Email Security',
    description: 'Email authentication policy framework.',
  },
  {
    slug: 'ransomware',
    title: 'Ransomware',
    category: 'Attack Types',
    description: 'Malware that encrypts files and demands payment.',
  },
  {
    slug: 'phishing',
    title: 'Phishing',
    category: 'Attack Types',
    description: 'Social engineering attack via deceptive messages.',
  },
  {
    slug: 'ioc',
    title: 'Indicators of Compromise (IOCs)',
    category: 'Threat Intelligence',
    description: 'Forensic artifacts of a security breach.',
  },
  {
    slug: 'stix',
    title: 'STIX (Structured Threat Information Expression)',
    category: 'Threat Intelligence',
    description: 'Standardized threat intelligence language.',
  },
  {
    slug: 'tat',
    title: 'Threat Actor TTPs',
    category: 'Threat Intelligence',
    description: 'Tactics, techniques, and procedures of threat actors.',
  },
  {
    slug: 'c2',
    title: 'Command & Control (C2)',
    category: 'Threat Intelligence',
    description: 'Infrastructure used by attackers to control compromised systems.',
  },
  {
    slug: 'malware-analysis',
    title: 'Malware Analysis',
    category: 'Forensics',
    description: 'Process of studying malicious software.',
  },
  {
    slug: 'memory-forensics',
    title: 'Memory Forensics',
    category: 'Forensics',
    description: 'Analysis of volatile memory for forensic evidence.',
  },
  {
    slug: 'dfir',
    title: 'Digital Forensics & Incident Response (DFIR)',
    category: 'Forensics',
    description: 'The practice of investigating and responding to security incidents.',
  },
  {
    slug: 'sigma',
    title: 'Sigma Rules',
    category: 'Detection Engineering',
    description: 'Generic signature format for SIEM detection.',
  },
  {
    slug: 'yara',
    title: 'YARA Rules',
    category: 'Detection Engineering',
    description: 'Malware identification and classification tool.',
  },
  {
    slug: 'ai-security',
    title: 'AI Security',
    category: 'AI Security',
    description: 'Security considerations for artificial intelligence systems.',
  },
  {
    slug: 'supply-chain',
    title: 'Supply Chain Attacks',
    category: 'Attack Types',
    description: 'Attacks targeting third-party components and dependencies.',
  },
  {
    slug: 'zero-trust',
    title: 'Zero Trust Architecture',
    category: 'AI Security',
    description: 'Security framework requiring continuous verification.',
  },
  {
    slug: 'data-classification',
    title: 'Data Classification',
    category: 'Data Security & Privacy',
    description: 'Categorizing data based on sensitivity and value.',
  },
  {
    slug: 'gdpr',
    title: 'GDPR Compliance',
    category: 'Compliance & Frameworks',
    description: 'EU General Data Protection Regulation requirements.',
  },
  {
    slug: 'nist-csf',
    title: 'NIST Cybersecurity Framework',
    category: 'Compliance & Frameworks',
    description: 'Framework for improving critical infrastructure cybersecurity.',
  },
];

async function readCachedJson<T>(key: string): Promise<T | null> {
  try {
    const cache = caches.default;
    const cached = await cache.match(new Request(key));
    if (cached) return (await cached.json()) as T;
  } catch {
    /* miss */
  }
  return null;
}

export async function observeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const q = c.req.query('q')?.trim();
    if (!q) return badRequest(c, 'missing query param q');

    const entity = resolveEntity(q);
    const entityType = entity?.type ?? detectRawType(q);
    let profile: EntityProfile | undefined;
    if (entity) {
      try {
        profile = await buildEntityProfile(entity);
      } catch {
        /* non-fatal */
      }
    }

    const ql = q.toLowerCase();
    const matchedWiki = WIKI_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(ql) ||
        a.description.toLowerCase().includes(ql) ||
        a.category.toLowerCase().includes(ql) ||
        a.slug === ql
    );

    const cachedCounts = await gatherCachedCounts(q, entityType);

    const response: ObserveResponse = {
      query: q,
      entity_type: entityType,
      entity: entity ?? undefined,
      profile,
      wiki_articles: matchedWiki,
      cached_indicators: cachedCounts,
      generated_at: new Date().toISOString(),
    };

    return c.json(response, 200, {
      'Cache-Control': 'public, max-age=60',
    });
  } catch (e) {
    return internalError(c, e);
  }
}

async function gatherCachedCounts(q: string, type: string): Promise<ObserveResponse['cached_indicators']> {
  const ql = q.toLowerCase();
  const counts: ObserveResponse['cached_indicators'] = {
    live_ioc_count: 0,
    c2_count: 0,
    malware_sample_count: 0,
    breach_hits: 0,
  };
  const promises: Promise<void>[] = [
    (async () => {
      try {
        const liveIocs = await readCachedJson<{ items?: Array<{ value?: string }> }>('https://live-iocs.internal/v8');
        if (liveIocs?.items) {
          counts.live_ioc_count = liveIocs.items.filter((i) => i.value?.toLowerCase() === ql).length;
        }
      } catch {
        /* skip */
      }
    })(),
    (async () => {
      try {
        const c2Data = await readCachedJson<{ entries?: Array<{ ip?: string }> }>('https://c2-cache.internal/v8');
        if (c2Data?.entries) {
          counts.c2_count = c2Data.entries.filter((e) => e.ip?.toLowerCase() === ql).length;
        }
      } catch {
        /* skip */
      }
    })(),
  ];

  if (type === 'hash') {
    promises.push(
      (async () => {
        try {
          const samples = await readCachedJson<{ samples?: Array<{ sha256?: string }> }>(
            'https://malware-samples.internal/v8'
          );
          if (samples?.samples) {
            counts.malware_sample_count = samples.samples.filter((s) => s.sha256?.toLowerCase() === ql).length;
          }
        } catch {
          /* skip */
        }
      })()
    );
  }

  promises.push(
    (async () => {
      try {
        const breaches = await readCachedJson<{ breaches?: Array<{ name?: string; domain?: string }> }>(
          'https://breach-cache.internal/v6-hibp-only'
        );
        if (breaches?.breaches) {
          counts.breach_hits = breaches.breaches.filter(
            (b) => b.name?.toLowerCase().includes(ql) || b.domain?.toLowerCase() === ql
          ).length;
        }
      } catch {
        /* skip */
      }
    })()
  );

  await Promise.allSettled(promises);
  return counts;
}

function detectRawType(input: string): string {
  const v = input.trim();
  if (/^CVE-\d{4}-\d{4,}$/i.test(v)) return 'cve';
  if (/^T\d{4}/i.test(v)) return 'mitre-technique';
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v)) return 'ip';
  if (/^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(v)) return 'hash';
  if (/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(v)) return 'domain';
  if (/^https?:\/\//i.test(v)) return 'url';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'email';
  return 'unknown';
}
