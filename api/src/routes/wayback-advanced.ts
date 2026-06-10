import type { Context } from 'hono';
import type { Env } from '../env';

interface WaybackEntry {
  timestamp: string;
  original: string;
  statuscode: number | string;
  mimetype: string;
  digest: string;
  length: number;
  urlkey: string;
  // Epoch ms parsed from the 14-digit YYYYMMDDHHmmss timestamp, or null if unparseable.
  dateMs: number | null;
}

/**
 * Parse a 14-digit Wayback timestamp (YYYYMMDDHHmmss) into epoch ms.
 * `new Date('20230115093000')` yields Invalid Date, so build the date explicitly.
 */
function parseWaybackTimestamp(ts: string | undefined): number | null {
  if (!ts || ts.length < 8 || !/^\d{8,14}$/.test(ts)) return null;
  const padded = ts.padEnd(14, '0');
  const ms = Date.UTC(
    +padded.slice(0, 4),
    +padded.slice(4, 6) - 1,
    +padded.slice(6, 8),
    +padded.slice(8, 10),
    +padded.slice(10, 12),
    +padded.slice(12, 14)
  );
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The Wayback CDX `output=json` response is an array-of-arrays where the first
 * row is the column header (its order follows the `fl` param when supplied, e.g.
 * ["urlkey","timestamp","original","mimetype","statuscode","digest","length"]).
 * Map each remaining row into a keyed WaybackEntry by reading the header indices
 * rather than assuming a fixed column order.
 */
function parseCdxResponse(raw: unknown): WaybackEntry[] {
  if (!Array.isArray(raw) || raw.length < 2) return [];
  const header = raw[0];
  if (!Array.isArray(header)) return [];

  const idx: Record<string, number> = {};
  header.forEach((col, i) => {
    if (typeof col === 'string') idx[col] = i;
  });

  const get = (row: unknown[], key: string): string => {
    const i = idx[key];
    if (i === undefined) return '';
    const v = row[i];
    return v === undefined || v === null ? '' : String(v);
  };

  const entries: WaybackEntry[] = [];
  for (let r = 1; r < raw.length; r++) {
    const row = raw[r];
    if (!Array.isArray(row)) continue;
    const timestamp = get(row, 'timestamp');
    const lengthStr = get(row, 'length');
    const lengthNum = Number.parseInt(lengthStr, 10);
    entries.push({
      timestamp,
      original: get(row, 'original'),
      statuscode: get(row, 'statuscode'),
      mimetype: get(row, 'mimetype'),
      digest: get(row, 'digest'),
      length: Number.isNaN(lengthNum) ? 0 : lengthNum,
      urlkey: get(row, 'urlkey'),
      dateMs: parseWaybackTimestamp(timestamp),
    });
  }
  return entries;
}

interface WaybackAdvancedResponse {
  domain: string;
  query_date_range: string;
  filter: string;
  total_results: number;
  entries: WaybackEntry[];
  analysis: {
    http_codes: Record<string, number>;
    file_types: Record<string, number>;
    status_distribution: {
      success: number;
      client_errors: number;
      server_errors: number;
      redirects: number;
    };
    temporal_patterns: {
      recent_activity: number;
      active_periods: string[];
      first_seen: string;
      last_seen: string;
    };
    security_indicators: {
      http_to_https: boolean;
      mixed_content: boolean;
      redirects: number;
      suspicious_paths: string[];
    };
    content_analysis: {
      total_size_bytes: number;
      avg_size_bytes: number;
      largest_snapshot: { url: string; size: number; timestamp: string } | null;
      path_changes: string[];
    };
  };
  recommendations: string[];
  timestamp: string;
}

const CACHE_TTL = 1800;
const API_TIMEOUT = 30000;

const SUSPICIOUS_PATH_PATTERNS = [
  '/admin',
  '/login',
  '/wp-admin',
  '/wp-login',
  '/phpMyAdmin',
  '/.env',
  '/config',
  '/backup',
  '/api',
  '/upload',
  '/shell',
  '/cmd',
];

function analyzeSecurityIndicators(
  entries: WaybackEntry[],
  domain: string
): WaybackAdvancedResponse['analysis']['security_indicators'] {
  const httpToHttps = entries.some((e) => e.original?.startsWith('http://') && !e.original?.includes('https://'));
  const suspiciousPaths: string[] = [];
  const redirectCount = entries.filter((e) => {
    const status = String(e.statuscode);
    return status.startsWith('3') || status === '301' || status === '302' || status === '304';
  }).length;

  for (const entry of entries) {
    const url = entry.original || '';
    for (const pattern of SUSPICIOUS_PATH_PATTERNS) {
      if (url.includes(pattern) && !suspiciousPaths.includes(pattern)) {
        suspiciousPaths.push(pattern);
      }
    }
  }

  const mixedContent = entries.some((e) => {
    const url = e.original || '';
    return (url.includes('http://') && url.includes('.js')) || url.includes('.css');
  });

  return {
    http_to_https: httpToHttps,
    mixed_content: mixedContent,
    redirects: redirectCount,
    suspicious_paths: suspiciousPaths,
  };
}

function analyzeContent(entries: WaybackEntry[]): WaybackAdvancedResponse['analysis']['content_analysis'] {
  const totalSize = entries.reduce((sum, e) => sum + (e.length || 0), 0);
  const avgSize = entries.length > 0 ? Math.round(totalSize / entries.length) : 0;

  let largestSnapshot: { url: string; size: number; timestamp: string } | null = null;
  for (const entry of entries) {
    if (!largestSnapshot || (entry.length || 0) > largestSnapshot.size) {
      largestSnapshot = {
        url: entry.original || '',
        size: entry.length || 0,
        timestamp: entry.timestamp,
      };
    }
  }

  const paths = entries
    .map((e) => {
      try {
        const url = new URL(e.original || '');
        return url.pathname;
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  const uniquePaths = Array.from(new Set(paths));
  const pathChanges: string[] = [];

  if (uniquePaths.length > 1) {
    const sorted = uniquePaths.sort();
    for (let i = 1; i < sorted.length && pathChanges.length < 10; i++) {
      const cur = sorted[i];
      if (cur !== undefined && cur !== sorted[i - 1]) {
        pathChanges.push(cur);
      }
    }
  }

  return {
    total_size_bytes: totalSize,
    avg_size_bytes: avgSize,
    largest_snapshot: largestSnapshot,
    path_changes: pathChanges,
  };
}

export async function waybackAdvancedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = (c.req.query('domain') ?? '').trim();
  const dateRange = c.req.query('date_range') ?? '';
  const filter = (c.req.query('filter') ?? 'all') as 'html' | 'js' | 'css' | 'all';
  const includeSuspicious = c.req.query('include_suspicious') === 'true';

  if (!domain) return c.json({ error: 'missing domain parameter' }, 400);

  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(domain)) {
    return c.json({ error: 'invalid domain format' }, 400);
  }

  let startDate: string | undefined;
  let endDate: string | undefined;
  if (dateRange) {
    const match = dateRange.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
    if (match) {
      [startDate, endDate] = match.slice(1);
    }
  }

  try {
    const limit = 200;
    const urlParams = new URLSearchParams({
      url: domain,
      output: 'json',
      fl: 'timestamp,original,statuscode,mimetype,digest,length,urlkey',
      limit: String(limit),
      collapse: 'digest',
      fastLatest: 'true',
    });

    const cdxUrl = `https://web.archive.org/cdx/search/cdx?${urlParams.toString()}`;

    const res = await fetch(cdxUrl, {
      headers: {
        'User-Agent': 'pranithjain-dfir/1.0',
        accept: 'application/json',
      },
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
      signal: AbortSignal.timeout(API_TIMEOUT),
    });

    if (!res.ok) {
      return c.json({ error: 'Wayback CDX lookup failed', message: `Upstream returned ${res.status}` }, 502, {
        'Cache-Control': 'no-store',
      });
    }

    const rawEntries = parseCdxResponse(await res.json());

    let filteredEntries = rawEntries;

    if (startDate && endDate) {
      const startTimestamp = new Date(startDate).getTime();
      const endTimestamp = new Date(endDate + 'T23:59:59Z').getTime();
      filteredEntries = rawEntries.filter((entry) => {
        if (entry.dateMs === null) return false;
        return entry.dateMs >= startTimestamp && entry.dateMs <= endTimestamp;
      });
    }

    if (filter !== 'all') {
      filteredEntries = filteredEntries.filter((entry) => {
        const mime = (entry.mimetype || '').toLowerCase();
        if (filter === 'html') return mime.includes('text/html');
        if (filter === 'js') return mime.includes('javascript') || mime.includes('ecmascript');
        if (filter === 'css') return mime.includes('text/css') || mime.includes('stylesheet');
        return true;
      });
    }

    if (!includeSuspicious) {
      filteredEntries = filteredEntries.filter((entry) => {
        const url = (entry.original || '').toLowerCase();
        return !SUSPICIOUS_PATH_PATTERNS.some((p) => url.includes(p));
      });
    }

    const httpCodes: Record<string, number> = {};
    const fileTypes: Record<string, number> = {};
    const statusDistribution = { success: 0, client_errors: 0, server_errors: 0, redirects: 0 };
    const activePeriods: string[] = [];

    for (const entry of filteredEntries) {
      const status = String(entry.statuscode);
      httpCodes[status] = (httpCodes[status] || 0) + 1;

      if (status.startsWith('2')) statusDistribution.success++;
      else if (status.startsWith('4')) statusDistribution.client_errors++;
      else if (status.startsWith('5')) statusDistribution.server_errors++;
      else if (status.startsWith('3')) statusDistribution.redirects++;

      const ext = (entry.mimetype || '').split('/')[1] || 'unknown';
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;

      if (entry.dateMs !== null) {
        const year = new Date(entry.dateMs).getUTCFullYear().toString();
        if (!activePeriods.includes(year)) activePeriods.push(year);
      }
    }

    const timestamps = filteredEntries
      .map((e) => e.dateMs)
      .filter((ms): ms is number => ms !== null)
      .sort((a, b) => a - b);
    const firstMs = timestamps[0];
    const lastMs = timestamps[timestamps.length - 1];
    const firstSeen = firstMs !== undefined ? new Date(firstMs).toISOString().slice(0, 10) : '';
    const lastSeen = lastMs !== undefined ? new Date(lastMs).toISOString().slice(0, 10) : '';

    const twelveMonthsAgo = Date.now() - 12 * 30 * 24 * 60 * 60 * 1000;
    const recentActivity = filteredEntries.filter((e) => e.dateMs !== null && e.dateMs > twelveMonthsAgo).length;

    const securityIndicators = analyzeSecurityIndicators(filteredEntries, domain);
    const contentAnalysis = analyzeContent(filteredEntries);

    const recommendations: string[] = [];

    if (filteredEntries.length === 0) {
      recommendations.push('No historical data found. Try broadening the date range or disabling filters.');
    }

    if (statusDistribution.server_errors > 5) {
      recommendations.push('Multiple server errors detected. Check for hosting instability or security issues.');
    }

    if (statusDistribution.redirects > 10) {
      recommendations.push('High redirect count. Investigate URL structure changes or potential redirection attacks.');
    }

    if (securityIndicators.suspicious_paths.length > 0) {
      recommendations.push(
        `Suspicious paths detected: ${securityIndicators.suspicious_paths.slice(0, 3).join(', ')}. Review for exposed admin interfaces.`
      );
    }

    if (recentActivity > 100) {
      recommendations.push('High recent activity. Consider monitoring for new vulnerabilities or content changes.');
    }

    const response: WaybackAdvancedResponse = {
      domain,
      query_date_range: dateRange || 'all-time',
      filter,
      total_results: filteredEntries.length,
      entries: filteredEntries.slice(0, 50),
      analysis: {
        http_codes: httpCodes,
        file_types: fileTypes,
        status_distribution: statusDistribution,
        temporal_patterns: {
          recent_activity: recentActivity,
          active_periods: activePeriods,
          first_seen: firstSeen,
          last_seen: lastSeen,
        },
        security_indicators: securityIndicators,
        content_analysis: contentAnalysis,
      },
      recommendations,
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 200, {
      'Cache-Control': `public, max-age=${CACHE_TTL}`,
    });
  } catch (err) {
    return c.json(
      { error: 'Enhanced Wayback lookup failed', message: err instanceof Error ? err.message : 'Unknown error' },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}
