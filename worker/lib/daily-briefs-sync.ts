export type DbBriefType = 'cyber' | 'deepfake' | 'disaster' | 'maritime';

interface DbIndexEntry {
  type: DbBriefType;
  date: string;
  sizeBytes: number;
}

interface DbIndex {
  source: string;
  license: string;
  generatedAt: string;
  counts: { cyber: number; deepfake: number; disaster: number; maritime: number };
  briefs: DbIndexEntry[];
}

const BRIEF_TYPES: DbBriefType[] = ['cyber', 'deepfake', 'disaster', 'maritime'];
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
    .replace(/\u2011/g, '-') // non-breaking hyphen → ASCII (CVE IDs etc.)
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the body of a named section. Matches four heading variants used
 * across the reference site's brief types:
 *   1. <h2>Title</h2>                       (deepfake)
 *   2. <h2 class="sec">Title</h2>           (disaster)
 *   3. <h2>N. Title</h2>                    (maritime — numbered)
 *   4. <div class="section-title">Title</div>  (cyber)
 */
function extractSection(html: string, heading: string): string {
  const esc = escapeRegex(heading);
  const variants: RegExp[] = [
    // <div class="section-title">Title</div> ... <div class="section-body">BODY</div>
    // (cyber: a <span class="pill"> may sit between section-title and
    // section-body, so we match up to the next section-body open.)
    new RegExp(
      `<div class="section-title"[^>]*>\\s*${esc}[\\s\\S]*?</div>[\\s\\S]*?<div class="section-body"[^>]*>([\\s\\S]*?)(?=<section class="section"|<footer|<aside|$)`,
      'i'
    ),
    // <h2 class="sec">Title</h2>
    new RegExp(`<h2 class="sec"[^>]*>\\s*${esc}[\\s\\S]*?</h2>([\\s\\S]*?)(?=<h2 class="sec"|<footer|<aside|$)`, 'i'),
    // <h2>N. Title</h2>  (maritime numbered)
    new RegExp(`<h2[^>]*>\\s*\\d+\\.\\s*${esc}[\\s\\S]*?</h2>([\\s\\S]*?)(?=<h2[^>]*>|<footer|<aside|$)`, 'i'),
    // <h2>Title</h2>  (bare — deepfake; also a generic fallback)
    new RegExp(`<h2[^>]*>\\s*${esc}[\\s\\S]*?</h2>([\\s\\S]*?)(?=<h2[^>]*>|<section class="section"|<footer|<aside|$)`, 'i'),
  ];
  for (const re of variants) {
    const m = html.match(re);
    if (m && m[1] && m[1].trim()) return m[1]!;
  }
  // Fuzzy: match on the first word only.
  const firstWord = escapeRegex(heading.split(/\s+/)[0] ?? heading);
  const fuzzy: RegExp[] = [
    new RegExp(`<div class="section-title"[^>]*>[^<]*${firstWord}[\\s\\S]*?</div>[\\s\\S]*?<div class="section-body"[^>]*>([\\s\\S]*?)(?=<section class="section"|<footer|$)`, 'i'),
    new RegExp(`<h2[^>]*>[^<]*${firstWord}[\\s\\S]*?</h2>([\\s\\S]*?)(?=<h2[^>]*>|<footer|<aside|$)`, 'i'),
  ];
  for (const re of fuzzy) {
    const m = html.match(re);
    if (m && m[1] && m[1].trim()) return m[1]!;
  }
  return '';
}

function extractChips(html: string): string[] {
  const chips: string[] = [];
  const re = /<span class="chip"[^>]*>([\s\S]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = stripTags(m[1]!).trim();
    if (t) chips.push(t);
  }
  return chips;
}

function extractLinks(html: string): { url: string; label: string }[] {
  const links: { url: string; label: string }[] = [];
  const re = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const label = stripTags(m[2]!).trim();
    if (m[1] && !m[1].startsWith('#')) links.push({ url: m[1]!, label });
  }
  return links;
}

function extractListItems(html: string): string[] {
  const items: string[] = [];
  const re = /<li>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = stripTags(m[1]!).trim();
    if (t) items.push(t);
  }
  return items;
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function extractDate(html: string): string {
  const iso = html.match(/Report date[^0-9]*?(\d{4}-\d{2}-\d{2})/i);
  if (iso) return iso[1]!;
  const titleDate = html.match(/<title>[^<]*?-\s*([A-Za-z]+ \d{1,2},\s*\d{4})[^<]*<\/title>/i);
  if (titleDate) return titleDate[1]!;
  const m = html.match(/<div class="date"[^>]*>([\s\S]*?)<\/div>/i);
  if (m) return stripTags(m[1]!).trim();
  const m2 = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i);
  return m2 ? m2[0]! : '';
}

function dateFromContent(html: string): string {
  const dateStr = extractDate(html);
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const named = dateStr.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i
  );
  if (named) {
    const month = MONTHS[named[1]!.toLowerCase()];
    const day = Number(named[2]);
    const year = Number(named[3]);
    if (month !== undefined && day >= 1 && day <= 31)
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function extractBalancedDiv(html: string, startIdx: number): string {
  // startIdx points at a `<div ...>` opening tag. Start scanning AFTER it
  // with depth=1 (we're already inside the opening div) so the matching
  // close is the one that brings depth back to 0.
  let depth = 1;
  let i = startIdx + 4;
  while (i < html.length) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) return html.slice(startIdx);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) return html.slice(startIdx, nextClose + 6);
      i = nextClose + 6;
    }
  }
  return html.slice(startIdx);
}

/** cyber: <div class="kpi"><div class="label">L</div><div class="value">V</div><div class="trend">T</div></div> */
function extractKpisCyber(html: string): { value: string; label: string; trend?: string }[] {
  const kpis: { value: string; label: string; trend?: string }[] = [];
  const re = /<div class="kpi"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const label = inner.match(/<div class="label"[^>]*>([\s\S]*?)<\/div>/i);
    const value = inner.match(/<div class="value"[^>]*>([\s\S]*?)<\/div>/i);
    const trend = inner.match(/<div class="trend"[^>]*>([\s\S]*?)<\/div>/i);
    const l = label ? stripTags(label[1]!).trim() : '';
    const v = value ? stripTags(value[1]!).trim() : '';
    if (l || v) kpis.push({ value: v, label: l, ...(trend ? { trend: stripTags(trend[1]!).trim() } : {}) });
  }
  return kpis;
}

/** disaster: <div class="kpi escalate"><h4>L</h4><div class="val">V</div><div class="note">N</div></div> */
function extractKpisDisaster(html: string): { value: string; label: string }[] {
  const kpis: { value: string; label: string }[] = [];
  const re = /<div class="kpi[^"]*"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const label = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const val = inner.match(/<div class="val"[^>]*>([\s\S]*?)<\/div>/i);
    const l = label ? stripTags(label[1]!).trim() : '';
    const v = val ? stripTags(val[1]!).trim() : '';
    if (l || v) kpis.push({ value: v, label: l });
  }
  return kpis;
}

/** maritime: <div class="card"><div class="label">L</div><div class="metric">V</div></div> */
function extractKpisMaritime(html: string): { value: string; label: string }[] {
  const kpis: { value: string; label: string }[] = [];
  const dash = extractSection(html, 'Maritime Threat Dashboard') || '';
  const re = /<div class="card"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dash)) !== null) {
    const inner = extractBalancedDiv(dash, m.index);
    const label = inner.match(/<div class="label"[^>]*>([\s\S]*?)<\/div>/i);
    const metric = inner.match(/<div class="metric"[^>]*>([\s\S]*?)<\/div>/i);
    const l = label ? stripTags(label[1]!).trim() : '';
    let v = metric ? stripTags(metric[1]!).trim() : '';
    v = v.replace(/\s+Level\s*$/, '').trim();
    if (l || v) kpis.push({ value: v, label: l });
  }
  return kpis;
}

/** cyber: <div class="card"><h4>Title</h4><div class="note">…</div></div> (dashboard) */
function extractCardsCyberDash(html: string): { title: string; text: string; chips: string[] }[] {
  const cards: { title: string; text: string; chips: string[] }[] = [];
  const re = /<div class="card"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const h4 = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const note = inner.match(/<div class="note"[^>]*>([\s\S]*?)<\/div>/i);
    const title = h4 ? stripTags(h4[1]!).trim() : '';
    const text = note ? stripTags(note[1]!).trim() : '';
    if (title) cards.push({ title, text, chips: extractChips(inner) });
  }
  return cards;
}

/** cyber: <div class="card priority"><h4>Title</h4><div class="impact">…</div><a …></div> */
function extractCardsCyberPriority(html: string): { title: string; action: string; sources: { url: string; label: string }[] }[] {
  const cards: { title: string; action: string; sources: { url: string; label: string }[] }[] = [];
  const re = /<div class="card priority"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const h4 = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const impact = inner.match(/<div class="impact"[^>]*>([\s\S]*?)<\/div>/i);
    cards.push({
      title: h4 ? stripTags(h4[1]!).trim() : '',
      action: impact ? stripTags(impact[1]!).trim() : '',
      sources: extractLinks(inner),
    });
  }
  return cards;
}

/** cyber events: <div class="event escalate|monitor|ignore">…<h4>…<div class="desc">…</div> */
function extractEventsCyber(html: string): { title: string; severity: string; text: string; chips: string[]; sources: { url: string; label: string }[]; threat?: string }[] {
  const events: { title: string; severity: string; text: string; chips: string[]; sources: { url: string; label: string }[]; threat?: string }[] = [];
  const re = /<div class="event\s+(escalate|monitor|ignore)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const severity = m[1]!.toLowerCase();
    const inner = extractBalancedDiv(html, m.index);
    const tag = inner.match(/<div class="tag"[^>]*>([\s\S]*?)<\/div>/i);
    const h4 = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const meta = inner.match(/<div class="meta"[^>]*>([\s\S]*?)<\/div>/i);
    const desc = inner.match(/<div class="desc"[^>]*>([\s\S]*?)<\/div>/i);
    const links = inner.match(/<div class="links"[^>]*>([\s\S]*?)<\/div>/i);
    const title = h4 ? stripTags(h4[1]!).trim() : '';
    const text = desc ? stripTags(desc[1]!).trim() : '';
    const chips = meta ? extractChips(meta[1]!) : [];
    const sources = links ? extractLinks(links[1]!) : extractLinks(inner);
    const threat = tag ? stripTags(tag[1]!).trim() : '';
    events.push({ title, severity, text, chips, sources, ...(threat ? { threat } : {}) });
  }
  return events;
}

/** deepfake incidents: <div class="incident-card card">…<h3>…<div class="meta">chips</div>… */
function extractIncidentsDeepfake(html: string): { title: string; badges: string[]; fields: Record<string, string>; summary: string; sources: { url: string; label: string }[] }[] {
  const incidents: { title: string; badges: string[]; fields: Record<string, string>; summary: string; sources: { url: string; label: string }[] }[] = [];
  const re = /<div class="incident-card card"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = h3 ? stripTags(h3[1]!).trim() : '';
    const badges: string[] = [];
    const badgeRe = /<span class="badge[^"]*"[^>]*>([^<]+)<\/span>/gi;
    let bm: RegExpExecArray | null;
    while ((bm = badgeRe.exec(inner)) !== null) badges.push(stripTags(bm[1]!).trim());
    const fields: Record<string, string> = {};
    const metaInner = inner.match(/<div class="meta"[^>]*>([\s\S]*?)<\/div>/i);
    if (metaInner) {
      const spanRe = /<span class="chip"[^>]*>([^:]+):\s*([^<]+)<\/span>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = spanRe.exec(metaInner[1]!)) !== null) fields[stripTags(sm[1]!).trim()] = stripTags(sm[2]!).trim();
    }
    const summaryP = inner.match(/<p><strong>Incident Summary:[^<]*<\/strong>\s*([\s\S]*?)<\/p>/i);
    const summary = summaryP ? stripTags(summaryP[1]!).trim() : '';
    const sources = extractLinks(inner);
    incidents.push({ title, badges, fields, summary, sources });
  }
  return incidents;
}

/** disaster events: <div class="event-card indicator escalate|monitor">…<h4 class="event-title">… */
function extractEventsDisaster(html: string): { title: string; severity: string; text: string; chips: string[]; sources: { url: string; label: string }[] }[] {
  const events: { title: string; severity: string; text: string; chips: string[]; sources: { url: string; label: string }[] }[] = [];
  const re = /<div class="event-card indicator\s+(escalate|monitor|ignore)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const severity = m[1]!.toLowerCase();
    const inner = extractBalancedDiv(html, m.index);
    const titleM = inner.match(/<h4 class="event-title"[^>]*>([\s\S]*?)<\/h4>/i);
    const bodyM = inner.match(/<div class="event-body"[^>]*>([\s\S]*?)<\/div>/i);
    const title = titleM ? stripTags(titleM[1]!).trim() : '';
    const bodyHtml = bodyM ? bodyM[1]! : '';
    const text = stripTags(bodyHtml).trim();
    const chips: string[] = [];
    const tagRe = /<span class="tag"[^>]*>([\s\S]*?)<\/span>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(bodyHtml)) !== null) {
      const t = stripTags(tm[1]!).trim();
      if (t) chips.push(t);
    }
    const sources = extractLinks(bodyHtml);
    events.push({ title, severity, text, chips, sources });
  }
  return events;
}

/** maritime priority: <div class="priority"><h3><span class="num">N</span> • Title</h3>… */
function extractPriorityMaritime(html: string): { title: string; action: string; items: string[]; sources: { url: string; label: string }[] }[] {
  const cards: { title: string; action: string; items: string[]; sources: { url: string; label: string }[] }[] = [];
  const section = extractSection(html, 'Top Five Priority Threats') || '';
  const re = /<div class="priority"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) {
    const inner = extractBalancedDiv(section, m.index);
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = h3 ? stripTags(h3[1]!).trim() : '';
    const whyMatch = inner.match(/Why it matters:\s*([\s\S]*?)(?=<ul|<a)/i);
    const action = whyMatch ? stripTags(whyMatch[1]!).trim() : '';
    const ul = inner.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
    const items = ul ? extractListItems(ul[1]!) : [];
    const sources = extractLinks(inner);
    cards.push({ title, action, items, sources });
  }
  return cards;
}

/** maritime events: <div class="event-card"><h4>Title</h4><div class="event-meta">badges</div>… */
function extractEventsMaritime(html: string): { title: string; severity: string; text: string; chips: string[]; sources: { url: string; label: string }[]; items?: string[] }[] {
  const events: { title: string; severity: string; text: string; chips: string[]; sources: { url: string; label: string }[]; items?: string[] }[] = [];
  const section = extractSection(html, 'Intelligence Event Cards') || '';
  const re = /<div class="event-card"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) {
    const inner = extractBalancedDiv(section, m.index);
    const h4 = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const title = h4 ? stripTags(h4[1]!).trim() : '';
    const meta = inner.match(/<div class="event-meta"[^>]*>([\s\S]*?)<\/div>/i);
    const kicker = inner.match(/<div class="kicker"[^>]*>([\s\S]*?)<\/div>/i);
    const ul = inner.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
    let severity = 'monitor';
    if (meta) {
      const sevBadge = meta[1]!.match(/<span class="badge"[^>]*>\s*Threat:\s*(\w+)/i);
      if (sevBadge) {
        const t = sevBadge[1]!.toLowerCase();
        severity = t === 'critical' || t === 'high' ? 'escalate' : 'monitor';
      }
    }
    const text = (kicker ? stripTags(kicker[1]!).trim() : '') + (ul ? ' ' + stripTags(ul[1]!).trim() : '');
    const items = ul ? extractListItems(ul[1]!) : [];
    const sources = extractLinks(inner);
    events.push({ title, severity, text: text.trim(), chips: [], sources, ...(items.length ? { items } : {}) });
  }
  return events;
}

function parseCyberBrief(html: string, date: string) {
  const threatLevel = (() => {
    const pill = html.match(/<div class="level-pill"[^>]*>([\s\S]*?)<\/div>/i);
    return pill ? stripTags(pill[1]!).trim() : '';
  })();

  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  const kfSection = extractSection(html, 'Key Findings');
  const kfItems = extractListItems(kfSection);
  const keyFindings = kfItems.map((item) => {
    const colonIdx = item.indexOf(':');
    if (colonIdx > 0 && colonIdx < 80) return { title: item.slice(0, colonIdx).trim(), summary: item.slice(colonIdx + 1).trim() };
    return { title: item.slice(0, 80), summary: item };
  });

  const kpis = extractKpisCyber(html);

  const dashboardSection = extractSection(html, 'Threat Dashboard');
  const dashboardCards = extractCardsCyberDash(dashboardSection);
  const dashboardMap: Record<string, { title: string; text: string; chips: string[] }> = {};
  for (const dc of dashboardCards) dashboardMap[dc.title.toLowerCase()] = dc;

  const activelyExploited = (() => {
    const dashCard = dashboardMap['perimeter devices under active exploit'];
    if (dashCard?.text) return dashCard.text.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
    return extractChips(extractSection(html, 'Actively Exploited Focus'));
  })();

  const vendors = [...new Set(extractChips(extractSection(html, 'Affected Vendors')))];
  const sectors = [...new Set(extractChips(extractSection(html, 'Affected Sectors')))];

  const topThreats = extractCardsCyberPriority(extractSection(html, 'Top Five Priority Threats')).map((c) => ({
    title: c.title,
    action: c.action,
    sources: c.sources,
  }));

  const threatActorsSection = extractSection(html, 'Threat Actor Activity');
  const threatActorItems = extractListItems(threatActorsSection);
  const threatActors = threatActorItems.length > 0 ? [{ category: 'Activity', items: threatActorItems }] : [];

  const cveWatchSection = extractSection(html, 'New/Notable OT CVEs');
  const cveWatchItems = extractListItems(cveWatchSection);
  const cveWatch = cveWatchItems.length > 0 ? [{ category: 'New/Notable OT CVEs and Issues', items: cveWatchItems }] : [];

  const events = extractEventsCyber(html);

  const ttpSection = extractSection(html, 'TTPs and MITRE ATT') || extractSection(html, 'TTPs');
  const ttpItems = extractListItems(ttpSection);
  const mitreIds = [...new Set(ttpItems.join(' ').match(/T\d{4}(?:\.\d{3})?/g) || [])];

  const outlook = stripTags(extractSection(html, 'Next 72')).trim();

  const allCves = [...new Set(
    (html.match(/CVE[\-\u2011]\d{4}[\-\u2011]\d{4,}/gi) || []).map((c) => c.toUpperCase().replace(/[\u2011]/g, '-'))
  )];

  return {
    type: 'cyber' as const,
    date,
    threatLevel,
    executiveSummary,
    keyFindings,
    dashboard: { kpis, activelyExploited, vendors, sectors },
    topThreats,
    threatActors,
    cveWatch,
    events,
    ttps: { descriptions: ttpItems, mitreIds },
    outlook72h: outlook,
    relatedCves: allCves,
  };
}

function parseDeepfakeBrief(html: string, date: string) {
  const executiveSummary =
    stripTags(extractSection(html, 'Executive Overview')).trim() ||
    stripTags(extractSection(html, 'Executive Summary')).trim();

  const riskSection = extractSection(html, 'Risk Outlook');
  const riskMatch = riskSection.match(/Assessment:\s*(\w+)/i) || html.match(/Assessment:\s*(\w+)/i);
  const riskOutlook = riskMatch ? riskMatch[1] : '';

  const kfSection = extractSection(html, 'Key Findings');
  const kfItems = extractListItems(kfSection);
  const keyFindings = kfItems.map((item) => {
    const colonIdx = item.indexOf(':');
    if (colonIdx > 0 && colonIdx < 80) return { title: item.slice(0, colonIdx).trim(), summary: item.slice(colonIdx + 1).trim() };
    return { title: item.slice(0, 80), summary: item };
  });

  const incidents = extractIncidentsDeepfake(html);

  const emergingTrends = extractListItems(extractSection(html, 'Emerging Trends'));
  const geographicObservations = extractListItems(extractSection(html, 'Geographic Observations'));
  const detectionDevelopments = extractListItems(extractSection(html, 'Detection and Defensive'));

  return {
    type: 'deepfake' as const,
    date,
    riskOutlook,
    executiveSummary,
    keyFindings,
    incidents,
    emergingTrends,
    geographicObservations,
    detectionDevelopments,
  };
}

function parseDisasterBrief(html: string, date: string) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  const overallThreat = (() => {
    const flag = html.match(/<span class="flag\s+(\w+)"[^>]*>([^<]+)<\/span>/i);
    if (flag) return stripTags(flag[2]!).trim().toLowerCase();
    const kpiEsc = html.match(/<div class="kpi\s+(escalate|monitor)"[^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/i);
    if (kpiEsc) return stripTags(kpiEsc[2]!).trim().toLowerCase();
    return '';
  })();

  const kpis = extractKpisDisaster(html);

  const allEvents = extractEventsDisaster(html);
  const escalateEvents = allEvents.filter((e) => e.severity === 'escalate');
  const monitorEvents = allEvents.filter((e) => e.severity === 'monitor');

  const topSection = extractSection(html, 'Top Five Critical Events');
  const topEvents: { title: string; severity: string; text: string; sources: { url: string; label: string }[] }[] = [];
  const re = /<div class="priority"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(topSection)) !== null) {
    const inner = extractBalancedDiv(topSection, m.index);
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const p = inner.match(/<p>([\s\S]*?)<\/p>/i);
    topEvents.push({
      title: h3 ? stripTags(h3[1]!).trim() : '',
      severity: 'escalate',
      text: p ? stripTags(p[1]!).trim() : '',
      sources: extractLinks(inner),
    });
  }
  const topEventsFinal = topEvents.length > 0 ? topEvents.slice(0, 5) : escalateEvents.slice(0, 5);

  const outlook = stripTags(extractSection(html, 'Next 72')).trim();
  const regionalTrends = extractListItems(extractSection(html, 'Regional and Hazard'));

  return {
    type: 'disaster' as const,
    date,
    overallThreat,
    executiveSummary,
    dashboard: { kpis },
    topEvents: topEventsFinal,
    escalateEvents,
    monitorEvents,
    outlook72h: outlook,
    regionalTrends,
  };
}

function parseMaritimeBrief(html: string, date: string) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  const tlSection = extractSection(html, 'Overall Maritime Cyber Threat Level');
  let threatLevel = 'Unknown';
  const tlMatch = tlSection.match(/Assessed Threat Level:\s*(\w+)/i);
  if (tlMatch) threatLevel = tlMatch[1]!;

  const kpis = extractKpisMaritime(html);

  const topThreats = extractPriorityMaritime(html).map((c) => ({
    title: c.title,
    action: c.action,
    sources: c.sources,
  }));

  const events = extractEventsMaritime(html);
  const escalateEvents = events.filter((e) => e.severity === 'escalate');
  const monitorEvents = events.filter((e) => e.severity === 'monitor');
  const topEventsFinal = escalateEvents.slice(0, 5);

  const kfItems = extractListItems(extractSection(html, 'Key Findings'));

  const cveWatchItems = extractListItems(extractSection(html, 'Vulnerability and CVE Watch'));
  const cveWatch = cveWatchItems.length > 0 ? [{ category: 'Vulnerability and CVE Watch', items: cveWatchItems }] : [];

  const ttpItems = extractListItems(extractSection(html, 'TTPs and MITRE ATT'));
  const mitreIds = [...new Set(ttpItems.join(' ').match(/T\d{4}(?:\.\d{3})?/g) || [])];

  const vendors = extractChips(extractSection(html, 'Affected Vendors'));
  const sectors = extractChips(extractSection(html, 'Affected Maritime Sectors'));

  const outlook = stripTags(extractSection(html, 'Next 72-Hour Maritime Cyber Outlook')).trim();

  const allCves = [...new Set(
    (html.match(/CVE[\-\u2011]\d{4}[\-\u2011]\d{4,}/gi) || []).map((c) => c.toUpperCase().replace(/[\u2011]/g, '-'))
  )];

  return {
    type: 'maritime' as const,
    date,
    threatLevel,
    executiveSummary: executiveSummary || stripTags(html).slice(0, 2048),
    dashboard: { kpis: kpis.length > 0 ? kpis : [{ value: 'N/A', label: 'No KPI data' }], vendors, sectors },
    keyFindings: kfItems,
    topThreats,
    cveWatch,
    events,
    topEvents: topEventsFinal,
    escalateEvents,
    monitorEvents,
    ttps: { descriptions: ttpItems, mitreIds },
    outlook72h: outlook,
    relatedCves: allCves,
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
    maritime: parseMaritimeBrief,
  };

  const mergedBriefs = new Map<string, { type: DbBriefType; date: string; sizeBytes: number }>();

  // Load existing index from KV to merge with new data
  try {
    const existingIndex: DbIndex | null = await env.KV_CACHE.get(KV_PREFIX_INDEX, 'json');
    if (existingIndex?.briefs) {
      const today = new Date().toISOString().slice(0, 10);
      for (const b of existingIndex.briefs) {
        // Drop future-dated entries — they are always mislabels from a
        // prior date-parsing bug (report date read as "today"), never real.
        if (b.date > today) continue;
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
        types.push(type);
        continue;
      }

      // Write body to KV (with TTL — static manifest is the long-term archive)
      await env.KV_CACHE.put(`${KV_PREFIX_BODY}:${type}:${date}`, bodyStr, { expirationTtl: BODY_TTL_S });
      mergedBriefs.set(`${type}:${date}`, { type: type as DbBriefType, date, sizeBytes });
      types.push(type);
    } catch (err) {
      errors.push(`${type}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Write merged index
  const allBriefs = [...mergedBriefs.values()].sort((a, b) => b.date.localeCompare(a.date));
  const counts: Record<DbBriefType, number> = { cyber: 0, deepfake: 0, disaster: 0, maritime: 0 };
  for (const b of allBriefs) counts[b.type] = (counts[b.type] || 0) + 1;
  const index: DbIndex = {
    source: 'agentic-ai-daily-reports.netlify.app',
    license: 'MIT',
    generatedAt: new Date().toISOString().slice(0, 10),
    counts,
    briefs: allBriefs,
  };
  await env.KV_CACHE.put(KV_PREFIX_INDEX, JSON.stringify(index), { expirationTtl: INDEX_TTL_S });

  return { types, errors };
}
