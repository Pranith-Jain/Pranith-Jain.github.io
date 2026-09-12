/**
 * Tests for the exposure-monitor watch types (domain/brand/email/keyword)
 * in the watch engine. Uses the pool's real D1 (BRIEFINGS_DB) and seeds
 * caches.default with the same keys the cron-warmed producers write.
 *
 * Run via: npx vitest run api/test/lib/watch-engine.test.ts
 */
import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Env } from '../../src/env';
import { saveWatch, checkWatches, listWatches, getAlertLog, type Watch } from '../../src/lib/watch-engine';
import { RANSOMWARE_RECENT_CACHE_KEY } from '../../src/routes/ransomware-recent';
import { LIVE_IOCS_CACHE_KEY } from '../../src/routes/live-iocs';

void SELF;

const testEnv = env as unknown as Env;
const cache = (caches as unknown as { default: Cache }).default;
const NOW = new Date().toISOString();

async function seedCaches(): Promise<void> {
  // NOTE: seed Responses MUST carry cache-control — workerd's Cache API
  // will not store (hence never match) a response without one.
  const headers = { 'cache-control': 'public, max-age=3600' };
  await cache.put(
    new Request(RANSOMWARE_RECENT_CACHE_KEY),
    new Response(
      JSON.stringify({
        victims: [
          { victim: 'Kelmarsh Logistics', group: 'lockbit' },
          { victim: 'Brackwell Health', group: 'rhysida' },
        ],
      }),
      { status: 200, headers }
    )
  );
  await cache.put(
    new Request('https://cve-recent-cache.internal/v10-750-paged'),
    new Response(JSON.stringify({ cves: [{ id: 'CVE-2026-1234', description: 'SharePoint remote code execution' }] }), {
      status: 200,
      headers,
    })
  );
  await cache.put(
    new Request(LIVE_IOCS_CACHE_KEY),
    new Response(JSON.stringify({ items: [{ value: 'evil.example', kind: 'domain', source: 'unit-test' }] }), {
      status: 200,
      headers,
    })
  );
  await cache.put(
    new Request('https://actor-timeline-cache.internal/v3-mti'),
    new Response(JSON.stringify({ groups: [{ display_name: 'APT29', slug: 'apt29', posts_in_window: 3 }] }), {
      status: 200,
      headers,
    })
  );
}

let n = 0;
function watch(partial: Partial<Watch> & { type: Watch['type']; value: string }): Watch {
  n += 1;
  return {
    id: `w-${n}`,
    label: `label-${n}`,
    webhook: 'http://127.0.0.1:9/hook', // unroutable — webhook POST fails, alert still logs
    created_at: NOW,
    last_triggered: null,
    ...partial,
  };
}

async function clearWatches(): Promise<void> {
  const db = testEnv.BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not bound');
  for (const w of await listWatches(db)) {
    await db.prepare('DELETE FROM watches WHERE id = ?').bind(w.id).run();
  }
  await db
    .prepare('DELETE FROM alert_logs')
    .run()
    .catch(() => {});
}

describe('exposure-monitor watch types', () => {
  beforeEach(async () => {
    await seedCaches();
    await clearWatches();
  });

  it('domain watch fires on victim substring + IOC host', async () => {
    const db = testEnv.BRIEFINGS_DB!;
    await saveWatch(db, watch({ type: 'domain', value: 'kelmarsh' }));
    const alerts = await checkWatches(db, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.match).toContain('Kelmarsh Logistics');
    expect(alerts[0]?.detail).toContain('source:ransomware');
  });

  it('brand watch word-matches victims but ignores IOCs', async () => {
    const db = testEnv.BRIEFINGS_DB!;
    await saveWatch(db, watch({ type: 'brand', value: 'Brackwell' }));
    await saveWatch(db, watch({ type: 'brand', value: 'evil' }));
    const alerts = await checkWatches(db, NOW);
    expect(alerts.map((a) => a.value)).toEqual(['Brackwell']);
  });

  it('email watch matches IOC exactly and victim via domain part', async () => {
    const db = testEnv.BRIEFINGS_DB!;
    await saveWatch(db, watch({ type: 'email', value: 'cfo@kelmarsh-logistics.example' }));
    await saveWatch(db, watch({ type: 'email', value: 'nobody@evil.example' }));
    const alerts = await checkWatches(db, NOW);
    // nobody@evil.example hits the IOC exactly; the kelmarsh address has no
    // victim substring ('kelmarsh-logistics.example' vs 'Kelmarsh Logistics').
    expect(alerts.map((a) => a.value)).toEqual(['nobody@evil.example']);
    expect(alerts[0]?.detail).toContain('source:ioc');
  });

  it('keyword watch sweeps victims, CVEs and actors with source citation', async () => {
    const db = testEnv.BRIEFINGS_DB!;
    await saveWatch(db, watch({ type: 'keyword', value: 'sharepoint' }));
    await saveWatch(db, watch({ type: 'keyword', value: 'apt29' }));
    await saveWatch(db, watch({ type: 'keyword', value: 'brackwell' }));
    const alerts = await checkWatches(db, NOW);
    const byValue = new Map(alerts.map((a) => [a.value, a]));
    expect(byValue.get('sharepoint')?.detail).toContain('source:cve');
    expect(byValue.get('apt29')?.detail).toContain('source:actor');
    expect(byValue.get('brackwell')?.detail).toContain('source:ransomware');
  });

  it('short keywords never match and misses stay silent', async () => {
    const db = testEnv.BRIEFINGS_DB!;
    await saveWatch(db, watch({ type: 'keyword', value: 'x' }));
    await saveWatch(db, watch({ type: 'domain', value: 'no-such-company.example' }));
    expect(await checkWatches(db, NOW)).toHaveLength(0);
    expect(await getAlertLog(db)).toHaveLength(0);
  });

  it('1h cooldown suppresses repeat alerts', async () => {
    const db = testEnv.BRIEFINGS_DB!;
    await saveWatch(db, watch({ type: 'domain', value: 'kelmarsh' }));
    expect(await checkWatches(db, NOW)).toHaveLength(1);
    expect(await checkWatches(db, NOW)).toHaveLength(0);
    expect(await getAlertLog(db)).toHaveLength(1);
  });

  it('legacy types still fire (hoisted reads preserve behavior)', async () => {
    const db = testEnv.BRIEFINGS_DB!;
    await saveWatch(db, watch({ type: 'ransomware-group', value: 'lockbit' }));
    await saveWatch(db, watch({ type: 'cve-keyword', value: 'CVE-2026-1234' }));
    await saveWatch(db, watch({ type: 'ioc', value: 'evil.example' }));
    await saveWatch(db, watch({ type: 'actor', value: 'apt29' }));
    const alerts = await checkWatches(db, NOW);
    expect(alerts).toHaveLength(4);
  });
});
