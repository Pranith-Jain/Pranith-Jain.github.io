export type DbBriefType = 'cyber' | 'deepfake' | 'disaster';

interface DbIndexEntry {
  type: DbBriefType;
  date: string;
  sizeBytes: number;
}

interface DbIndex {
  source: string;
  license: string;
  generatedAt: string;
  counts: { cyber: number; deepfake: number; disaster: number };
  briefs: DbIndexEntry[];
}

const BRIEF_TYPES: DbBriefType[] = ['cyber', 'deepfake', 'disaster'];
const BASE_URL = 'https://agentic-ai-daily-reports.netlify.app';

const KV_PREFIX_INDEX = 'db:index';
const KV_PREFIX_BODY = 'db:body';
/** 30 days — daily briefs are useful for a month, then the static
 *  manifest in public/data/daily-briefs/ has the historical copy. */
const BODY_TTL_S = 30 * 24 * 3600;
/** 7 days — the index is rewritten every sync; TTL prevents
 *  orphaned keys if the sync stops running. */
const INDEX_TTL_S = 7 * 24 * 3600;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBetween(html: string, startPattern: string | RegExp, endPattern?: string | RegExp): string {
  let startIdx: number;
  if (startPattern instanceof RegExp) {
    const m = html.match(startPattern);
    if (!m || m.index === undefined) return '';
    startIdx = m.index + m[0].length;
  } else {
    startIdx = html.indexOf(startPattern);
    if (startIdx === -1) return '';
    startIdx += startPattern.length;
  }
  const rest = html.slice(startIdx);
  if (!endPattern) return rest;
  let endIdx: number;
  if (endPattern instanceof RegExp) {
    const m = rest.match(endPattern);
    if (!m || m.index === undefined) return rest;
    endIdx = m.index;
  } else {
    endIdx = rest.indexOf(endPattern);
    if (endIdx === -1) return rest;
  }
  return rest.slice(0, endIdx);
}

function extractSection(html: string, heading: string): string {
  const firstWord = (heading.split(' ')[0] ?? heading) || '';
  const patterns = [
    new RegExp(`<h2[^>]*>\\s*${escapeRegex(heading)}\\s*</h2>([\\s\\S]*?)(?=<h2[^>]*>|<section|<footer|$)`, 'i'),
    new RegExp(`<h2[^>]*>[^<]*${escapeRegex(firstWord)}[^<]*</h2>([\\s\\S]*?)(?=<h2[^>]*>|<section|<footer|$)`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1]!;
  }
  return '';
}

function extractChips(html: string): string[] {
  const chips: string[] = [];
  const re = /<span class="chip"[^>]*>([\s\S]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    chips.push(stripTags(m[1]!).trim());
  }
  return chips;
}

function extractCards(
  html: string
): { title: string; text: string; chips: string[]; links: { url: string; label: string }[] }[] {
  const cards: { title: string; text: string; chips: string[]; links: { url: string; label: string }[] }[] = [];
  const re = /<div class="card">([\s\S]*?)<\/div>\s*(?=<div class="card"|<\/section|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = m[1]!;
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = h3 ? stripTags(h3[1]!).trim() : '';
    const bodyHtml = h3 ? inner.slice(inner.indexOf(h3[0]!) + h3[0]!.length) : inner;
    const text = stripTags(bodyHtml).trim();
    const chips = extractChips(inner);
    const links = extractLinks(inner);
    cards.push({ title, text, chips, links });
  }
  return cards;
}

function extractLinks(html: string): { url: string; label: string }[] {
  const links: { url: string; label: string }[] = [];
  const re = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    links.push({ url: m[1]!, label: stripTags(m[2]!).trim() });
  }
  return links;
}

function extractEvents(
  html: string
): { title: string; severity: string; text: string; chips: string[]; sources: { url: string; label: string }[] }[] {
  const events: {
    title: string;
    severity: string;
    text: string;
    chips: string[];
    sources: { url: string; label: string }[];
  }[] = [];
  const re = /<div class="event"[^>]*>/gi;
  const positions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) positions.push(m.index);

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : html.indexOf('</section>', start);
    const chunk = end === -1 ? html.slice(start) : html.slice(start, end);

    const headMatch = chunk.match(/<div class="head">([\s\S]*?)<\/div>\s*<div class="sev\s+(\w+)"/i);
    const bodyStart = chunk.indexOf('<div class="body">');
    if (!headMatch || bodyStart === -1) continue;
    const bodyChunk = chunk.slice(bodyStart);
    const strong = headMatch[1]!.match(/<strong>([\s\S]*?)<\/strong>/i);
    const title = strong ? stripTags(strong[1]!).trim() : stripTags(headMatch[1]!).trim();
    const severity = headMatch[2]!.toLowerCase();
    const text = stripTags(bodyChunk).trim();
    const chips = extractChips(bodyChunk);
    const sources = extractLinks(bodyChunk);
    events.push({ title, severity, text, chips, sources });
  }
  return events;
}

function extractListItems(html: string): string[] {
  const items: string[] = [];
  const re = /<li>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    items.push(stripTags(m[1]!).trim());
  }
  return items;
}

function extractDate(html: string): string {
  const m = html.match(/<div class="date"[^>]*>([\s\S]*?)<\/div>/i);
  if (m) return stripTags(m[1]!).trim();
  const m2 = html.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i
  );
  return m2 ? m2[0]! : '';
}

function extractThreatLevel(html: string): string {
  const m = html.match(/<span class="pill[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  if (m) return stripTags(m[1]!).trim();
  return '';
}

function extractBalancedDiv(html: string, startIdx: number): string {
  let depth = 0;
  let i = startIdx;
  while (i < html.length) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) return html.slice(startIdx);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 4;
    } else {
      if (depth === 0) return html.slice(startIdx, nextClose);
      depth--;
      i = nextClose + 6;
    }
  }
  return html.slice(startIdx);
}

function extractKpis(html: string): { value: string; label: string }[] {
  const kpis: { value: string; label: string }[] = [];
  const re = /<div class="card kpi">/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const numMatch = inner.match(/<div class="n"[^>]*>([\s\S]*?)<\/div>/i);
    const labelMatch = inner.match(/<div class="l"[^>]*>([\s\S]*?)<\/div>/i);
    kpis.push({
      value: numMatch ? stripTags(numMatch[1]!).trim() : '',
      label: labelMatch ? stripTags(labelMatch[1]!).trim() : '',
    });
  }
  return kpis;
}

function dateFromContent(html: string): string {
  const dateStr = extractDate(html);
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function parseCyberBrief(html: string, date: string) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  const keyFindingsCards = extractCards(extractSection(html, 'Key Findings'));
  const keyFindings = keyFindingsCards.map((c) => ({ title: c.title, summary: c.text }));

  const kpis = extractKpis(html);

  const dashboardSection = extractSection(html, 'Threat Dashboard');
  if (!dashboardSection) {
    return {
      type: 'cyber' as const,
      date,
      threatLevel: extractThreatLevel(html),
      executiveSummary: executiveSummary || stripTags(html).slice(0, 2048),
      keyFindings:
        keyFindings.length > 0 ? keyFindings : [{ title: 'Summary', summary: stripTags(html).slice(0, 4096) }],
      dashboard: {
        kpis: kpis.length > 0 ? kpis : [{ value: 'N/A', label: 'No KPI data' }],
        activelyExploited: [],
        vendors: [],
        sectors: [],
      },
      topThreats: [],
      threatActors: [],
      cveWatch: [],
      events: [],
      ttps: { descriptions: [], mitreIds: [] },
      outlook72h: '',
      relatedCves: [],
      rawMarkdown: stripTags(html).slice(0, 16384),
    };
  }
  const dashboardCards = extractCards(dashboardSection);
  const dashboardMap: Record<string, string[]> = {};
  for (const dc of dashboardCards) {
    if (dc.title) dashboardMap[dc.title.toLowerCase()] = dc.chips;
  }
  const activelyExploited = dashboardMap['actively exploited'] ?? extractChips(dashboardSection);
  const vendorsFromDash = dashboardMap['ot vendors impacted'] ?? [];
  const sectorsFromDash = dashboardMap['primary sectors at risk'] ?? [];
  const vendorsSection = extractSection(html, 'Affected Vendors');
  const vendors = [...new Set([...vendorsFromDash, ...extractChips(vendorsSection)])];
  const sectorsSection = extractSection(html, 'Affected Sectors');
  const sectors = [...new Set([...sectorsFromDash, ...extractChips(sectorsSection)])];

  const topThreatsCards = extractCards(extractSection(html, 'Top Five Priority Threats'));
  const topThreats = topThreatsCards.map((c) => ({ title: c.title, action: c.text }));

  const threatActorsSection = extractSection(html, 'Threat Actor Activity');
  const threatActors = extractCards(threatActorsSection).map((c) => ({
    category: c.title,
    items: extractListItems(
      c.text.includes('<ul>') ? threatActorsSection.slice(threatActorsSection.indexOf(c.title)) : ''
    ),
  }));

  const cveWatchSection = extractSection(html, 'Vulnerability and CVE Watch');
  const cveWatch = extractCards(cveWatchSection).map((c) => ({
    category: c.title,
    items: extractListItems(c.text.includes('<ul>') ? cveWatchSection.slice(cveWatchSection.indexOf(c.title)) : ''),
  }));

  const eventCards = extractEvents(html);

  const ttpSection = extractSection(html, 'TTPs and ATT');
  const ttpsText = extractListItems(ttpSection);
  const mitreIds = [...new Set(ttpsText.join(' ').match(/T\d{4}(?:\.\d{3})?/g) || [])];

  const outlookSection = extractSection(html, 'Next 72');
  const outlook = stripTags(outlookSection).trim();

  const allCves = [
    ...new Set(
      (html.match(/CVE[\-\u2011]\d{4}[\-\u2011]\d{4,}/gi) || []).map((c) => c.toUpperCase().replace(/[\u2011]/g, '-'))
    ),
  ];

  return {
    type: 'cyber' as const,
    date,
    threatLevel: extractThreatLevel(html),
    executiveSummary,
    keyFindings,
    dashboard: { kpis, activelyExploited, vendors, sectors },
    topThreats,
    threatActors,
    cveWatch,
    events: eventCards,
    ttps: { descriptions: ttpsText, mitreIds },
    outlook72h: outlook,
    relatedCves: allCves,
    rawMarkdown: stripTags(html).slice(0, 16384),
  };
}

function parseDeepfakeBrief(html: string, date: string) {
  const executiveSummary =
    stripTags(extractSection(html, 'Executive Overview')).trim() ||
    stripTags(extractSection(html, 'Executive Summary')).trim();

  const riskOutlookMatch = html.match(/Overall Outlook:\s*([\w]+)/i) || html.match(/Assessment:\s*([\w]+)/i);
  const riskOutlook = riskOutlookMatch ? riskOutlookMatch[1] : '';

  const keyFindingsSection = extractSection(html, 'Key Findings');
  const keyFindingsCards = extractCards(keyFindingsSection);
  let keyFindings: { title: string; summary: string }[] = keyFindingsCards.map((c) => ({
    title: c.title,
    summary: c.text,
  }));
  if (keyFindings.length === 0) {
    const items = extractListItems(keyFindingsSection);
    keyFindings = items.map((item) => {
      const colonIdx = item.indexOf(':');
      if (colonIdx > 0 && colonIdx < 80) {
        return { title: item.slice(0, colonIdx).trim(), summary: item.slice(colonIdx + 1).trim() };
      }
      return { title: item.slice(0, 80), summary: item };
    });
  }

  const incidentsSection = extractSection(html, 'Priority Incidents');
  const incidents: {
    title: string;
    badges: string[];
    fields: Record<string, string>;
    summary: string;
    sources: { url: string; label: string }[];
  }[] = [];
  if (incidentsSection) {
    const cardRe = /<div class="card">\s*<h3>([\s\S]*?)<\/h3>\s*<div class="meta">([\s\S]*?)<\/div>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cardRe.exec(incidentsSection)) !== null) {
      const title = stripTags(cm[1]!).trim();
      const metaHtml = cm[2]!;
      const badges: string[] = [];
      const badgeRe = /<span class="badge\s+(\w+)">([^<]+)<\/span>/gi;
      let bm: RegExpExecArray | null;
      while ((bm = badgeRe.exec(metaHtml)) !== null) badges.push(bm[2]!.trim());
      const afterMeta = incidentsSection.slice(cm.index + cm[0]!.length);
      const fieldsStart = afterMeta.indexOf('<div class="fields">');
      const fields: Record<string, string> = {};
      if (fieldsStart !== -1) {
        const fieldsContent = extractBalancedDiv(afterMeta, fieldsStart);
        const fieldRe = /<div class="field"><label>([^<]+)<\/label><div>([\s\S]*?)<\/div><\/div>/gi;
        let fm: RegExpExecArray | null;
        while ((fm = fieldRe.exec(fieldsContent)) !== null) fields[fm[1]!.trim()] = stripTags(fm[2]!).trim();
      }
      const nextCardIdx = incidentsSection.indexOf('<div class="card">', cm.index + cm[0]!.length);
      const cardEnd = nextCardIdx !== -1 ? nextCardIdx : incidentsSection.length;
      const afterFields = incidentsSection.slice(cm.index + cm[0]!.length, cardEnd);
      const pMatch = afterFields.match(/<p>([\s\S]*?)<\/p>/i);
      const summary = pMatch ? stripTags(pMatch[1]!).trim() : '';
      const sources = extractLinks(afterFields);
      incidents.push({ title, badges, fields, summary, sources });
    }
  }

  const trendsSection = extractSection(html, 'Emerging Trends');
  const emergingTrends = extractListItems(trendsSection);

  const geoSection = extractSection(html, 'Geographic Observations');
  const geographicObservations = extractListItems(geoSection);

  const detectionSection = extractSection(html, 'Detection and Defensive');
  const detectionDevelopments = extractListItems(detectionSection);

  return {
    type: 'deepfake' as const,
    date,
    riskOutlook: riskOutlook || 'Unknown',
    executiveSummary: executiveSummary || stripTags(html).slice(0, 2048),
    keyFindings: keyFindings.length > 0 ? keyFindings : [{ title: 'Summary', summary: stripTags(html).slice(0, 4096) }],
    incidents,
    emergingTrends: emergingTrends.length > 0 ? emergingTrends : [],
    geographicObservations: geographicObservations.length > 0 ? geographicObservations : [],
    detectionDevelopments: detectionDevelopments.length > 0 ? detectionDevelopments : [],
    rawMarkdown: stripTags(html).slice(0, 16384),
  };
}

function parseDisasterBrief(html: string, date: string) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  const threatMatch = html.match(/<span class="level">([^<]+)<\/span>/i);
  const overallThreat = threatMatch ? threatMatch[1]!.trim() : '';

  const kpis = extractKpis(html);

  const events: { title: string; severity: string; text: string; sources: { url: string; label: string }[] }[] = [];
  const eventRe = /<div class="event\s+(escalate|monitor|ignore)"[^>]*>/gi;
  const positions: { idx: number; severity: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = eventRe.exec(html)) !== null) positions.push({ idx: m.index, severity: m[1]!.toLowerCase() });
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]!;
    const start = pos.idx;
    const end = i + 1 < positions.length ? positions[i + 1]!.idx : html.indexOf('</section>', start);
    const chunk = end === -1 ? html.slice(start) : html.slice(start, end);
    const titleMatch = chunk.match(/<div class="title">([\s\S]*?)<\/div>/i);
    const title = titleMatch ? stripTags(titleMatch[1]!).trim() : '';
    const descMatch = chunk.match(/<div class="muted">([\s\S]*?)<\/div>/i);
    const text = descMatch ? stripTags(descMatch[1]!).trim() : '';
    const sources = extractLinks(chunk);
    events.push({ title, severity: pos.severity, text, sources });
  }

  const topEvents = events.filter((e) => e.severity === 'escalate').slice(0, 5);
  const escalateEvents = events.filter((e) => e.severity === 'escalate');
  const monitorEvents = events.filter((e) => e.severity === 'monitor');

  const outlookSection = extractSection(html, 'Next 72');
  const outlook = stripTags(outlookSection).trim();

  const regionsSection = extractSection(html, 'Regional and Hazard');
  const regionalTrends = extractListItems(regionsSection);

  return {
    type: 'disaster' as const,
    date,
    overallThreat: overallThreat || 'Unknown',
    executiveSummary: executiveSummary || stripTags(html).slice(0, 2048),
    dashboard: { kpis: kpis.length > 0 ? kpis : [{ value: 'N/A', label: 'No KPI data' }] },
    topEvents,
    escalateEvents,
    monitorEvents,
    outlook72h: outlook,
    regionalTrends,
    rawMarkdown: stripTags(html).slice(0, 16384),
  };
}

interface SyncEnv {
  KV_CACHE?: any;
}

export async function syncDailyBriefs(env: SyncEnv): Promise<{ types: string[]; errors: string[] }> {
  const types: string[] = [];
  const errors: string[] = [];

  if (!env.KV_CACHE) {
    return { types: [], errors: ['KV_CACHE not bound'] };
  }

  const parsers: Record<DbBriefType, (html: string, date: string) => any> = {
    cyber: parseCyberBrief,
    deepfake: parseDeepfakeBrief,
    disaster: parseDisasterBrief,
  };

  const counted: Record<string, number> = {};
  const mergedBriefs = new Map<string, { type: DbBriefType; date: string; sizeBytes: number }>();

  // Load existing index from KV to merge with new data
  try {
    const existingIndex: DbIndex | null = await env.KV_CACHE.get(KV_PREFIX_INDEX, 'json');
    if (existingIndex?.briefs) {
      for (const b of existingIndex.briefs) {
        mergedBriefs.set(`${b.type}:${b.date}`, b);
      }
    }
  } catch {
    // No existing data — start fresh
  }

  for (const type of BRIEF_TYPES) {
    try {
      const url = `${BASE_URL}/${type}`;
      const res = await fetch(url, {
        headers: { 'user-agent': 'pranithjain-daily-briefs-sync/1.0 (Worker; +https://pranithjain.qzz.io)' },
      });
      if (!res.ok) {
        errors.push(`${type}: fetch failed (${res.status})`);
        continue;
      }
      const html = await res.text();
      const date = dateFromContent(html);
      const parsed = parsers[type](html, date);
      const bodyStr = JSON.stringify(parsed);
      const sizeBytes = bodyStr.length;

      const existing = mergedBriefs.get(`${type}:${date}`);
      if (existing && existing.sizeBytes === sizeBytes) {
        counted[type] = (counted[type] || 0) + 1;
        types.push(type);
        continue;
      }

      // Write body to KV (with TTL — static manifest is the long-term archive)
      await env.KV_CACHE.put(`${KV_PREFIX_BODY}:${type}:${date}`, bodyStr, { expirationTtl: BODY_TTL_S });
      mergedBriefs.set(`${type}:${date}`, { type: type as DbBriefType, date, sizeBytes });
      counted[type] = (counted[type] || 0) + 1;
      types.push(type);
    } catch (err) {
      errors.push(`${type}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Write merged index
  const allBriefs = [...mergedBriefs.values()].sort((a, b) => b.date.localeCompare(a.date));
  const index: DbIndex = {
    source: 'agentic-ai-daily-reports.netlify.app',
    license: 'MIT',
    generatedAt: new Date().toISOString().slice(0, 10),
    counts: { cyber: counted['cyber'] || 0, deepfake: counted['deepfake'] || 0, disaster: counted['disaster'] || 0 },
    briefs: allBriefs,
  };
  await env.KV_CACHE.put(KV_PREFIX_INDEX, JSON.stringify(index), { expirationTtl: INDEX_TTL_S });

  return { types, errors };
}
