import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import type { Env } from '../src/env';

const testEnv = env as unknown as Env;

async function ensureTables() {
  const db = testEnv.BRIEFINGS_DB;
  if (!db) throw new Error('BRIEFINGS_DB not bound');
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cti_iocs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      confidence INTEGER DEFAULT 50,
      malware_family TEXT DEFAULT '',
      threat_actor TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      raw_json TEXT DEFAULT '{}',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      observation_count INTEGER DEFAULT 1,
      decay_score REAL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cti_iocs_unique ON cti_iocs(value, source);

    CREATE TABLE IF NOT EXISTS cti_news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      source TEXT NOT NULL,
      published TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS cti_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      threat_level TEXT NOT NULL DEFAULT 'MEDIUM',
      confidence INTEGER DEFAULT 50,
      summary TEXT DEFAULT '',
      attack_flow TEXT DEFAULT '[]',
      target_sectors TEXT DEFAULT '[]',
      target_regions TEXT DEFAULT '[]',
      mitre_techniques TEXT DEFAULT '[]',
      malware_evolution TEXT DEFAULT '',
      novel_aspects TEXT DEFAULT '[]',
      indicators_to_watch TEXT DEFAULT '{}',
      defensive_recommendations TEXT DEFAULT '[]',
      reasoning TEXT DEFAULT '',
      based_on_sources TEXT DEFAULT '[]',
      date_range_start TEXT DEFAULT '',
      date_range_end TEXT DEFAULT '',
      generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS cti_mutation_seeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seed_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      seed_type TEXT DEFAULT 'custom',
      raw_input TEXT DEFAULT '',
      phases TEXT DEFAULT '[]',
      source_refs TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS cti_mutation_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id TEXT UNIQUE NOT NULL,
      seed_id TEXT NOT NULL,
      title TEXT NOT NULL,
      mutation_type TEXT DEFAULT 'phase_swap',
      threat_level TEXT DEFAULT 'HIGH',
      novelty_score INTEGER DEFAULT 0,
      danger_score INTEGER DEFAULT 0,
      plausibility INTEGER DEFAULT 0,
      combined_score INTEGER DEFAULT 0,
      summary TEXT DEFAULT '',
      phases TEXT DEFAULT '[]',
      mitre_chain TEXT DEFAULT '[]',
      what_changed TEXT DEFAULT '[]',
      why_dangerous TEXT DEFAULT '',
      detection_gaps TEXT DEFAULT '[]',
      defensive_actions TEXT DEFAULT '[]',
      attack_walkthrough TEXT DEFAULT '[]',
      defense_playbook TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS cti_collection_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      items_collected INTEGER DEFAULT 0,
      error_message TEXT DEFAULT '',
      started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      completed_at TEXT DEFAULT ''
    );
  `);
}

beforeAll(async () => {
  await ensureTables();
});

describe('CTI Collector API', () => {
  describe('GET /api/v1/cti/stats', () => {
    it('returns IOC stats with expected shape', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/stats');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('total_iocs');
      expect(body).toHaveProperty('active_iocs');
      expect(body).toHaveProperty('type_breakdown');
      expect(body).toHaveProperty('source_breakdown');
      expect(body).toHaveProperty('top_malware_families');
      expect(body).toHaveProperty('trending');
      expect(body).toHaveProperty('recent_news');
      expect(body).toHaveProperty('news_sources');
      expect(typeof body.total_iocs).toBe('number');
    });
  });

  describe('GET /api/v1/cti/iocs', () => {
    it('returns IOC list with expected shape', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/iocs');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('iocs');
      expect(Array.isArray(body.iocs)).toBe(true);
    });

    it('supports type filter', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/iocs?type=ip');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Array.isArray(body.iocs)).toBe(true);
    });

    it('supports source filter', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/iocs?source=threatfox');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(Array.isArray(body.iocs)).toBe(true);
    });
  });

  describe('GET /api/v1/cti/news', () => {
    it('returns news list with expected shape', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/news');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('news');
      expect(Array.isArray(body.news)).toBe(true);
    });
  });

  describe('GET /api/v1/cti/predictions', () => {
    it('returns predictions list', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/predictions');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('predictions');
      expect(Array.isArray(body.predictions)).toBe(true);
    });
  });

  describe('GET /api/v1/cti/mutations', () => {
    it('returns mutations with seeds and variants', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/mutations');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('seeds');
      expect(body).toHaveProperty('top_variants');
      expect(body).toHaveProperty('stats');
      expect(Array.isArray(body.seeds)).toBe(true);
      expect(Array.isArray(body.top_variants)).toBe(true);
    });
  });

  describe('POST /api/v1/cti/collect', () => {
    it('triggers collection and returns result', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/collect', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('iocs_stored');
      expect(body).toHaveProperty('news_stored');
      expect(body).toHaveProperty('sources_attempted');
      expect(body).toHaveProperty('sources_succeeded');
      expect(body).toHaveProperty('duration_ms');
      expect(typeof body.iocs_stored).toBe('number');
      expect(typeof body.sources_attempted).toBe('number');
      // After collection, stats should show non-zero totals
      console.log(
        `Collection: ${body.iocs_stored} IOCs, ${body.news_stored} news from ${body.sources_succeeded}/${body.sources_attempted} sources in ${body.duration_ms}ms`
      );
    }, 60_000); // Collection fetches external feeds, give it time
  });

  describe('POST /api/v1/cti/decay', () => {
    it('applies decay scoring', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/decay', {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty('updated');
      expect(typeof body.updated).toBe('number');
    });
  });

  describe('GET /api/v1/cti/stats (after collection)', () => {
    it('shows collected IOCs in stats', async () => {
      const res = await SELF.fetch('https://example.com/api/v1/cti/stats');
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      // After running collection, we should have some IOCs
      expect(typeof body.total_iocs).toBe('number');
      console.log(`Stats: ${body.total_iocs} total IOCs, ${body.active_iocs} active, ${body.recent_news} news`);
      if (typeof body.type_breakdown === 'object' && body.type_breakdown !== null) {
        console.log('Type breakdown:', JSON.stringify(body.type_breakdown));
      }
      if (Array.isArray(body.top_malware_families) && body.top_malware_families.length > 0) {
        console.log(
          'Top families:',
          body.top_malware_families
            .slice(0, 5)
            .map((f: any) => `${f.family}(${f.count})`)
            .join(', ')
        );
      }
    });
  });
});
