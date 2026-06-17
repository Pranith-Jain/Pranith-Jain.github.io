import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * Package verdict checker — inspired by projectdiscovery/depx.
 *
 * Checks if a specific package is known-malicious by querying the
 * OpenSSF Malicious Packages database (OSV format). Returns a verdict
 * (clean/malicious) with advisory details.
 *
 * GET /api/v1/package-verdict?ecosystem=npm&package=lodash
 * GET /api/v1/package-verdict?ref=npm:lodash
 */

const GH_API_BASE = 'https://api.github.com/repos/ossf/malicious-packages/contents/osv/malicious';
const OSV_API = 'https://api.osv.dev/v1/query';

interface Advisory {
  id: string;
  summary: string;
  modified: string;
  published?: string;
  withdrawn?: boolean;
}

interface VerdictResponse {
  schema_version: string;
  command: string;
  data: {
    ref: string;
    purl: string;
    verdict: 'clean' | 'malicious' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
    ids: string[];
    package_ecosystem: string;
    package_name: string;
    registry_url: string;
    advisories: Advisory[];
    checked_ecosystems?: string[];
    matched_ecosystems?: string[];
  };
  timestamp: string;
}

const ECOSYSTEM_MAP: Record<string, string> = {
  npm: 'npm',
  pypi: 'pypi',
  pyPI: 'pypi',
  go: 'go',
  golang: 'go',
  maven: 'maven',
  rubygems: 'rubygems',
  'crates.io': 'crates.io',
  cargo: 'crates.io',
  nuget: 'nuget',
  packagist: 'packagist',
};

const REGISTRY_URLS: Record<string, string> = {
  npm: 'https://www.npmjs.com/package/',
  pypi: 'https://pypi.org/project/',
  go: 'https://pkg.go.dev/',
  maven: 'https://mvnrepository.com/artifact/',
  rubygems: 'https://rubygems.org/gems/',
  'crates.io': 'https://crates.io/crates/',
  nuget: 'https://www.nuget.org/packages/',
  packagist: 'https://packagist.org/packages/',
};

function normalizeEco(eco: string): string {
  return ECOSYSTEM_MAP[eco.toLowerCase()] ?? eco.toLowerCase();
}

async function checkOssf(ecosystem: string, packageName: string, token?: string): Promise<Advisory[]> {
  // Try the GitHub Contents API to list advisories for this package
  const path = `${GH_API_BASE}/${encodeURIComponent(ecosystem)}/${encodeURIComponent(packageName)}`;
  try {
    const res = await fetchResilient(
      path,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'pranithjain-dfir/1.0',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      { attempts: 2, timeoutMs: 10_000 }
    );
    if (!res.ok) return [];
    const entries = (await res.json()) as Array<{ name: string; type: string }>;
    return entries
      .filter((e) => e.type === 'file' && e.name.endsWith('.json'))
      .map((e) => ({
        id: e.name.replace('.json', ''),
        summary: `Malicious package advisory: ${packageName}`,
        modified: '',
      }));
  } catch {
    return [];
  }
}

async function checkOsv(ecosystem: string, packageName: string): Promise<Advisory[]> {
  try {
    const ecoMap: Record<string, string> = {
      npm: 'npm',
      pypi: 'PYPI',
      go: 'Go',
      maven: 'MAVEN',
      rubygems: 'RUBYGEMS',
      'crates.io': 'CRATES',
      nuget: 'NUGET',
      packagist: 'PACKAGIST',
    };
    const osvEco = ecoMap[ecosystem] ?? ecosystem.toUpperCase();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(OSV_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: packageName, ecosystem: osvEco },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = (await res.json()) as {
      vulns?: Array<{ id: string; summary?: string; modified?: string; published?: string; withdrawn?: string }>;
    };
    return (data.vulns ?? []).map((v) => ({
      id: v.id,
      summary: v.summary ?? `Vulnerability in ${packageName}`,
      modified: v.modified ?? '',
      published: v.published,
      withdrawn: Boolean(v.withdrawn),
    }));
  } catch {
    return [];
  }
}

export async function packageVerdictHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    let ecosystem: string;
    let packageName: string;

    // Support ?ref=npm:lodash or ?ecosystem=npm&package=lodash
    const ref = c.req.query('ref');
    if (ref) {
      const parts = ref.split(':');
      if (parts.length !== 2) {
        return c.json({ error: 'invalid ref format; expected ecosystem:package (e.g. npm:lodash)' }, 400);
      }
      ecosystem = normalizeEco(parts[0] ?? '');
      packageName = parts[1] ?? '';
    } else {
      ecosystem = normalizeEco(c.req.query('ecosystem') ?? '');
      packageName = (c.req.query('package') ?? '').trim();
    }

    if (!ecosystem || !packageName) {
      return c.json({ error: 'missing required params: ecosystem + package, or ref' }, 400);
    }

    const githubToken = c.env.GITHUB_TOKEN;

    // Check OSSF + OSV in parallel — OSV is optional, degrade gracefully
    const [ossfAdvisories, osvAdvisories] = await Promise.all([
      checkOssf(ecosystem, packageName, githubToken).catch(() => [] as Advisory[]),
      checkOsv(ecosystem, packageName).catch(() => [] as Advisory[]),
    ]);

    // Deduplicate advisories by ID
    const seen = new Set<string>();
    const advisories: Advisory[] = [];
    for (const a of [...osvAdvisories, ...ossfAdvisories]) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        advisories.push(a);
      }
    }

    const isMalicious = advisories.some((a) => a.id.startsWith('MAL-') && !a.withdrawn);
    const verdict = isMalicious ? 'malicious' : advisories.length > 0 ? 'clean' : 'unknown';
    const confidence = isMalicious ? 'high' : advisories.length > 0 ? 'medium' : 'low';

    const response: VerdictResponse = {
      schema_version: '1',
      command: 'check',
      data: {
        ref: `${ecosystem}:${packageName}`,
        purl: `pkg:${ecosystem}/${packageName}`,
        verdict,
        confidence,
        ids: advisories.map((a) => a.id),
        package_ecosystem: ecosystem,
        package_name: packageName,
        registry_url: `${REGISTRY_URLS[ecosystem] ?? ''}${packageName}`,
        advisories,
      },
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 200, {
      'Cache-Control': 'public, max-age=3600',
    });
  } catch (err) {
    return c.json(
      { error: 'package verdict lookup failed', message: err instanceof Error ? err.message : 'Unknown error' },
      500,
      { 'Cache-Control': 'no-store' }
    );
  }
}
