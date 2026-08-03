#!/usr/bin/env node
/**
 * Build the Daily Briefs manifest under public/data/daily-briefs/.
 *
 * Reads HTML from ./daily-briefs-staging/ (created by
 * `node scripts/sync-daily-briefs.mjs`) and emits structured JSON:
 *   public/data/daily-briefs/index.json
 *   public/data/daily-briefs/cyber/<date>.json
 *   public/data/daily-briefs/deepfake/<date>.json
 *   public/data/daily-briefs/disaster/<date>.json
 *
 * Parses HTML using regex — no external dependencies.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'daily-briefs-staging');
const OUT = join(ROOT, 'public', 'data', 'daily-briefs');

const BRIEF_TYPES = ['cyber', 'deepfake', 'disaster', 'maritime'];

// ─── HTML helpers ────────────────────────────────────────────────────────

function stripTags(html) {
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

function extractBetween(html, startPattern, endPattern) {
  const startMatch = startPattern instanceof RegExp
    ? html.match(startPattern)
    : html.indexOf(startPattern);
  if (startMatch === null || startMatch === -1) return '';
  const startIdx = startMatch instanceof Object ? startMatch.index + startMatch[0].length : startMatch + startPattern.length;
  const rest = html.slice(startIdx);
  if (!endPattern) return rest;
  const endMatch = endPattern instanceof RegExp
    ? rest.match(endPattern)
    : rest.indexOf(endPattern);
  if (endMatch === null || endMatch === -1) return rest;
  const endIdx = endMatch instanceof Object ? endMatch.index : endMatch;
  return rest.slice(0, endIdx);
}

function extractSection(html, heading) {
  // Try exact match first, then fuzzy (ignoring special chars like ‑)
  const patterns = [
    new RegExp(`<h2[^>]*>\\s*${escapeRegex(heading)}\\s*</h2>([\\s\\S]*?)(?=<h2[^>]*>|<section|<footer|$)`, 'i'),
    new RegExp(`<h2[^>]*>[^<]*${escapeRegex(heading.split(' ')[0])}[^<]*</h2>([\\s\\S]*?)(?=<h2[^>]*>|<section|<footer|$)`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1];
  }
  return '';
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractChips(html) {
  const chips = [];
  const re = /<span class="chip"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    chips.push(stripTags(m[1]).trim());
  }
  return chips;
}

function extractCards(html) {
  const cards = [];
  const re = /<div class="card">([\s\S]*?)<\/div>\s*(?=<div class="card"|<\/section|$)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const inner = m[1];
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = h3 ? stripTags(h3[1]).trim() : '';
    const bodyHtml = h3 ? inner.slice(inner.indexOf(h3[0]) + h3[0].length) : inner;
    const text = stripTags(bodyHtml).trim();
    const chips = extractChips(inner);
    const links = extractLinks(inner);
    cards.push({ title, text, chips, links });
  }
  return cards;
}

function extractLinks(html) {
  const links = [];
  const re = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push({ url: m[1], label: stripTags(m[2]).trim() });
  }
  return links;
}

function extractEvents(html) {
  const events = [];
  const re = /<div class="event"[^>]*>/gi;
  const positions = [];
  let m;
  while ((m = re.exec(html)) !== null) positions.push(m.index);

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    // End at next event or end of section
    const end = i + 1 < positions.length ? positions[i + 1] : html.indexOf('</section>', start);
    const chunk = end === -1 ? html.slice(start) : html.slice(start, end);

    const headMatch = chunk.match(/<div class="head">([\s\S]*?)<\/div>\s*<div class="sev\s+(\w+)"/i);
    const bodyStart = chunk.indexOf('<div class="body">');
    if (!headMatch || bodyStart === -1) continue;
    const bodyChunk = chunk.slice(bodyStart);
    const strong = headMatch[1].match(/<strong>([\s\S]*?)<\/strong>/i);
    const title = strong ? stripTags(strong[1]).trim() : stripTags(headMatch[1]).trim();
    const severity = headMatch[2].toLowerCase();
    const text = stripTags(bodyChunk).trim();
    const chips = extractChips(bodyChunk);
    const sources = extractLinks(bodyChunk);
    events.push({ title, severity, text, chips, sources });
  }
  return events;
}

function extractListItems(html) {
  const items = [];
  const re = /<li>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    items.push(stripTags(m[1]).trim());
  }
  return items;
}

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function extractDate(html) {
  // ISO "Report date:</strong> 2026-08-02" (current cyber page) — exact, avoids
  // grabbing arbitrary ISO dates from article bodies.
  const iso = html.match(/Report date[^0-9]*?(\d{4}-\d{2}-\d{2})/i);
  if (iso) return iso[1];
  // Try masthead date pattern: "Tuesday, July 21, 2026"
  const m = html.match(/<div class="date"[^>]*>([\s\S]*?)<\/div>/i);
  if (m) return stripTags(m[1]).trim();
  // Fallback: look for any "Month DD, YYYY" pattern
  const m2 = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i);
  return m2 ? m2[0] : '';
}

function extractThreatLevel(html) {
  const masthead = html.match(/Overall (?:OT )?(?:cyber )?threat level:<\/strong>\s*<span[^>]*>([^<]+)<\/span>/i);
  if (masthead) return stripTags(masthead[1]).trim();
  const kpiThreat = html.match(/<div class="kpi threat"[^>]*>[\s\S]*?<div class="value"[^>]*>([\s\S]*?)<\/div>/i);
  if (kpiThreat) return stripTags(kpiThreat[1]).trim();
  const badge = html.match(/<span class="badge\s+(?:high|medium|low|moderate|critical)"[^>]*>([^<]+)<\/span>/i);
  if (badge) return stripTags(badge[1]).trim();
  const levelPill = html.match(/<span class="level-pill level-\w+"[^>]*>([^<]+)<\/span>/i);
  if (levelPill) return stripTags(levelPill[1]).trim();
  const m = html.match(/<span class="pill[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  if (m) return stripTags(m[1]).trim();
  return '';
}

function extractBalancedDiv(html, startIdx) {
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

function extractKpis(html) {
  const kpis = [];
  // Matches both old layout (<div class="card kpi"> with .n/.l children)
  // and the current netlify layouts (.label/.value in card kpi or kpi threat)
  const re = /class="[^"]*\bkpi\b[^"]*"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const numOld = inner.match(/<div class="n"[^>]*>([\s\S]*?)<\/div>/i);
    const labelOld = inner.match(/<div class="l"[^>]*>([\s\S]*?)<\/div>/i);
    const valueNew = inner.match(/<div class="value[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const labelNew = inner.match(/<div class="label[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const value = numOld ? stripTags(numOld[1]).trim() : valueNew ? stripTags(valueNew[1]).trim() : '';
    const label = labelOld ? stripTags(labelOld[1]).trim() : labelNew ? stripTags(labelNew[1]).trim() : '';
    if (label || value) kpis.push({ value, label });
  }
  return kpis;
}

// ─── Date extraction from filename/content ─────────────────────────────

function dateFromContent(html) {
  const dateStr = extractDate(html);
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  const named = dateStr.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = Number(named[3]);
    if (month !== undefined && day >= 1 && day <= 31) {
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ─── Per-type parsers ──────────────────────────────────────────────────

function parseCyberBrief(html, date) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  const keyFindingsCards = extractCards(extractSection(html, 'Key Findings'));
  const keyFindings = keyFindingsCards.map(c => ({ title: c.title, summary: c.text }));

  const kpis = extractKpis(html);

  const dashboardSection = extractSection(html, 'Threat Dashboard');
  // Extract chips from each sub-card in the dashboard grid individually
  const dashboardCards = extractCards(dashboardSection);
  const dashboardMap = {};
  for (const dc of dashboardCards) {
    if (dc.title) dashboardMap[dc.title.toLowerCase()] = dc.chips;
  }
  const activelyExploited = dashboardMap['actively exploited'] ?? extractChips(dashboardSection);
  // Vendors and sectors from dashboard + dedicated sections
  const vendorsFromDash = dashboardMap['ot vendors impacted'] ?? [];
  const sectorsFromDash = dashboardMap['primary sectors at risk'] ?? [];
  const vendorsSection = extractSection(html, 'Affected Vendors');
  const vendors = [...new Set([...vendorsFromDash, ...extractChips(vendorsSection)])];
  const sectorsSection = extractSection(html, 'Affected Sectors');
  const sectors = [...new Set([...sectorsFromDash, ...extractChips(sectorsSection)])];

  const topThreatsCards = extractCards(extractSection(html, 'Top Five Priority Threats'));
  const topThreats = topThreatsCards.map(c => ({ title: c.title, action: c.text }));

  const threatActorsSection = extractSection(html, 'Threat Actor Activity');
  const threatActors = extractCards(threatActorsSection).map(c => ({
    category: c.title,
    items: extractListItems(c.text.includes('<ul>') ? threatActorsSection.slice(threatActorsSection.indexOf(c.title)) : ''),
  }));

  const cveWatchSection = extractSection(html, 'Vulnerability and CVE Watch');
  const cveWatch = extractCards(cveWatchSection).map(c => ({
    category: c.title,
    items: extractListItems(c.text.includes('<ul>') ? cveWatchSection.slice(cveWatchSection.indexOf(c.title)) : ''),
  }));

  const eventCards = extractEvents(html);

  const ttpSection = extractSection(html, 'TTPs and ATT');
  const ttps = extractListItems(ttpSection);
  const mitreIds = [...new Set(ttps.join(' ').match(/T\d{4}(?:\.\d{3})?/g) || [])];

  const outlookSection = extractSection(html, 'Next 72');
  const outlook = stripTags(outlookSection).trim();

  // Extract all CVE IDs mentioned anywhere in the brief (handle non-breaking hyphens)
  const allCves = [...new Set(
    (html.match(/CVE[\-\u2011]\d{4}[\-\u2011]\d{4,}/gi) || [])
      .map(c => c.toUpperCase().replace(/[\u2011]/g, '-'))
  )];

  return {
    type: 'cyber',
    date,
    threatLevel: extractThreatLevel(html),
    executiveSummary,
    keyFindings,
    dashboard: { kpis, activelyExploited, vendors, sectors },
    topThreats,
    threatActors,
    cveWatch,
    events: eventCards,
    ttps: { descriptions: ttps, mitreIds },
    outlook72h: outlook,
    relatedCves: allCves,
    rawMarkdown: stripTags(html).slice(0, 16384),
  };
}

function parseDeepfakeBrief(html, date) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Overview')).trim()
    || stripTags(extractSection(html, 'Executive Summary')).trim();

  const riskOutlookMatch = html.match(/Overall Outlook:\s*([\w]+)/i)
    || html.match(/Assessment:\s*([\w]+)/i);
  const riskOutlook = riskOutlookMatch ? riskOutlookMatch[1] : '';

  // Key findings from cards OR list items
  const keyFindingsSection = extractSection(html, 'Key Findings');
  const keyFindingsCards = extractCards(keyFindingsSection);
  let keyFindings = keyFindingsCards.map(c => ({ title: c.title, summary: c.text }));
  if (keyFindings.length === 0) {
    // Fall back to list items
    const items = extractListItems(keyFindingsSection);
    keyFindings = items.map(item => {
      const colonIdx = item.indexOf(':');
      if (colonIdx > 0 && colonIdx < 80) {
        return { title: item.slice(0, colonIdx).trim(), summary: item.slice(colonIdx + 1).trim() };
      }
      return { title: item.slice(0, 80), summary: item };
    });
  }

  // Incidents: <div class="card incident-card"><div class="incident-head"><span class="badge badge-escalate">..</span><h3 class="incident-title">Title</h3></div><div class="meta">..</div><div class="incident-body">..</div>
  const incidentsSection = extractSection(html, 'Priority Incidents');
  const incidents = [];
  const cardRe = /<div class="card\s+incident-card"[^>]*>([\s\S]*?)(?=<div class="card\s+incident-card"|<\/section|$)/gi;
  let cm;
  while ((cm = cardRe.exec(incidentsSection)) !== null) {
    const inner = cm[1];
    const titleMatch = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = titleMatch ? stripTags(titleMatch[1]).trim() : '';
    const badges = [];
    const badgeRe = /<span class="badge\s+(\w+)">([^<]+)<\/span>/gi;
    let bm;
    while ((bm = badgeRe.exec(inner)) !== null) badges.push(bm[2].trim());
    const fields = {};
    const metaInner = inner.match(/<div class="meta">([\s\S]*?)<\/div>/i);
    if (metaInner) {
      const spanRe = /<span>([^:]+):\s*([^<]+)<\/span>/gi;
      let sm;
      while ((sm = spanRe.exec(metaInner[1])) !== null) fields[sm[1].trim()] = stripTags(sm[2]).trim();
    }
    const bodyInner = (inner.match(/<div class="incident-body">([\s\S]*?)$/i) || [])[1] || inner;
    const pMatch = bodyInner.match(/<p>([\s\S]*?)<\/p>/i);
    const summary = pMatch ? stripTags(pMatch[1]).trim() : '';
    const sources = extractLinks(bodyInner);
    incidents.push({ title, badges, fields, summary, sources });
  }

  const trendsSection = extractSection(html, 'Emerging Trends');
  const emergingTrends = extractListItems(trendsSection);

  const geoSection = extractSection(html, 'Geographic Observations');
  const geographicObservations = extractListItems(geoSection);

  const detectionSection = extractSection(html, 'Detection and Defensive');
  const detectionDevelopments = extractListItems(detectionSection);

  return {
    type: 'deepfake',
    date,
    riskOutlook,
    executiveSummary,
    keyFindings,
    incidents,
    emergingTrends,
    geographicObservations,
    detectionDevelopments,
    rawMarkdown: stripTags(html).slice(0, 16384),
  };
}

function parseDisasterBrief(html, date) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  // Threat level: <div class="threat"><span>Overall Threat</span> <span class="level">HIGH</span></div>
  const overallThreat = extractThreatLevel(html) || (html.match(/<span class="level">([^<]+)<\/span>/i) || [])[1] || '';

  // KPIs from grid-3 cards
  const kpis = extractKpis(html);

  // Events: <div class="card event-card"><div class="header"><div class="title">..</div><div class="chips"><span class="chip red">ESCALATE</span>..</div><div class="meta">..</div>body..<div class="sources">..</div>
  const events = [];
  const eventRe = /<div class="card\s+event-card"[^>]*>/gi;
  const positions = [];
  let m;
  while ((m = eventRe.exec(html)) !== null) positions.push({ idx: m.index });
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx : html.indexOf('</section>', start);
    const chunk = end === -1 ? html.slice(start) : html.slice(start, end);
    const titleMatch = chunk.match(/<div class="title">([\s\S]*?)<\/div>/i);
    const title = titleMatch ? stripTags(titleMatch[1]).trim() : '';
    const chipMatch = chunk.match(/<span class="chip\s+(\w+)"[^>]*>([^<]+)<\/span>/i);
    const chipText = chipMatch ? stripTags(chipMatch[2]).trim().toLowerCase() : '';
    const severity = chipText === 'escalate' || chipText === 'monitor' || chipText === 'ignore' ? chipText : chipMatch ? chipMatch[1].toLowerCase() : '';
    const metaStart = chunk.indexOf('<div class="meta">');
    const bodyStart = metaStart !== -1 ? chunk.indexOf('</div>', metaStart) + 6 : -1;
    const text = bodyStart > 6 ? stripTags(chunk.slice(bodyStart)).trim() : '';
    const sources = extractLinks(chunk);
    events.push({ title, severity, text, sources });
  }

  const topEvents = events.filter(e => e.severity === 'escalate').slice(0, 5);
  const escalateEvents = events.filter(e => e.severity === 'escalate');
  const monitorEvents = events.filter(e => e.severity === 'monitor');

  const outlookSection = extractSection(html, 'Next 72');
  const outlook = stripTags(outlookSection).trim();

  const regionsSection = extractSection(html, 'Regional and Hazard');
  const regionalTrends = extractListItems(regionsSection);

  return {
    type: 'disaster',
    date,
    overallThreat,
    executiveSummary,
    dashboard: { kpis },
    topEvents,
    escalateEvents,
    monitorEvents,
    outlook72h: outlook,
    regionalTrends,
    rawMarkdown: stripTags(html).slice(0, 16384),
  };
}

function parseMaritimeBrief(html, date) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  const threatLevel = extractThreatLevel(html);

  const kpis = extractKpis(html);

  // Events: <div class="event"><div class="title">..</div><div class="meta"><span class="decision-pill dec-escalate">..</div><div class="body">..</div>
  const events = [];
  const eventRe = /<div class="event"[^>]*>/gi;
  const positions = [];
  let m;
  while ((m = eventRe.exec(html)) !== null) positions.push({ idx: m.index });
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx : html.indexOf('</section>', start);
    const chunk = end === -1 ? html.slice(start) : html.slice(start, end);
    const titleMatch = chunk.match(/<div class="title">([\s\S]*?)<\/div>/i);
    const title = titleMatch ? stripTags(titleMatch[1]).trim() : '';
    const pillMatch = chunk.match(/decision-pill dec-(escalate|monitor|ignore)/i);
    const severity = pillMatch ? pillMatch[1].toLowerCase() : 'ignore';
    const bodyStart = chunk.indexOf('<div class="body">');
    const text = bodyStart !== -1 ? stripTags(chunk.slice(bodyStart)).trim() : '';
    const sources = extractLinks(chunk);
    events.push({ title, severity, text, sources });
  }

  const topEvents = events.filter((e) => e.severity === 'escalate').slice(0, 5);
  const escalateEvents = events.filter((e) => e.severity === 'escalate');
  const monitorEvents = events.filter((e) => e.severity === 'monitor');

  const keyFindingsSection = extractSection(html, 'Key Findings');
  const regionalTrends = extractListItems(keyFindingsSection);

  const outlookSection = extractSection(html, 'Next 72');
  const outlook = stripTags(outlookSection).trim();

  return {
    type: 'maritime',
    date,
    overallThreat: threatLevel || 'Unknown',
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

// ─── Main ──────────────────────────────────────────────────────────────

if (!existsSync(STAGING)) {
  console.error(`✘ Staging folder missing: ${STAGING}`);
  console.error('  Run: node scripts/sync-daily-briefs.mjs first.');
  process.exit(1);
}

// Ensure output directories exist (don't wipe — preserve historical data)
for (const t of BRIEF_TYPES) mkdirSync(join(OUT, t), { recursive: true });

// Load existing index to merge with new data
let existingIndex = { briefs: [] };
const indexPath = join(OUT, 'index.json');
if (existsSync(indexPath)) {
  try { existingIndex = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { /* ignore corrupt index */ }
}
const existingBriefs = new Map((existingIndex.briefs ?? []).map((b) => [`${b.type}:${b.date}`, b]));

const parsers = { cyber: parseCyberBrief, deepfake: parseDeepfakeBrief, disaster: parseDisasterBrief, maritime: parseMaritimeBrief };
const briefCounts = { cyber: 0, deepfake: 0, disaster: 0, maritime: 0 };
const mergedBriefs = new Map(existingBriefs);

for (const type of BRIEF_TYPES) {
  const htmlPath = join(STAGING, `${type}.html`);
  if (!existsSync(htmlPath)) {
    console.warn(`  ⚠ ${type}.html not found — skipping`);
    continue;
  }
  const html = readFileSync(htmlPath, 'utf8');
  const date = dateFromContent(html);
  const parsed = parsers[type](html, date);
  const outPath = join(OUT, type, `${date}.json`);
  const newSize = JSON.stringify(parsed).length;

  // Skip write if file exists and size hasn't changed (same content)
  const existing = mergedBriefs.get(`${type}:${date}`);
  if (existing && existing.sizeBytes === newSize) {
    console.log(`  ─ ${type} ${date} (unchanged, ${newSize} bytes)`);
    briefCounts[type]++;
    continue;
  }

  writeFileSync(outPath, JSON.stringify(parsed));
  mergedBriefs.set(`${type}:${date}`, { type, date, sizeBytes: newSize });
  briefCounts[type]++;
  console.log(`  ✔ ${type} ${date} (${newSize} bytes)`);
}

// Write merged index (preserve all historical briefs)
const allBriefs = [...mergedBriefs.values()].sort((a, b) => b.date.localeCompare(a.date));
const counts = { cyber: 0, deepfake: 0, disaster: 0, maritime: 0 };
for (const b of allBriefs) counts[b.type] = (counts[b.type] || 0) + 1;
const index = {
  source: 'agentic-ai-daily-reports.netlify.app',
  license: 'MIT',
  generatedAt: new Date().toISOString().slice(0, 10),
  counts,
  briefs: allBriefs,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('\n✔ Built:');
for (const t of BRIEF_TYPES) {
  console.log(`    ${briefCounts[t]} ${t} brief(s) new/updated`);
}
console.log(`    ${allBriefs.length} total briefs in index`);
console.log(`    1 index (public/data/daily-briefs/index.json)`);
