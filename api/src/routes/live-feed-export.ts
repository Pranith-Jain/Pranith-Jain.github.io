import type { Context } from 'hono';

export interface LiveFeedExportQuery {
  id?: string;
  format?: 'stix' | 'json' | 'csv';
  ioc?: string;
}

/**
 * GET /api/v1/live-feed/export?id=<id>&format=stix|json&ioc=<value>
 * Mirrors threatintelligence.dk /api/export.php?id=&format=stix&ioc=
 * Returns STIX 2.1 bundle or JSON for a live-feed article / single IOC.
 * No auth required — feed is public, export is derived.
 */
export async function liveFeedExportHandler(c: Context): Promise<Response> {
  const url = new URL(c.req.url);
  const id = url.searchParams.get('id') || url.searchParams.get('cve') || 'unknown';
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  const iocValue = url.searchParams.get('ioc');

  const now = new Date().toISOString();
  const bundleId = `bundle--${id.replace(/[^a-zA-Z0-9-]/g, '-')}-${Date.now()}`;

  if (format === 'stix' || format === 'stix-json') {
    const objects: unknown[] = [
      {
        type: 'identity',
        spec_version: '2.1',
        id: 'identity--pranith-jain-platform',
        created: now,
        modified: now,
        name: 'Pranith Jain Threat Intel Platform',
        identity_class: 'system',
      },
      {
        type: 'report',
        spec_version: '2.1',
        id: `report--${id}`,
        created: now,
        modified: now,
        name: `Live Feed Export — ${id}`,
        description: `Exported from live threat feed article ${id}${iocValue ? ` (IOC: ${iocValue})` : ''}`,
        published: now,
        object_refs: iocValue ? [`indicator--${iocValue.replace(/[^a-zA-Z0-9]/g, '')}`] : [`vulnerability--${id}`],
        labels: ['threat-report'],
      },
    ];

    if (iocValue) {
      objects.push({
        type: 'indicator',
        spec_version: '2.1',
        id: `indicator--${iocValue.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}-${Date.now().toString(36)}`,
        created: now,
        modified: now,
        name: iocValue,
        description: `Indicator observed in ${id}`,
        indicator_types: ['malicious-activity'],
        pattern: `[${iocValue.includes('.') ? `domain-name:value = '${iocValue}'` : `ipv4-addr:value = '${iocValue}'`}]`,
        pattern_type: 'stix',
        valid_from: now,
        labels: ['malicious-activity'],
      });
    } else {
      objects.push({
        type: 'vulnerability',
        spec_version: '2.1',
        id: `vulnerability--${id}`,
        created: now,
        modified: now,
        name: id,
        description: `Vulnerability ${id} from live feed`,
      });
    }

    const bundle = {
      type: 'bundle',
      id: bundleId,
      spec_version: '2.1' as const,
      objects,
    };

    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        'Content-Type': 'application/stix+json; version=2.1',
        'Content-Disposition': `attachment; filename="${id}.stix.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (format === 'csv') {
    const csv = `type,value,source,first_seen\n${iocValue ? `indicator,${iocValue},live-feed,${now}\n` : `cve,${id},live-feed,${now}\n`}`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${id}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // default json
  const payload: Record<string, unknown> = {
    id,
    exported_at: now,
    source: 'Pranith Jain Live Threat Feed',
    ioc: iocValue || null,
    article: { id, url: `https://pranithjain.qzz.io/threatintel/live-feed?id=${encodeURIComponent(id)}` },
    iocs: iocValue ? [{ type: 'unknown', value: iocValue }] : [],
    mitre: [{ id: 'T1190', name: 'Exploit Public-Facing Application', tactic: 'Initial Access' }],
  };

  return c.json(payload, 200, {
    'Content-Disposition': `attachment; filename="${id}.json"`,
    'Cache-Control': 'no-store',
  });
}
