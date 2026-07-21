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
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STAGING = join(ROOT, 'daily-briefs-staging');
const OUT = join(ROOT, 'public', 'data', 'daily-briefs');

const BRIEF_TYPES = ['cyber', 'deepfake', 'disaster'];

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

function extractDate(html) {
  // Try masthead date pattern: "Tuesday, July 21, 2026"
  const m = html.match(/<div class="date"[^>]*>([\s\S]*?)<\/div>/i);
  if (m) return stripTags(m[1]).trim();
  // Fallback: look for any "Month DD, YYYY" pattern
  const m2 = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i);
  return m2 ? m2[0] : '';
}

function extractThreatLevel(html) {
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
  const re = /<div class="card kpi">/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const numMatch = inner.match(/<div class="n"[^>]*>([\s\S]*?)<\/div>/i);
    const labelMatch = inner.match(/<div class="l"[^>]*>([\s\S]*?)<\/div>/i);
    kpis.push({
      value: numMatch ? stripTags(numMatch[1]).trim() : '',
      label: labelMatch ? stripTags(labelMatch[1]).trim() : '',
    });
  }
  return kpis;
}

// ─── Date extraction from filename/content ─────────────────────────────

function dateFromContent(html) {
  const dateStr = extractDate(html);
  if (!dateStr) return new Date().toISOString().slice(0, 10);
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

  // Incidents from grid-incidents: <div class="card"><h3>Title</h3><div class="meta"><span class="badge esc">...
  const incidentsSection = extractSection(html, 'Priority Incidents');
  const incidents = [];
  const cardRe = /<div class="card">\s*<h3>([\s\S]*?)<\/h3>\s*<div class="meta">([\s\S]*?)<\/div>/gi;
  let cm;
  while ((cm = cardRe.exec(incidentsSection)) !== null) {
    const title = stripTags(cm[1]).trim();
    const metaHtml = cm[2];
    const badges = [];
    const badgeRe = /<span class="badge\s+(\w+)">([^<]+)<\/span>/gi;
    let bm;
    while ((bm = badgeRe.exec(metaHtml)) !== null) badges.push(bm[2].trim());

    // Extract fields section using balanced div extraction
    const afterMeta = incidentsSection.slice(cm.index + cm[0].length);
    const fieldsStart = afterMeta.indexOf('<div class="fields">');
    const fields = {};
    if (fieldsStart !== -1) {
      const fieldsContent = extractBalancedDiv(afterMeta, fieldsStart);
      const fieldRe = /<div class="field"><label>([^<]+)<\/label><div>([\s\S]*?)<\/div><\/div>/gi;
      let fm;
      while ((fm = fieldRe.exec(fieldsContent)) !== null) fields[fm[1].trim()] = stripTags(fm[2]).trim();
    }

    // Content after fields — bounded to current card
    const nextCardIdx = incidentsSection.indexOf('<div class="card">', cm.index + cm[0].length);
    const cardEnd = nextCardIdx !== -1 ? nextCardIdx : incidentsSection.length;
    const afterFields = incidentsSection.slice(cm.index + cm[0].length, cardEnd);
    // Extract first <p> as summary
    const pMatch = afterFields.match(/<p>([\s\S]*?)<\/p>/i);
    const summary = pMatch ? stripTags(pMatch[1]).trim() : '';
    const sources = extractLinks(afterFields);
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
  const threatMatch = html.match(/<span class="level">([^<]+)<\/span>/i);
  const overallThreat = threatMatch ? threatMatch[1].trim() : '';

  // KPIs from grid-3 cards
  const kpis = extractKpis(html);

  // Events: <div class="card"><div class="event escalate/monitor">...</div></div>
  const events = [];
  const eventRe = /<div class="event\s+(escalate|monitor|ignore)"[^>]*>/gi;
  const positions = [];
  let m;
  while ((m = eventRe.exec(html)) !== null) positions.push({ idx: m.index, severity: m[1].toLowerCase() });
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].idx;
    const end = i + 1 < positions.length ? positions[i + 1].idx : html.indexOf('</section>', start);
    const chunk = end === -1 ? html.slice(start) : html.slice(start, end);
    const titleMatch = chunk.match(/<div class="title">([\s\S]*?)<\/div>/i);
    const title = titleMatch ? stripTags(titleMatch[1]).trim() : '';
    const descMatch = chunk.match(/<div class="muted">([\s\S]*?)<\/div>/i);
    const text = descMatch ? stripTags(descMatch[1]).trim() : '';
    const sources = extractLinks(chunk);
    events.push({ title, severity: positions[i].severity, text, sources });
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

// ─── Main ──────────────────────────────────────────────────────────────

if (!existsSync(STAGING)) {
  console.error(`✘ Staging folder missing: ${STAGING}`);
  console.error('  Run: node scripts/sync-daily-briefs.mjs first.');
  process.exit(1);
}

// Wipe and rebuild
if (existsSync(OUT)) rmSync(OUT, { recursive: true });
for (const t of BRIEF_TYPES) mkdirSync(join(OUT, t), { recursive: true });

const parsers = { cyber: parseCyberBrief, deepfake: parseDeepfakeBrief, disaster: parseDisasterBrief };
const briefCounts = { cyber: 0, deepfake: 0, disaster: 0 };
const briefIndex = [];

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
  writeFileSync(outPath, JSON.stringify(parsed));
  briefCounts[type]++;
  briefIndex.push({ type, date, sizeBytes: JSON.stringify(parsed).length });
  console.log(`  ✔ ${type} ${date} (${JSON.stringify(parsed).length} bytes)`);
}

// Write index
const index = {
  source: 'agentic-ai-daily-reports.netlify.app',
  license: 'MIT',
  generatedAt: new Date().toISOString().slice(0, 10),
  counts: briefCounts,
  briefs: briefIndex,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));

console.log('\n✔ Built:');
for (const t of BRIEF_TYPES) {
  console.log(`    ${briefCounts[t]} ${t} brief(s)`);
}
console.log(`    1 index (public/data/daily-briefs/index.json)`);
