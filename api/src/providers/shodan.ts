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

  try {
    const isIP = indicator.type === 'ipv4' || indicator.type === 'ipv6';
    const url = isIP
      ? `https://api.shodan.io/shodan/host/${encodeURIComponent(indicator.value)}?key=${env.SHODAN_API_KEY}`
      : `https://api.shodan.io/dns/domain/${encodeURIComponent(indicator.value)}?key=${env.SHODAN_API_KEY}`;

    const res = await fetch(url, { signal });
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
