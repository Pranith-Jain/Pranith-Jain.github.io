import type { ProviderAdapter, ProviderResult, Verdict } from './types';

const supports = new Set(['ipv4', 'ipv6', 'domain']);

export const shodan: ProviderAdapter = async (indicator, env, signal) => {
  const now = new Date().toISOString();
  const base = (status: ProviderResult['status'], extra: Partial<ProviderResult> = {}): ProviderResult => ({
    source: 'shodan',
    status,
    score: 0,
    verdict: 'unknown',
    raw_summary: {},
    tags: [],
    fetched_at: now,
    cached: false,
    ...extra,
  });

  if (!supports.has(indicator.type)) return base('unsupported');

  // No key → "provider not applicable" instead of an opaque 401.
  const key = (env as { SHODAN_API_KEY?: string }).SHODAN_API_KEY;
  if (!key) return base('unsupported');

  try {
    const isIP = indicator.type === 'ipv4' || indicator.type === 'ipv6';
    // Shodan's REST API authenticates via the `key` query param ONLY — it does
    // NOT support HTTP Basic auth on api.shodan.io. A May-2026 sweep switched to
    // `Authorization: Basic`, which Shodan ignored → every call 401'd and every
    // indicator came back "shodan-no-access". Send the key as the query param.
    const path = isIP
      ? `shodan/host/${encodeURIComponent(indicator.value)}`
      : `dns/domain/${encodeURIComponent(indicator.value)}`;
    const url = `https://api.shodan.io/${path}?key=${encodeURIComponent(key)}`;

    const res = await fetch(url, { signal });
    // 401 / 403 = key denied (Shodan host/dns endpoints require Membership tier).
    // Treat as a graceful "no data from this provider" so the overall verdict
    // isn't polluted by a permission issue rather than a real signal.
    if (res.status === 401 || res.status === 403) {
      return base('ok', {
        score: 0,
        verdict: 'unknown',
        tags: ['shodan-no-access'],
        raw_summary: { reason: `${res.status} from Shodan (membership endpoint)` },
      });
    }
    // 404 = host not indexed. Common for clean infrastructure.
    if (res.status === 404) {
      return base('ok', {
        score: 0,
        verdict: 'clean',
        tags: ['shodan-no-data'],
        raw_summary: { reason: 'host not indexed' },
      });
    }
    if (!res.ok) return base('error', { error: `${res.status} ${res.statusText}`.trim() });

    const json = (await res.json()) as Record<string, unknown>;

    if (isIP) {
      const ports = (json.ports as number[] | undefined) ?? [];
      const vulnsRaw = json.vulns;
      const vulns: string[] = Array.isArray(vulnsRaw)
        ? (vulnsRaw as string[])
        : typeof vulnsRaw === 'object' && vulnsRaw !== null
          ? Object.keys(vulnsRaw)
          : [];

      const openPorts = ports.length;
      const vulnsCount = vulns.length;
      const score = Math.min(100, vulnsCount * 10 + (openPorts > 100 ? 30 : openPorts > 20 ? 15 : 0));
      const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

      const tags: string[] = [];
      const shodanTags = (json.tags as string[] | undefined) ?? [];
      shodanTags.slice(0, 5).forEach((t) => tags.push(t));
      if (json.country_name && typeof json.country_name === 'string') tags.push(json.country_name);
      if (json.org && typeof json.org === 'string') tags.push(json.org);
      const uniqueTags = [...new Set(tags)].slice(0, 7);

      return base('ok', {
        score,
        verdict,
        raw_summary: {
          ports: ports.slice(0, 8),
          country: json.country_name ?? '',
          org: json.org ?? '',
          vulns: vulns.slice(0, 5),
        },
        tags: uniqueTags,
      });
    } else {
      // domain
      const subdomains = (json.subdomains as string[] | undefined) ?? [];
      const subdomainsCount = subdomains.length;
      const score = subdomainsCount > 50 ? 40 : subdomainsCount > 0 ? 20 : 0;
      const verdict: Verdict = score >= 70 ? 'malicious' : score >= 40 ? 'suspicious' : 'clean';

      return base('ok', {
        score,
        verdict,
        raw_summary: { subdomains_count: subdomainsCount },
        tags: [],
      });
    }
  } catch (err) {
    return base('error', { error: err instanceof Error ? err.message : String(err) });
  }
};
