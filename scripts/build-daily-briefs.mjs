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
 *   public/data/daily-briefs/maritime/<date>.json
 *
 * Parses HTML using regex — no external dependencies.
 *
 * Each brief type on agentic-ai-daily-reports.netlify.app uses a DIFFERENT
 * DOM, so the section/heading/event extractors below are per-type:
 *   - cyber:    <section class="section"><div class="section-title">Title</div>…
 *              events in <div class="event escalate|monitor|ignore">…<h4>…<div class="desc">
 *   - deepfake: <h2>Title</h2> sections; incidents in <div class="incident-card card">…<h3>
 *   - disaster: <h2 class="sec">Title</h2>; events in <div class="event-card indicator escalate|monitor">
 *   - maritime: <h2>N. Title</h2> (numbered); priority <div class="priority">; events <div class="event-card">
 *
 * extractSection() matches all four heading variants so a single helper
 * works across types, then per-type extractors pull the structured pieces.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
    .replace(/\u2011/g, '-') // non-breaking hyphen → ASCII (CVE IDs etc.)
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract the body of a named section. Matches four heading variants used
 * across the reference site's brief types:
 *   1. <h2>Title</h2>                       (deepfake)
 *   2. <h2 class="sec">Title</h2>           (disaster)
 *   3. <h2>N. Title</h2>                    (maritime — numbered)
 *   4. <div class="section-title">Title</div>  (cyber)
 * The section ends at the next heading of the SAME variant, the next
 * <section>/<footer>/<aside>, or end of document.
 */
function extractSection(html, heading) {
  const esc = escapeRegex(heading);
  // Normalize the heading text for matching: collapse whitespace, allow a
  // leading number + ". " for maritime, and allow optional trailing chars
  // (e.g. "TTPs and MITRE ATT&CK-Style Observations" matched by "TTPs").
  const variants = [
    // <div class="section-title">Title</div>
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
    if (m && m[1] && m[1].trim()) return m[1];
  }
  // Fuzzy: match on the first word only (e.g. "TTPs and MITRE…" by "TTPs").
  const firstWord = escapeRegex(heading.split(/\s+/)[0]);
  const fuzzy = [
    new RegExp(`<div class="section-title"[^>]*>[^<]*${firstWord}[\\s\\S]*?</div>[\\s\\S]*?<div class="section-body"[^>]*>([\\s\\S]*?)(?=<section class="section"|<footer|$)`, 'i'),
    new RegExp(`<h2[^>]*>[^<]*${firstWord}[\\s\\S]*?</h2>([\\s\\S]*?)(?=<h2[^>]*>|<footer|<aside|$)`, 'i'),
  ];
  for (const re of fuzzy) {
    const m = html.match(re);
    if (m && m[1] && m[1].trim()) return m[1];
  }
  return '';
}

function extractChips(html) {
  const chips = [];
  // Match both <span class="chip"> (old) and <span class="pill"> (new DOM)
  const re = /<span class="(?:chip|pill)"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = stripTags(m[1]).trim();
    if (t) chips.push(t);
  }
  return chips;
}

function extractLinks(html) {
  const links = [];
  const re = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const label = stripTags(m[2]).trim();
    if (m[1] && !m[1].startsWith('#')) links.push({ url: m[1], label });
  }
  return links;
}

function extractListItems(html) {
  const items = [];
  const re = /<li>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = stripTags(m[1]).trim();
    if (t) items.push(t);
  }
  return items;
}

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function extractDate(html) {
  // Extract the report date from a DEDICATED date marker — never from the
  // first random "Month DD, YYYY" in the body, which can be a stale
  // reference to a previous day (e.g. "compared to August 04, 2026") when
  // the upstream site is mid-update. Priority order, per brief type:
  //
  //   cyber:    "Report date: 2026-08-05"            (ISO)
  //   deepfake: "Generated: Wednesday, August 05, 2026" (in .subtitle)
  //   disaster: "Generated: Wednesday, August 05, 2026" (in .badge)
  //             or "Report Date: 05 Aug 2026"          (in .pill)
  //   maritime: "Publication Date: Wednesday, August 05, 2026" (in .badge)
  //             or title "– Wednesday, August 05, 2026" (en-dash)

  // 1. ISO "Report date: 2026-08-05" (cyber)
  const iso = html.match(/Report date[^0-9]*?(\d{4}-\d{2}-\d{2})/i);
  if (iso) return iso[1];

  // 2. Dedicated labelled markers: "Generated:", "Publication Date:",
  //    "Report Date:" — these are the masthead/header fields, not body prose.
  //    Match "Day, Month DD, YYYY" OR "DD Mon YYYY".
  const labelled = html.match(
    /(?:Generated|Publication Date|Report Date)\s*:\s*([^<\n]{3,60}?)(?:<|\n|$)/i
  );
  if (labelled) {
    const s = stripTags(labelled[1]).trim();
    // "Wednesday, August 05, 2026"
    const long = s.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i
    );
    if (long) return `${long[3]}-${String(MONTHS[long[1].toLowerCase()] + 1).padStart(2, '0')}-${long[2].padStart(2, '0')}`;
    // "05 Aug 2026"
    const short = s.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
    if (short) {
      const monMap = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
      const mon = monMap[short[2].toLowerCase().slice(0,3)];
      if (mon !== undefined) return `${short[3]}-${String(mon + 1).padStart(2, '0')}-${short[1].padStart(2, '0')}`;
    }
  }

  // 3. <title> with a date — handle hyphen OR en-dash (–/—) separators and
  //    both "Month DD, YYYY" and "DD Mon YYYY" formats.
  //    e.g. "Maritime ... Brief – Wednesday, August 05, 2026"
  //         "DeepFake ... Brief — 05 Aug 2026"
  const titleDate = html.match(/<title>[^<]*?[\u2012-\u2015\-]\s*([^<]+?)<\/title>/i);
  if (titleDate) {
    const s = titleDate[1];
    const long = s.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i
    );
    if (long) return `${long[3]}-${String(MONTHS[long[1].toLowerCase()] + 1).padStart(2, '0')}-${long[2].padStart(2, '0')}`;
    const short = s.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i);
    if (short) {
      const monMap = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
      const mon = monMap[short[2].toLowerCase().slice(0,3)];
      if (mon !== undefined) return `${short[3]}-${String(mon + 1).padStart(2, '0')}-${short[1].padStart(2, '0')}`;
    }
  }

  // 4. Masthead date div (legacy fallback)
  const m = html.match(/<div class="date"[^>]*>([\s\S]*?)<\/div>/i);
  if (m) return stripTags(m[1]).trim();

  // 5. Last resort: first "Month DD, YYYY" anywhere. This is the risky fallback
  //    that previously caused stale dates — kept only so we never return empty.
  const m2 = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i);
  return m2 ? m2[0] : '';
}

function dateFromContent(html) {
  const dateStr = extractDate(html);
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  // Already ISO (from the cyber "Report date" path or the labelled/title paths)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
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

// ─── KPI extractors (per layout) ───────────────────────────────────────

function extractBalancedDiv(html, startIdx) {
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
function extractKpisCyber(html) {
  const kpis = [];
  const re = /<div class="kpi"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const label = inner.match(/<div class="label"[^>]*>([\s\S]*?)<\/div>/i);
    const value = inner.match(/<div class="value"[^>]*>([\s\S]*?)<\/div>/i);
    const trend = inner.match(/<div class="trend"[^>]*>([\s\S]*?)<\/div>/i);
    const l = label ? stripTags(label[1]).trim() : '';
    const v = value ? stripTags(value[1]).trim() : '';
    if (l || v) kpis.push({ value: v, label: l, ...(trend ? { trend: stripTags(trend[1]).trim() } : {}) });
  }
  return kpis;
}

/** disaster: <div class="metric"><div class="muted">Label</div><div class="num">Value</div><div class="muted">Note</div></div> (new DOM)
 *  old DOM: <div class="kpi escalate"><h4>L</h4><div class="val">V</div><div class="note">N</div></div> */
function extractKpisDisaster(html) {
  const kpis = [];
  // New: <div class="metric"> with muted/num/muted children
  const re = /<div class="metric"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const muteds = inner.match(/<div class="muted"[^>]*>([\s\S]*?)<\/div>/gi) || [];
    const num = inner.match(/<div class="num"[^>]*>([\s\S]*?)<\/div>/i);
    const label = muteds[0] ? stripTags(muteds[0]).trim() : '';
    const value = num ? stripTags(num[1]).trim() : '';
    const note = muteds[1] ? stripTags(muteds[1]).trim() : '';
    if (label || value) kpis.push({ value, label, ...(note ? { trend: note } : {}) });
  }
  // Fallback to old DOM: <div class="kpi escalate"><h4>L</h4><div class="val">V</div>…
  if (kpis.length === 0) {
    const re2 = /<div class="kpi[^"]*"[^>]*>/gi;
    while ((m = re2.exec(html)) !== null) {
      const inner = extractBalancedDiv(html, m.index);
      const label = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
      const val = inner.match(/<div class="val"[^>]*>([\s\S]*?)<\/div>/i);
      const note = inner.match(/<div class="note"[^>]*>([\s\S]*?)<\/div>/i);
      const l = label ? stripTags(label[1]).trim() : '';
      const v = val ? stripTags(val[1]).trim() : '';
      if (l || v) kpis.push({ value: v, label: l, ...(note ? { trend: stripTags(note[1]).trim() } : {}) });
    }
  }
  return kpis;
}

/** maritime: <div class="kpi"><span>Label</span><strong>Value</strong></div> (new DOM)
 *  wrapped in <div class="card col-N">. Old DOM used <div class="card"><div class="label">/<div class="metric">. */
function extractKpisMaritime(html) {
  const kpis = [];
  const dash = extractSection(html, 'Maritime Threat Dashboard') || '';
  // New: <div class="kpi"><span>L</span><strong>V</strong></div>
  const re = /<div class="kpi"[^>]*>/gi;
  let m;
  while ((m = re.exec(dash)) !== null) {
    const inner = extractBalancedDiv(dash, m.index);
    const span = inner.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
    const strong = inner.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    const l = span ? stripTags(span[1]).trim() : '';
    const v = strong ? stripTags(strong[1]).trim() : '';
    if (l || v) kpis.push({ value: v, label: l });
  }
  // Fallback to old DOM: <div class="card"><div class="label">/<div class="metric">
  if (kpis.length === 0) {
    const re2 = /<div class="card"[^>]*>/gi;
    while ((m = re2.exec(dash)) !== null) {
      const inner = extractBalancedDiv(dash, m.index);
      const label = inner.match(/<div class="label"[^>]*>([\s\S]*?)<\/div>/i);
      const metric = inner.match(/<div class="metric"[^>]*>([\s\S]*?)<\/div>/i);
      const l = label ? stripTags(label[1]).trim() : '';
      let v = metric ? stripTags(metric[1]).trim() : '';
      v = v.replace(/\s+Level\s*$/, '').trim();
      if (l || v) kpis.push({ value: v, label: l });
    }
  }
  return kpis;
}

// ─── Card extractors ───────────────────────────────────────────────────

/** cyber dashboard cards: <div class="kpi"><div class="label">L</div><div class="value">V</div><div class="trend">T</div></div>
 *  (the dashboard is a grid of kpi blocks; the old <div class="card"> wrapper is gone) */
function extractCardsCyberDash(html) {
  // Restrict to the Threat Dashboard section so we don't grab the Top Five
  // Priority Threats kpis (which live in their own section).
  const dash = extractSection(html, 'Threat Dashboard') || '';
  const cards = [];
  const re = /<div class="kpi"[^>]*>/gi;
  let m;
  while ((m = re.exec(dash)) !== null) {
    const inner = extractBalancedDiv(dash, m.index);
    const label = inner.match(/<div class="label"[^>]*>([\s\S]*?)<\/div>/i);
    const value = inner.match(/<div class="value"[^>]*>([\s\S]*?)<\/div>/i);
    const note = inner.match(/<div class="trend"[^>]*>([\s\S]*?)<\/div>/i)
      || inner.match(/<div class="note"[^>]*>([\s\S]*?)<\/div>/i);
    const title = label ? stripTags(label[1]).trim() : '';
    const text = value ? stripTags(value[1]).trim() : (note ? stripTags(note[1]).trim() : '');
    if (title) cards.push({ title, text, chips: extractChips(inner) });
  }
  return cards;
}

/** cyber priority threats: <div class="kpi"><div class="label">N) Title</div><div class="value">Action</div><div class="trend">Trend</div><a…></div>
 *  (Top Five Priority Threats now uses kpi blocks, not card priority)
 *  NOTE: caller passes the already-extracted section (see parseCyberBrief). */
function extractCardsCyberPriority(section) {
  const cards = [];
  const re = /<div class="kpi"[^>]*>/gi;
  let m;
  while ((m = re.exec(section)) !== null) {
    const inner = extractBalancedDiv(section, m.index);
    const label = inner.match(/<div class="label"[^>]*>([\s\S]*?)<\/div>/i);
    const value = inner.match(/<div class="value"[^>]*>([\s\S]*?)<\/div>/i);
    const trend = inner.match(/<div class="trend"[^>]*>([\s\S]*?)<\/div>/i);
    const title = label ? stripTags(label[1]).trim() : '';
    const action = value ? stripTags(value[1]).trim() : '';
    cards.push({ title, action, sources: extractLinks(inner), ...(trend ? { trend: stripTags(trend[1]).trim() } : {}) });
  }
  return cards;
}

/** cyber events: grouped under <div class="band escalate|monitor|ignore"><h3>… — ESCALATE</h3></div>
 *  followed by <div class="event-columns"> containing <div class="event">
 *  with <h4>Title</h4><div class="meta">…</div><p>desc</p><div class="srcs">links</div>.
 *  Severity comes from the enclosing band, not from a class on the event. */
function extractEventsCyber(html) {
  const events = [];
  // Walk the three severity bands. Each band's <h3> ends with the severity word.
  const bandRe = /<div class="band\s+(escalate|monitor|ignore)"[^>]*>[\s\S]*?<\/div>\s*<div class="event-columns">([\s\S]*?)(?=<div class="band\s+(?:escalate|monitor|ignore)"|<div class="section"|<footer|<aside|$)/gi;
  let bm;
  while ((bm = bandRe.exec(html)) !== null) {
    const severity = bm[1].toLowerCase();
    const columns = bm[2];
    const evRe = /<div class="event"[^>]*>/gi;
    let em;
    while ((em = evRe.exec(columns)) !== null) {
      const inner = extractBalancedDiv(columns, em.index);
      const h4 = inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
      const meta = inner.match(/<div class="meta"[^>]*>([\s\S]*?)<\/div>/i);
      const p = inner.match(/<p>([\s\S]*?)<\/p>/i);
      const srcs = inner.match(/<div class="srcs"[^>]*>([\s\S]*?)<\/div>/i);
      const title = h4 ? stripTags(h4[1]).trim() : '';
      const text = p ? stripTags(p[1]).trim() : '';
      const chips = meta ? extractChips(meta[1]) : [];
      const sources = srcs ? extractLinks(srcs[1]) : extractLinks(inner);
      events.push({ title, severity, text, chips, sources });
    }
  }
  return events;
}

/** deepfake incidents: <div class="incident-card"><div class="incident-header"><h3 class="incident-title">Title</h3><span class="badge escalate">ESCALATE</span></div><div class="meta"><span>…</span>…</div><div class="field">…</div>…</div>
 *  (old DOM used <div class="incident-card card"> with <h3> and chip spans) */
function extractIncidentsDeepfake(html) {
  const incidents = [];
  const re = /<div class="incident-card"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const inner = extractBalancedDiv(html, m.index);
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = h3 ? stripTags(h3[1]).trim() : '';
    // Badges: <span class="badge escalate">ESCALATE</span> <span class="urgency high">High Urgency</span>
    const badges = [];
    const badgeRe = /<span class="(?:badge|urgency)[^"]*"[^>]*>([^<]+)<\/span>/gi;
    let bm;
    while ((bm = badgeRe.exec(inner)) !== null) badges.push(stripTags(bm[1]).trim());
    // Fields: <span>Key: Value</span> inside <div class="meta">
    const fields = {};
    const metaInner = inner.match(/<div class="meta"[^>]*>([\s\S]*?)<\/div>/i);
    if (metaInner) {
      // <span>Publication date: 2026-08-04</span>  (no class)
      const spanRe = /<span[^>]*>([^:<>]+):\s*([^<]+)<\/span>/gi;
      let sm;
      while ((sm = spanRe.exec(metaInner[1])) !== null) {
        fields[stripTags(sm[1]).trim()] = stripTags(sm[2]).trim();
      }
    }
    // Summary: <div class="field"><strong>Incident Summary:</strong> …</div>
    const summaryP = inner.match(/<div class="field"[^>]*><strong>Incident Summary:[^<]*<\/strong>\s*([\s\S]*?)<\/div>/i)
      || inner.match(/<p><strong>Incident Summary:[^<]*<\/strong>\s*([\s\S]*?)<\/p>/i);
    const summary = summaryP ? stripTags(summaryP[1]).trim() : '';
    const sources = extractLinks(inner);
    incidents.push({ title, badges, fields, summary, sources });
  }
  return incidents;
}

/** disaster events: <div class="card"><h3>Title</h3><div class="row"><span class="tag">…</span><span class="tag">Decision: <span class="status escalate|monitor">…</span></span>…</div><div>body text</div><div class="row">links</div></div>
 *  Severity comes from <span class="status escalate|monitor"> inside the row.
 *  (old DOM used <div class="event-card indicator escalate|monitor"> with <h4 class="event-title">) */
function extractEventsDisaster(html) {
  const events = [];
  // Only scan the "Event Cards by Decision Level" section so we don't grab
  // the Top Five Critical Events priority cards (which have a different shape).
  const section = extractSection(html, 'Event Cards by Decision Level') || html;
  const re = /<div class="card"[^>]*>/gi;
  let m;
  while ((m = re.exec(section)) !== null) {
    const inner = extractBalancedDiv(section, m.index);
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!h3) continue; // skip non-event cards (e.g. kpi wrappers)
    const title = stripTags(h3[1]).trim();
    // Severity from <span class="status escalate|monitor|ignore">…</span>
    const statusM = inner.match(/<span class="status\s+(escalate|monitor|ignore)"[^>]*>/i);
    const severity = statusM ? statusM[1].toLowerCase() : 'monitor';
    // Chips: <span class="tag">Key: Value</span> or <span class="tag">Value</span>
    const chips = [];
    const tagRe = /<span class="tag"[^>]*>([\s\S]*?)<\/span>/gi;
    let tm;
    while ((tm = tagRe.exec(inner)) !== null) {
      const t = stripTags(tm[1]).trim();
      if (t) chips.push(t);
    }
    // Body text: the bare <div> after the row (not a .row/.tag/.status wrapper)
    const rowM = inner.match(/<div class="row"[^>]*>[\s\S]*?<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/i);
    const text = rowM ? stripTags(rowM[1]).trim() : '';
    const sources = extractLinks(inner);
    events.push({ title, severity, text, chips, sources });
  }
  return events;
}

/** maritime priority: <div class="card priority monitor-accent"><div class="title">N) Title</div><div class="tags">…</div><div class="why">Why it matters: …</div>…</div>
 *  (old DOM used <div class="priority"> with <h3><span class="num">) */
function extractPriorityMaritime(html) {
  const cards = [];
  const section = extractSection(html, 'Top Five Priority Threats') || '';
  // Match <div class="card priority monitor-accent col-6"> (class list, not exact)
  const re = /<div class="card\s+priority[^"]*"[^>]*>/gi;
  let m;
  while ((m = re.exec(section)) !== null) {
    const inner = extractBalancedDiv(section, m.index);
    // Title: <div class="title">N) Title</div> (new) or <h3>…</h3> (old)
    const titleDiv = inner.match(/<div class="title"[^>]*>([\s\S]*?)<\/div>/i);
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const num = h3 ? (h3[1].match(/<span class="num"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] : '';
    const title = titleDiv ? stripTags(titleDiv[1]).trim() : (h3 ? stripTags(h3[1]).trim() : '');
    // "Why it matters: …" in <div class="why"> (new) or before <ul> (old)
    const whyDiv = inner.match(/<div class="why"[^>]*>([\s\S]*?)<\/div>/i);
    const whyMatch = inner.match(/Why it matters:\s*([\s\S]*?)(?=<ul|<a|<div class="why"|$)/i);
    const action = whyDiv ? stripTags(whyDiv[1]).replace(/^Why it matters:\s*/i, '').trim() : (whyMatch ? stripTags(whyMatch[1]).trim() : '');
    const ul = inner.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
    const items = ul ? extractListItems(ul[1]) : [];
    const sources = extractLinks(inner);
    cards.push({ title, action, items, sources, ...(num ? { rank: stripTags(num).trim() } : {}) });
  }
  return cards;
}

/** maritime events: <div class="event-card event-escalate|event-monitor|event-ignore"><div class="event-head"><div class="event-title">Title</div><div class="status monitor">THREAT LEVEL: MODERATE</div></div><div class="meta">…</div><ul>…</ul>sources</div>
 *  Severity comes from the class suffix (event-escalate/event-monitor/event-ignore)
 *  and/or the THREAT LEVEL text. (old DOM used <div class="event-card"> with <h4>) */
function extractEventsMaritime(html) {
  const events = [];
  const section = extractSection(html, 'Intelligence Event Cards') || '';
  // event-card may carry a severity suffix; fall back to bare event-card.
  const re = /<div class="event-card(?:\s+event-(escalate|monitor|ignore))?"[^>]*>/gi;
  let m;
  while ((m = re.exec(section)) !== null) {
    const classSeverity = m[1] ? m[1].toLowerCase() : null;
    const inner = extractBalancedDiv(section, m.index);
    // Title: <div class="event-title">Title</div> (new) or <h4>Title</h4> (old)
    const titleM = inner.match(/<div class="event-title"[^>]*>([\s\S]*?)<\/div>/i)
      || inner.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    const title = titleM ? stripTags(titleM[1]).trim() : '';
    const meta = inner.match(/<div class="meta"[^>]*>([\s\S]*?)<\/div>/i)
      || inner.match(/<div class="event-meta"[^>]*>([\s\S]*?)<\/div>/i);
    const kicker = inner.match(/<div class="kicker"[^>]*>([\s\S]*?)<\/div>/i);
    const ul = inner.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
    // Severity: class suffix > THREAT LEVEL text > monitor default
    let severity = classSeverity || 'monitor';
    if (meta) {
      const lvl = meta[1].match(/THREAT LEVEL:\s*(\w+)/i)
        || meta[1].match(/<div class="status\s+(\w+)"[^>]*>/i);
      if (lvl) {
        const t = lvl[1].toLowerCase();
        if (t === 'critical' || t === 'high' || t === 'escalate') severity = 'escalate';
        else if (t === 'medium' || t === 'low' || t === 'monitor') severity = 'monitor';
        else if (t === 'ignore') severity = 'ignore';
      }
    }
    const text = (kicker ? stripTags(kicker[1]).trim() : '') + (ul ? ' ' + stripTags(ul[1]).trim() : '');
    const items = ul ? extractListItems(ul[1]) : [];
    const sources = extractLinks(inner);
    events.push({ title, severity, text: text.trim(), chips: [], sources, ...(items.length ? { items } : {}) });
  }
  return events;
}

// ─── Per-type parsers ──────────────────────────────────────────────────

function parseCyberBrief(html, date) {
  const threatLevel = (() => {
    // <span class="level-pill lvl-critical">Overall Threat Level: CRITICAL</span>
    // (was <div class="level-pill"> in the old DOM)
    const pill = html.match(/<(?:span|div) class="level-pill[^>]*>([\s\S]*?)<\/(?:span|div)>/i);
    return pill ? stripTags(pill[1]).trim() : '';
  })();

  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  // Key Findings: <div class="finding">N) Title. Summary <a>…</a></div> (new DOM)
  // or <li> bullets (old DOM). Extract both.
  const kfSection = extractSection(html, 'Key Findings');
  const kfFindingItems = [];
  const findingRe = /<div class="finding"[^>]*>([\s\S]*?)<\/div>/gi;
  let fm;
  while ((fm = findingRe.exec(kfSection)) !== null) {
    const t = stripTags(fm[1]).trim();
    if (t) kfFindingItems.push(t);
  }
  const kfItems = kfFindingItems.length > 0 ? kfFindingItems : extractListItems(kfSection);
  const keyFindings = kfItems.map((item) => {
    const colonIdx = item.indexOf(':');
    if (colonIdx > 0 && colonIdx < 80) {
      return { title: item.slice(0, colonIdx).trim(), summary: item.slice(colonIdx + 1).trim() };
    }
    // "N) Title. Summary" — split on first ". " or ") "
    const paren = item.match(/^\s*\d+\)\s*([^.]*)\.\s*(.*)$/);
    if (paren) return { title: paren[1].trim(), summary: paren[2].trim() };
    return { title: item.slice(0, 80), summary: item };
  });

  const kpis = extractKpisCyber(html);

  // Threat Dashboard: dash-cards with h4 + note
  const dashboardSection = extractSection(html, 'Threat Dashboard');
  const dashboardCards = extractCardsCyberDash(dashboardSection);
  const dashboardMap = {};
  for (const dc of dashboardCards) {
    const key = dc.title.toLowerCase();
    dashboardMap[key] = dc;
  }
  // Actively Exploited — the dedicated "Actively Exploited Focus" section is
  // bullets (not chips); the better source is the Threat Dashboard card
  // "Perimeter Devices Under Active Exploit" whose .note is a comma list.
  const activelyExploited = (() => {
    const dashCard = dashboardMap['perimeter devices under active exploit'];
    if (dashCard?.text) {
      return dashCard.text.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
    }
    return extractChips(extractSection(html, 'Actively Exploited Focus'));
  })();

  const vendorsSection = extractSection(html, 'Affected Vendors');
  const vendors = [...new Set(extractChips(vendorsSection))];
  const sectorsSection = extractSection(html, 'Affected Sectors');
  const sectors = [...new Set(extractChips(sectorsSection))];

  const topThreats = extractCardsCyberPriority(extractSection(html, 'Top Five Priority Threats')).map((c) => ({
    title: c.title,
    action: c.action,
    sources: c.sources,
  }));

  // Threat Actor Activity — bullets under section
  const threatActorsSection = extractSection(html, 'Threat Actor Activity');
  const threatActorItems = extractListItems(threatActorsSection);
  const threatActors = threatActorItems.length > 0 ? [{ category: 'Activity', items: threatActorItems }] : [];

  // CVE Watch — "New/Notable OT CVEs and Issues" section bullets
  const cveWatchSection = extractSection(html, 'New/Notable OT CVEs');
  const cveWatchItems = extractListItems(cveWatchSection);
  const cveWatch = cveWatchItems.length > 0 ? [{ category: 'New/Notable OT CVEs and Issues', items: cveWatchItems }] : [];

  const events = extractEventsCyber(html);

  const ttpSection = extractSection(html, 'TTPs and MITRE ATT') || extractSection(html, 'TTPs');
  const ttpItems = extractListItems(ttpSection);
  const mitreIds = [...new Set(ttpItems.join(' ').match(/T\d{4}(?:\.\d{3})?/g) || [])];

  const outlookSection = extractSection(html, 'Next 72');
  const outlook = stripTags(outlookSection).trim();

  const allCves = [...new Set(
    (html.match(/CVE[\-\u2011]\d{4}[\-\u2011]\d{4,}/gi) || [])
      .map((c) => c.toUpperCase().replace(/[\u2011]/g, '-'))
  )];

  return {
    type: 'cyber',
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

function parseDeepfakeBrief(html, date) {
  const executiveSummary =
    stripTags(extractSection(html, 'Executive Overview')).trim() ||
    stripTags(extractSection(html, 'Executive Summary')).trim();

  // Risk Outlook: "Assessment: Worsening"
  const riskSection = extractSection(html, 'Risk Outlook');
  const riskMatch = riskSection.match(/Assessment:\s*(\w+)/i) || html.match(/Assessment:\s*(\w+)/i);
  const riskOutlook = riskMatch ? riskMatch[1] : '';

  const kfSection = extractSection(html, 'Key Findings');
  const kfItems = extractListItems(kfSection);
  const keyFindings = kfItems.map((item) => {
    const colonIdx = item.indexOf(':');
    if (colonIdx > 0 && colonIdx < 80) {
      return { title: item.slice(0, colonIdx).trim(), summary: item.slice(colonIdx + 1).trim() };
    }
    return { title: item.slice(0, 80), summary: item };
  });

  const incidents = extractIncidentsDeepfake(html);

  const emergingTrends = extractListItems(extractSection(html, 'Emerging Trends'));
  const geographicObservations = extractListItems(extractSection(html, 'Geographic Observations'));
  const detectionDevelopments = extractListItems(extractSection(html, 'Detection and Defensive'));

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
  };
}

function parseDisasterBrief(html, date) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  const overallThreat = (() => {
    // <span class="lvl">Severe</span> (new DOM) or <span class="flag escalate">ESCALATE</span> (old)
    const lvl = html.match(/<span class="lvl"[^>]*>([^<]+)<\/span>/i);
    if (lvl) return stripTags(lvl[1]).trim().toLowerCase();
    const flag = html.match(/<span class="flag\s+(\w+)"[^>]*>([^<]+)<\/span>/i);
    if (flag) return stripTags(flag[2]).trim().toLowerCase();
    const kpiEsc = html.match(/<div class="kpi\s+(escalate|monitor)"[^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/i);
    if (kpiEsc) return stripTags(kpiEsc[2]).trim().toLowerCase();
    return '';
  })();

  const kpis = extractKpisDisaster(html);

  const allEvents = extractEventsDisaster(html);
  const escalateEvents = allEvents.filter((e) => e.severity === 'escalate');
  const monitorEvents = allEvents.filter((e) => e.severity === 'monitor');

  // Top Five Critical Events — <div class="card priority"><div class="severity">Priority N</div><h3>Title</h3><div class="muted">text</div>…</div>
  const topSection = extractSection(html, 'Top Five Critical Events');
  const topEvents = [];
  const re = /<div class="card priority"[^>]*>/gi;
  let m;
  while ((m = re.exec(topSection)) !== null) {
    const inner = extractBalancedDiv(topSection, m.index);
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = h3 ? stripTags(h3[1]).trim() : '';
    // Body text: <div class="muted">…</div> (new) or <p>…</p> (old)
    const muted = inner.match(/<div class="muted"[^>]*>([\s\S]*?)<\/div>/i);
    const p = inner.match(/<p>([\s\S]*?)<\/p>/i);
    const text = muted ? stripTags(muted[1]).trim() : (p ? stripTags(p[1]).trim() : '');
    topEvents.push({ title, severity: 'escalate', text, sources: extractLinks(inner) });
  }
  // Fallback: if priority cards not found, use first 5 escalate events
  const topEventsFinal = topEvents.length > 0 ? topEvents.slice(0, 5) : escalateEvents.slice(0, 5);

  const outlookSection = extractSection(html, 'Next 72');
  const outlook = stripTags(outlookSection).trim();

  const regionalTrends = extractListItems(extractSection(html, 'Regional and Hazard'));

  // Key Findings — bullets list
  const kfItems = extractListItems(extractSection(html, 'Key Findings'));
  const keyFindings = kfItems.map((item) => {
    const colonIdx = item.indexOf(':');
    if (colonIdx > 0 && colonIdx < 80) {
      return { title: item.slice(0, colonIdx).trim(), summary: item.slice(colonIdx + 1).trim() };
    }
    return { title: item.slice(0, 80), summary: item };
  });

  return {
    type: 'disaster',
    date,
    overallThreat,
    executiveSummary,
    dashboard: { kpis },
    keyFindings,
    topEvents: topEventsFinal,
    escalateEvents,
    monitorEvents,
    outlook72h: outlook,
    regionalTrends,
  };
}

function parseMaritimeBrief(html, date) {
  const executiveSummary = stripTags(extractSection(html, 'Executive Summary')).trim();

  // Threat level: "Current Level: MODERATE." (new DOM) or "Assessed Threat Level: HIGH" (old)
  const tlSection = extractSection(html, 'Overall Maritime Cyber Threat Level');
  let threatLevel = 'Unknown';
  const tlMatch = tlSection.match(/(?:Current Level|Assessed Threat Level):\s*(\w+)/i);
  if (tlMatch) threatLevel = tlMatch[1];

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

  // Key Findings — section 5 bullets
  const kfItems = extractListItems(extractSection(html, 'Key Findings'));
  const keyFindings = kfItems;

  // CVE Watch — section 17
  const cveWatchItems = extractListItems(extractSection(html, 'Vulnerability and CVE Watch'));
  const cveWatch = cveWatchItems.length > 0 ? [{ category: 'Vulnerability and CVE Watch', items: cveWatchItems }] : [];

  // TTPs — section 20
  const ttpItems = extractListItems(extractSection(html, 'TTPs and MITRE ATT'));
  const mitreIds = [...new Set(ttpItems.join(' ').match(/T\d{4}(?:\.\d{3})?/g) || [])];

  // Affected Vendors / Sectors
  const vendors = extractChips(extractSection(html, 'Affected Vendors'));
  const sectors = extractChips(extractSection(html, 'Affected Maritime Sectors'));

  const outlook = stripTags(extractSection(html, 'Next 72-Hour Maritime Cyber Outlook')).trim();

  const allCves = [...new Set(
    (html.match(/CVE[\-\u2011]\d{4}[\-\u2011]\d{4,}/gi) || [])
      .map((c) => c.toUpperCase().replace(/[\u2011]/g, '-'))
  )];

  return {
    type: 'maritime',
    date,
    threatLevel,
    executiveSummary: executiveSummary || stripTags(html).slice(0, 2048),
    dashboard: { kpis: kpis.length > 0 ? kpis : [{ value: 'N/A', label: 'No KPI data' }], vendors, sectors },
    keyFindings,
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

// ─── Main ──────────────────────────────────────────────────────────────

if (!existsSync(STAGING)) {
  console.error(`✘ Staging folder missing: ${STAGING}`);
  console.error('  Run: node scripts/sync-daily-briefs.mjs first.');
  process.exit(1);
}

for (const t of BRIEF_TYPES) mkdirSync(join(OUT, t), { recursive: true });

// Load existing index to merge with new data (preserve historical briefs)
let existingIndex = { briefs: [] };
const indexPath = join(OUT, 'index.json');
if (existsSync(indexPath)) {
  try { existingIndex = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { /* ignore corrupt index */ }
}
const existingBriefs = new Map((existingIndex.briefs ?? []).map((b) => [`${b.type}:${b.date}`, b]));
const mergedBriefs = new Map(existingBriefs);
const briefCounts = { cyber: 0, deepfake: 0, disaster: 0, maritime: 0 };

const parsers = {
  cyber: parseCyberBrief,
  deepfake: parseDeepfakeBrief,
  disaster: parseDisasterBrief,
  maritime: parseMaritimeBrief,
};

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

  const existing = mergedBriefs.get(`${type}:${date}`);
  if (existing && existing.sizeBytes === newSize) {
    console.log(`  ─ ${type} ${date} (unchanged, ${newSize} bytes)`);
    briefCounts[type]++;
    continue;
  }

  writeFileSync(outPath, JSON.stringify(parsed, null, 2));
  mergedBriefs.set(`${type}:${date}`, { type, date, sizeBytes: newSize });
  briefCounts[type]++;
  console.log(`  ✔ ${type} ${date} (${newSize} bytes)`);
}

// Prune index entries whose body file no longer exists (e.g. stale
// entries from a broken parser that were deleted). Keeps the index
// honest so the UI doesn't list dates that 404 on fetch.
const allBriefs = [...mergedBriefs.values()]
  .filter((b) => existsSync(join(OUT, b.type, `${b.date}.json`)))
  .sort((a, b) => b.date.localeCompare(a.date));
const counts = { cyber: 0, deepfake: 0, disaster: 0, maritime: 0 };
for (const b of allBriefs) counts[b.type] = (counts[b.type] || 0) + 1;
const index = {
  source: 'agentic-ai-daily-reports.netlify.app',
  license: 'MIT',
  generatedAt: new Date().toISOString().slice(0, 10),
  counts,
  briefs: allBriefs,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));

console.log('\n✔ Built:');
for (const t of BRIEF_TYPES) {
  console.log(`    ${briefCounts[t]} ${t} brief(s) new/updated`);
}
console.log(`    ${allBriefs.length} total briefs in index`);
console.log(`    1 index (public/data/daily-briefs/index.json)`);
