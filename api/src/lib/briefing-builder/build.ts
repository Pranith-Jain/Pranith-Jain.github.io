import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../../env';
import { type IocEntry, type SourceId } from '../ioc-feed-parsers';
import { fetchMtiSource, type MtiCveRecord } from '../mythreatintel-api';
import { fetchRansomwareRecent, type RansomwareVictim } from '../../routes/ransomware-recent';
import { normalizeGroup } from '../group-normalize';
import { computeDailyWindow, computeLiveDailyWindow } from '../briefing-window';
import { fetchCveFeedHighSeverity, type CveFeedEntry } from '../../routes/cve-recent';
import { BRIEFING_MAX_AGE_DAYS, IOC_FEED_SOURCES } from './config';
import { withLastGood, fetchKev, fetchNvdRecent, fetchCirclRecent, fetchNvdByIds, fetchFeedResilient } from './feeds';
import {
  isoDate,
  isoYearWeek,
  startOfIsoWeek,
  findingFromNvd,
  findingFromKev,
  buildSections,
  bucketIocs,
  buildStats,
  buildIocDump,
  buildLlmExecutiveSummary,
  severityFromCvss,
  deriveMitreTechniques,
  withinRange,
  aggregateWeeklyFromDailies,
  mergeWeeklyWithDailies,
  safeJsonParse,
} from './aggregate';
import type { Briefing, BriefingType, BriefingFinding, BriefingStats, Severity, NvdCve, KevEntry } from './types';

export async function buildBriefing(
  type: BriefingType,
  anchor: Date = new Date(),
  opts: { nvdApiKey?: string; env?: Env; live?: boolean } = {}
): Promise<Briefing> {
  let rangeStart: Date;
  let rangeEnd: Date;
  let dateLabel: string;
  let rangeLabel: string;
  let slug: string;
  let title: string;

  if (type === 'daily') {
    const w = opts.live ? computeLiveDailyWindow(anchor) : computeDailyWindow(anchor);
    rangeStart = w.start;
    rangeEnd = w.end;
    dateLabel = w.slug.replace(/^daily-/, '');
    rangeLabel = w.rangeLabel;
    slug = w.slug;
    title = `Daily Threat Briefing — ${dateLabel}`;
  } else {
    const end = startOfIsoWeek(anchor);
    const start = new Date(end.getTime() - 7 * 86400_000);
    rangeStart = start;
    rangeEnd = end;
    dateLabel = isoDate(start);
    rangeLabel = `${isoDate(start)} – ${isoDate(new Date(end.getTime() - 86400_000))}`;
    slug = `weekly-${isoYearWeek(start)}`;
    title = `Weekly Threat Briefing — ${rangeLabel}`;
  }

  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();

  const wrap = <T>(p: Promise<T>, fallback: T) =>
    p.then((v) => ({ ok: true, v })).catch(() => ({ ok: false, v: fallback }));
  const mtiEnv = opts.env;
  const [kevR, urlhaus, malwarebazaar, threatfox, tweetfeed, nvdR, ransomwareBundle, mtiCveItems, cvefeedItems] =
    await Promise.all([
      wrap(withLastGood(mtiEnv, 'briefing-kev', fetchKev), [] as KevEntry[]),
      fetchFeedResilient(mtiEnv, 'urlhaus'),
      fetchFeedResilient(mtiEnv, 'malwarebazaar'),
      fetchFeedResilient(mtiEnv, 'threatfox'),
      fetchFeedResilient(mtiEnv, 'tweetfeed'),
      wrap(
        withLastGood(mtiEnv, `briefing-nvd?s=${startMs}&e=${endMs}`, async () => {
          try {
            const r = await fetchNvdRecent(rangeStart, rangeEnd, opts.nvdApiKey);
            if (r.length > 0) return r;
          } catch {
            /* noop */
          }
          return fetchCirclRecent(rangeStart, rangeEnd);
        }),
        [] as NvdCve[]
      ),
      mtiEnv
        ? fetchRansomwareRecent(mtiEnv)
            .then((r) => r?.body)
            .catch(() => ({
              generated_at: '',
              source: '',
              count: 0,
              groups: [],
              sectors: [],
              victims: [] as RansomwareVictim[],
            }))
        : Promise.resolve({
            generated_at: '',
            source: '',
            count: 0,
            groups: [],
            sectors: [],
            victims: [] as RansomwareVictim[],
          }),
      mtiEnv
        ? fetchMtiSource(mtiEnv, 'cve', { limit: 200 })
            .then((r) => (r.ok ? (r.items as MtiCveRecord[]) : []))
            .catch(() => [] as MtiCveRecord[])
        : Promise.resolve([] as MtiCveRecord[]),
      fetchCveFeedHighSeverity().catch(() => [] as CveFeedEntry[]),
    ]);
  let degraded = !kevR.ok && !nvdR.ok;
  const kev = kevR.v;
  const nvdRecent = nvdR.v;

  const kevWindow = kev.filter((k) => withinRange(k.dateAdded, startMs, endMs));
  const nvdMap = await fetchNvdByIds(
    kevWindow.map((k) => k.cveID),
    opts.nvdApiKey
  ).catch(() => new Map<string, NvdCve>());
  const kevFindings = kevWindow.map((k) => findingFromKev(k, nvdMap.get(k.cveID)));
  const kevIds = new Set(kevFindings.map((f) => f.id));
  const nvdFindings = nvdRecent
    .filter((c) => !kevIds.has(c.id))
    .map(findingFromNvd)
    .filter((f) => f.severity === 'critical' || f.severity === 'high');
  const existingCveIds = new Set([...kevFindings, ...nvdFindings].map((f) => f.id.toUpperCase()));
  const mtiCveFindings: BriefingFinding[] = [];
  for (const m of mtiCveItems) {
    const id = m.cve?.trim().toUpperCase();
    if (!id || existingCveIds.has(id)) continue;
    const pub = m.published?.trim();
    if (!pub || !withinRange(pub.replace(' ', 'T'), startMs, endMs)) continue;
    const score = m.score != null && m.score !== '' ? Number.parseFloat(String(m.score)) : NaN;
    const sevText = String(m.severity ?? '').toLowerCase();
    const severity: Severity = Number.isFinite(score)
      ? severityFromCvss(score)
      : sevText === 'critical' || sevText === 'high' || sevText === 'medium' || sevText === 'low'
        ? (sevText as Severity)
        : 'unknown';
    if (severity !== 'critical' && severity !== 'high') continue;
    existingCveIds.add(id);
    const desc = m.description?.trim() || id;
    mtiCveFindings.push({
      id,
      title: desc.length > 90 ? `${id}: ${desc.slice(0, 87)}…` : `${id}: ${desc}`,
      description: desc,
      severity,
      ...(Number.isFinite(score) ? { cvss: score } : {}),
      source: 'MyThreatIntel',
      source_url: m.url || 'https://mythreatintel.com/',
      mitre_techniques: [],
    });
  }
  const cvefeedFindings: BriefingFinding[] = [];
  for (const e of cvefeedItems) {
    const id = e.cve_id.toUpperCase();
    if (existingCveIds.has(id)) continue;
    if (!withinRange(e.published, startMs, endMs)) continue;
    existingCveIds.add(id);
    const titleText = e.title?.trim() || id;
    cvefeedFindings.push({
      id,
      title: titleText.length > 90 ? `${id}: ${titleText.slice(0, 87)}…` : `${id}: ${titleText}`,
      description: `[cvefeed.io] ${titleText}`,
      severity: 'high',
      source: 'cvefeed.io',
      source_url: e.link,
      mitre_techniques: deriveMitreTechniques(titleText),
    });
  }
  let findings = [...kevFindings, ...nvdFindings, ...mtiCveFindings, ...cvefeedFindings];

  const matchTimestamp = (e: IocEntry) =>
    e.timestamp ? withinRange(e.timestamp.replace(' ', 'T'), startMs, endMs) : false;
  const iocPerSource: Record<string, number> = {};
  const urlhausMatched = urlhaus.filter(matchTimestamp);
  const malwarebazaarMatched = malwarebazaar.filter(matchTimestamp);
  const threatfoxMatched = threatfox.filter(matchTimestamp);
  const tweetfeedMatched = tweetfeed.filter(matchTimestamp);
  if (urlhausMatched.length > 0) iocPerSource['URLhaus'] = urlhausMatched.length;
  if (malwarebazaarMatched.length > 0) iocPerSource['MalwareBazaar'] = malwarebazaarMatched.length;
  if (threatfoxMatched.length > 0) iocPerSource['ThreatFox'] = threatfoxMatched.length;
  if (tweetfeedMatched.length > 0) iocPerSource['TweetFeed'] = tweetfeedMatched.length;

  const seenIoc = new Set<string>();
  const allIocs = [...urlhausMatched, ...malwarebazaarMatched, ...threatfoxMatched, ...tweetfeedMatched].filter((e) => {
    const k = `${e.type}|${e.value.trim().toLowerCase()}`;
    if (seenIoc.has(k)) return false;
    seenIoc.add(k);
    return true;
  });

  let iocsRawTotal = allIocs.length;
  let iocs = bucketIocs(allIocs);

  console.log(
    JSON.stringify({
      job: 'briefing-build-sources',
      slug,
      live: !!opts.live,
      window: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
      findings: {
        kev: kevFindings.length,
        nvd: nvdFindings.length,
        mti: mtiCveFindings.length,
        cvefeed: cvefeedFindings.length,
      },
      feeds: {
        urlhaus: { fetched: urlhaus.length, inWindow: urlhausMatched.length },
        malwarebazaar: { fetched: malwarebazaar.length, inWindow: malwarebazaarMatched.length },
        threatfox: { fetched: threatfox.length, inWindow: threatfoxMatched.length },
        tweetfeed: { fetched: tweetfeed.length, inWindow: tweetfeedMatched.length },
      },
      iocsRawTotal,
    })
  );

  const iocSources: string[] = [];
  if (urlhausMatched.length > 0) iocSources.push('URLhaus');
  if (malwarebazaarMatched.length > 0) iocSources.push('MalwareBazaar');
  if (threatfoxMatched.length > 0) iocSources.push('ThreatFox');
  if (tweetfeedMatched.length > 0) iocSources.push('TweetFeed');

  const ransomwareVictims = ransomwareBundle.victims;
  const ransomwareGroups = ransomwareBundle.groups;
  const ransomwareSectors = ransomwareBundle.sectors;
  let ransomwareFindings: BriefingFinding[] = [];
  const seenRwVictim = new Set<string>();
  for (const v of ransomwareVictims) {
    const discovered = v.discovered;
    if (!discovered) continue;
    if (!withinRange(discovered, startMs, endMs)) continue;
    const victim = v.victim?.trim();
    if (!victim) continue;
    const group = normalizeGroup(v.group);
    if (!group || group === 'unknown') continue;
    const day = discovered.slice(0, 10);
    const dedupeKey = `${group}|${victim.toLowerCase()}|${day}`;
    if (seenRwVictim.has(dedupeKey)) continue;
    seenRwVictim.add(dedupeKey);
    const desc = v.description?.trim();
    const location = v.country ? ` (${v.country})` : '';
    ransomwareFindings.push({
      id: `rw-${group.replace(/[^a-z0-9]+/g, '-')}-${victim
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40)}-${day}`,
      title: `${victim} — claimed by ${group}${location}`,
      description: desc && desc.length > 280 ? `${desc.slice(0, 277)}…` : desc || `${victim} listed by ${group}.`,
      severity: 'high',
      source: 'ransomware.live',
      source_url: v.source_url || 'https://www.ransomware.live/',
      mitre_techniques: [],
    });
  }
  ransomwareFindings.sort((a, b) => {
    const dayA = a.id.slice(-10);
    const dayB = b.id.slice(-10);
    if (dayA === dayB) return a.title.localeCompare(b.title);
    return dayA < dayB ? 1 : -1;
  });

  if (type === 'weekly' && opts.env?.BRIEFINGS_DB) {
    const rollup = await aggregateWeeklyFromDailies(
      opts.env.BRIEFINGS_DB,
      isoDate(rangeStart),
      isoDate(new Date(rangeEnd.getTime() - 86400_000))
    );
    if (rollup.dailyCount > 0) {
      const merged = mergeWeeklyWithDailies(
        { findings, ransomwareFindings, iocsRawTotal, iocBuckets: iocs, sources: iocSources },
        rollup
      );
      findings = merged.findings;
      ransomwareFindings = merged.ransomwareFindings;
      iocsRawTotal = merged.iocsRawTotal;
      iocs = merged.iocBuckets;
      for (const s of rollup.sources) {
        if (IOC_FEED_SOURCES.has(s) && !iocSources.includes(s)) iocSources.push(s);
      }
      if (findings.length > 0) degraded = false;
    }
  }

  const sections = buildSections(findings);
  if (ransomwareFindings.length > 0) {
    const topGroups = ransomwareGroups
      .slice(0, 3)
      .map((g) => `${g.group} (${g.count})`)
      .join(', ');
    const topSectors = ransomwareSectors
      .filter((s) => s.sector && s.sector !== 'Unknown' && s.count > 0)
      .slice(0, 3)
      .map((s) => `${s.sector} ${s.pct}%`)
      .join(', ');
    const blurbParts = [
      'Victim claims observed across ransomware.live, Ransomlook, cti.fyi, ransomfeed, ransomwatch, andreafortuna, and MyThreatIntel CTI feeds within this window.',
    ];
    if (topGroups) blurbParts.push(`Most active groups: ${topGroups}.`);
    if (topSectors) blurbParts.push(`Top sectors: ${topSectors}.`);
    sections.push({
      id: 'ransomware-activity',
      title: 'Ransomware activity (ransomware.live + peers)',
      count: ransomwareFindings.length,
      blurb: blurbParts.join(' '),
      findings: ransomwareFindings,
    });
  }

  const stats = buildStats(findings, sections, iocsRawTotal, ransomwareFindings.length);
  const summaryArgs = {
    type,
    range_label: rangeLabel,
    findings,
    iocs,
    iocsRawTotal,
    iocSources,
    iocPerSource,
    ransomwareGroups,
    ransomwareSectors,
    ransomwareTotal: ransomwareFindings.length,
  };
  const executive_summary = degraded
    ? `This ${type} briefing is incomplete: both CISA KEV and NVD were unreachable from the edge at build time (${rangeLabel}). This is an upstream-availability gap, NOT an all-clear — do not read the absence of findings as "no new vulnerabilities". The briefing rebuilds automatically every hour and will be replaced as soon as the feeds respond.`
    : await buildLlmExecutiveSummary(summaryArgs, opts.env);

  const techniqueSet = new Set<string>();
  for (const f of findings) for (const t of f.mitre_techniques) techniqueSet.add(t);

  const sources: string[] = [];
  if (findings.some((f) => f.source === 'CISA KEV')) sources.push('CISA KEV');
  if (findings.some((f) => f.source === 'NVD')) sources.push('NVD');
  if (findings.some((f) => f.source === 'cvefeed.io')) sources.push('cvefeed.io');
  if (findings.some((f) => f.source === 'MyThreatIntel')) sources.push('MyThreatIntel');
  if (ransomwareFindings.length > 0) sources.push('ransomware.live');
  sources.push(...iocSources);

  const ioc_dump = buildIocDump(iocs, iocsRawTotal);

  return {
    slug,
    type,
    title,
    date: dateLabel,
    date_range: rangeLabel,
    range_start: isoDate(rangeStart),
    range_end: opts.live ? isoDate(rangeEnd) : isoDate(new Date(rangeEnd.getTime() - 86400_000)),
    generated_at: new Date().toISOString(),
    executive_summary,
    stats,
    sections,
    iocs,
    ...(ioc_dump ? { ioc_dump } : {}),
    mitre_techniques: Array.from(techniqueSet).sort(),
    sources,
    ...(degraded ? { degraded: true } : {}),
  };
}

export async function writeBriefing(
  db: D1Database,
  briefing: Briefing,
  options?: { skipIfExists?: boolean }
): Promise<{ written: boolean; reason?: string }> {
  if (options?.skipIfExists) {
    const existing = await db.prepare('SELECT 1 FROM briefings WHERE slug = ?').bind(briefing.slug).first();
    if (existing) return { written: false, reason: 'already_exists' };
  }

  const bodyJson = JSON.stringify(briefing);
  if (bodyJson.length < 100) {
    return { written: false, reason: 'empty_body_refused' };
  }

  const isEmpty = briefing.stats.findings === 0 && briefing.stats.iocs === 0;
  if (isEmpty) {
    const prior = await db
      .prepare('SELECT stats_json, body FROM briefings WHERE slug = ?')
      .bind(briefing.slug)
      .first<{ stats_json?: string; body?: string }>();
    if (prior) {
      const priorBodyKnown = prior.body !== undefined && prior.body !== null;
      if (priorBodyKnown && prior.body!.trim().length < 100) {
        await db.prepare('DELETE FROM briefings WHERE slug = ?').bind(briefing.slug).run();
      } else {
        const ps = safeJsonParse<Partial<BriefingStats>>(prior.stats_json, {});
        if ((ps.findings ?? 0) > 0 || (ps.iocs ?? 0) > 0) {
          return { written: false, reason: 'kept_richer_existing' };
        }
      }
    }
  }

  await db
    .prepare(
      `INSERT OR REPLACE INTO briefings (slug, type, title, date, date_range, range_start, range_end, stats_json, sources_json, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      briefing.slug,
      briefing.type,
      briefing.title,
      briefing.date,
      briefing.date_range,
      briefing.range_start,
      briefing.range_end,
      JSON.stringify(briefing.stats),
      JSON.stringify(briefing.sources),
      JSON.stringify(briefing)
    )
    .run();

  try {
    await db
      .prepare(`DELETE FROM intel_bundles WHERE source_id = 'briefings' AND item_ref = ?`)
      .bind(briefing.slug)
      .run();
  } catch {
    /* noop */
  }
  return { written: true };
}

export async function sweepOldBriefings(
  db: D1Database,
  maxAgeDays = BRIEFING_MAX_AGE_DAYS,
  now: Date = new Date()
): Promise<{ deleted: string[]; kept: number }> {
  const cutoff = new Date(now.getTime() - maxAgeDays * 86400_000).toISOString().slice(0, 10);
  const toDelete = await db.prepare('SELECT slug FROM briefings WHERE date < ?').bind(cutoff).all<{ slug: string }>();
  const deleted = (toDelete.results ?? []).map((r) => r.slug);
  if (deleted.length > 0) {
    await db.prepare('DELETE FROM briefings WHERE date < ?').bind(cutoff).run();
  }
  const remaining = await db.prepare('SELECT COUNT(*) as count FROM briefings').first<{ count: number }>();
  return { deleted, kept: (remaining as { count: number } | null)?.count ?? 0 };
}

export async function listBriefings(
  db: D1Database,
  filter?: { type?: 'daily' | 'weekly' | 'landscape'; q?: string; limit?: number; offset?: number }
): Promise<{ items: Array<{ slug: string; metadata: Record<string, unknown> }>; total: number }> {
  const limit = filter?.limit ?? 50;
  const offset = filter?.offset ?? 0;

  const where: string[] = [];
  const whereParams: unknown[] = [];
  if (filter?.type) {
    where.push('type = ?');
    whereParams.push(filter.type);
  }
  const q = filter?.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push("(title LIKE ? ESCAPE '\\' OR date_range LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')");
    whereParams.push(like, like, like);
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  const countRow = await db
    .prepare(`SELECT COUNT(*) as cnt FROM briefings${whereSql}`)
    .bind(...whereParams)
    .first<{ cnt: number }>();
  const total = countRow?.cnt ?? 0;

  const result = await db
    .prepare(
      `SELECT slug, type, title, date, date_range, range_end, stats_json, sources_json FROM briefings${whereSql} ORDER BY range_end DESC, date DESC LIMIT ? OFFSET ?`
    )
    .bind(...whereParams, limit, offset)
    .all<{
      slug: string;
      type: string;
      title: string;
      date: string;
      date_range: string;
      range_end: string;
      stats_json: string;
      sources_json: string;
    }>();
  return {
    items: (result.results ?? []).map((row) => ({
      slug: row.slug,
      metadata: {
        type: row.type,
        title: row.title,
        date: row.date,
        range_end: row.range_end,
        date_range: row.date_range,
        stats: safeJsonParse(row.stats_json, {}),
        sources: safeJsonParse(row.sources_json, []),
      },
    })),
    total,
  };
}

export async function readBriefing(db: D1Database, slug: string): Promise<Briefing | null> {
  const row = await db
    .prepare('SELECT body FROM briefings WHERE LOWER(slug) = LOWER(?)')
    .bind(slug)
    .first<{ body: string }>();
  if (!row) return null;
  return safeJsonParse((row as { body: string }).body, null);
}
