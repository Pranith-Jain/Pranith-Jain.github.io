#!/usr/bin/env node
/**
 * Build / refresh the CERT-In advisories index.
 *
 * CERT-In's site is JS-rendered, but each advisory's detail page is
 * server-side HTML at:
 *   https://www.cert-in.org.in/s2cMainServlet?pageid=PUBVLNOTES02&VLCODE=CIAD-YYYY-NNNN
 *
 * The page has stable `class="contentTD..."` anchors for:
 *   - Original Issue Date:
 *   - Severity Rating: Critical / High / Medium / Low
 *   - Systems Affected (followed by a list of vendor / product)
 *   - Overview / Description (free text)
 *   - CVE links to cve.mitre.org
 *
 * Usage:
 *   node scripts/build-cert-in-index.mjs                 # refresh all existing entries in index
 *   node scripts/build-cert-in-index.mjs CIAD-2024-0063  # add/update specific IDs
 *
 * Output:
 *   public/data/cert-in/index.json — array of advisories sorted newest-first
 *
 * Safe to run repeatedly; existing entries with the same CIAD-YYYY-NNNN are
 * replaced in place (their position in the sort is recomputed).
 *
 * Modes:
 *   --from-cache  Parse HTML files in public/data/cert-in/_cache/ (useful
 *                 for offline re-builds and CI). Copy .cache/cert-in/*.html
 *                 into public/data/cert-in/_cache/ first.
 *   --discover    Probe CIAD-YYYY-NNNN over a year range and print the IDs
 *                 that exist on CERT-In. Used by the cert-in-sync action to
 *                 find new advisories without an upstream listing API.
 *                 Pair with `--year YYYY` to scope to a single year.
 *   <id> [<id>…] Fetch live advisories from CERT-In and update the index.
 *                 Fetches the given CIAD-YYYY-NNNN IDs and inserts them
 *                 into the existing index, replacing any matching entries.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const INDEX = join(ROOT, 'public/data/cert-in/index.json');
const DETAIL_URL = (id) =>
  `https://www.cert-in.org.in/s2cMainServlet?pageid=PUBVLNOTES02&VLCODE=${id}`;
const UA = 'pranithjain-dfir/1.0 (CERT-In advisory indexer)';

/** Fetch one advisory's HTML, with a 12s timeout. */
async function fetchAdvisory(id) {
  const url = DETAIL_URL(id);
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`upstream ${res.status} for ${id}`);
  // CERT-In's servlet emits ISO-8859-1 — decode accordingly so accented
  // vendor names (e.g. "D-Link") survive.
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder('iso-8859-1').decode(buf);
}

/** Parse the advisory HTML into a normalised record. */
export function parseAdvisory(id, html) {
  // Normalise whitespace and decode the few HTML entities CERT-In uses.
  const cleanEntities = (s) =>
    s
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  // Pull every contentTD-style cell. CERT-In uses a few tag names (<p>,
  // <span>, sometimes <td>) and the class value mixes cases and contains
  // a stray semicolon (e.g. `ContentTD; subhead`, `contentTD; red`,
  // `contentTD; verblue`, `contentTD2`).
  const cellPattern =
    /<(?:p|span|td|div)\b[^>]*?\bclass\s*=\s*["']?([^"'\s>]*contenttd[^"'\s>]*)["']?[^>]*>([\s\S]*?)<\/(?:p|span|td|div)>/gi;
  const cells = [];
  for (const m of html.matchAll(cellPattern)) {
    cells.push({ cls: (m[1] || '').trim().toLowerCase(), body: cleanEntities(m[2]) });
  }

  const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // The "Original Issue Date" and "Severity Rating" labels frequently
  // share a single cell (e.g. `Original Issue Date:&nbsp;Feb 27, 2025
  // Severity Rating: High`). `findLabel` returns the text that follows
  // the label inside whichever cell it lives in.
  const STOPPERS = [
    'Original Issue Date', 'Issue Date', 'Severity Rating', 'Severity',
    'Software Affected', 'Systems Affected', 'Overview', 'Description',
    'Solution', 'Workaround', 'Vendor Information', 'References', 'CVE Name',
  ];
  function findLabel(label) {
    // Escape regex metacharacters in the label.
    const esc = label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    // Build a lookahead that stops at any of the other known section
    // headers (or end of string).
    const alt = STOPPERS
      .filter((s) => s.toLowerCase() !== label.toLowerCase())
      .map((s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .join('|');
    const re = new RegExp(
      esc + '\\s*:?\\s*(.+?)(?=\\s+(?:' + alt + ')\\b|$)',
      'i'
    );
    for (const c of cells) {
      const flat = stripTags(c.body);
      const m = flat.match(re);
      if (m) return m[1].replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  const dateText = findLabel('Original Issue Date') || findLabel('Issue Date');
  const severityText = findLabel('Severity Rating') || findLabel('Severity');

  // CVEs: every hyperlink to cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-...
  const cves = Array.from(
    new Set(
      [...html.matchAll(/cvename\.cgi\?name=(CVE-\d{4}-\d{4,7})/gi)].map((m) => m[1].toUpperCase())
    )
  ).sort();

  // Description: usually the first contentTD after the "Description" header.
  let description = '';
  const descHeader = cells.findIndex((c) => /^description\s*$/i.test(stripTags(c.body)));
  if (descHeader >= 0) {
    for (let i = descHeader + 1; i < cells.length; i++) {
      const t = stripTags(cells[i].body);
      if (t.length > 80) {
        description = t.slice(0, 800);
        break;
      }
    }
  }

  // Systems / Software Affected: a comma/semicolon list of products,
  // sometimes in a single cell that uses " versions prior to " as a
  // delimiter (e.g. "PAN-OS 11.2 versions prior to 11.2.4-h4 11.2.5").
  const systemsHdr = cells.findIndex((c) =>
    /^(systems\s*affected|software\s*affected)\s*$/i.test(stripTags(c.body))
  );
  let products = [];
  if (systemsHdr >= 0) {
    for (let i = systemsHdr + 1; i < cells.length; i++) {
      const t = stripTags(cells[i].body);
      if (!t) continue;
      // Stop at the next known section header.
      if (/^(overview|description|solution|workaround|vendor\s*information|references?|credit|cve\s*name)\b/i.test(t)) break;
      products.push(t);
    }
    products = products
      .join(' ')
      .split(/[,;\n]+|\s+versions\s+prior\s+to\s+/i)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 1 && p.length < 200 && !/^\d/.test(p))
      .slice(0, 25);
  }

  // Reference CVE strings may also appear as plain text in the body — pick
  // them up as a fallback when the regex above finds nothing.
  if (cves.length === 0) {
    const textOnly = stripTags(html);
    const fallback = [...textOnly.matchAll(/\b(CVE-\d{4}-\d{4,7})\b/gi)].map((m) => m[1].toUpperCase());
    cves.push(...Array.from(new Set(fallback)).sort());
  }

  return {
    id, // CIAD-YYYY-NNNN
    published_at: normaliseDate(dateText),
    severity: normaliseSeverity(severityText),
    cves,
    products_affected: products,
    description: description || '',
    detail_url: DETAIL_URL(id),
    summary: buildSummary(severityText, cves, products),
    indexed_at: new Date().toISOString(),
  };
}
function normaliseDate(s) {
  if (!s) return '';
  // CERT-In emits "December  18, 2024" (double-space sometimes).
  const cleaned = s.replace(/\s+/g, ' ').trim();
  // Parse as local-date parts so we don't drift across the date line in
  // non-UTC timezones (Date(...) is UTC; toISOString can subtract a day).
  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const monthNames = ['january','february','march','april','may','june',
                        'july','august','september','october','november','december'];
    const month = monthNames.indexOf(m[1].toLowerCase());
    if (month >= 0) {
      const dd = String(Number(m[2])).padStart(2, '0');
      const mm = String(month + 1).padStart(2, '0');
      return `${m[3]}-${mm}-${dd}`;
    }
  }
  // Fall back to a generic Date parse.
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return cleaned;
  return d.toISOString().slice(0, 10);
}

function normaliseSeverity(s) {
  const t = s.toLowerCase();
  if (t.includes('critical')) return 'critical';
  if (t.includes('high')) return 'high';
  if (t.includes('medium')) return 'medium';
  if (t.includes('low')) return 'low';
  return 'unknown';
}

function buildSummary(severity, cves, products) {
  const parts = [];
  if (severity) parts.push(`${severity.toUpperCase()} severity`);
  if (cves.length > 0) parts.push(`${cves.length} CVE${cves.length === 1 ? '' : 's'}`);
  if (products.length > 0) parts.push(`affects ${products.length} product${products.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}


/**
 * Discover advisory IDs that exist on CERT-In by probing CIAD-YYYY-NNNN
 * over a year range. The site's listing page is JS-rendered, so this is
 * the only fully-automated way to enumerate new advisories. CERT-In's
 * "page not found" shell is ~53KB; a real advisory is 70-110KB and
 * contains the `contentTD; red` cell with the issue date.
 *
 * Returns a sorted array of IDs (newest first). Rate-limited to
 * ~1 req/sec to be polite.
 */
async function discoverAdvisories(opts = {}) {
  const { years = [new Date().getUTCFullYear(), new Date().getUTCFullYear() - 1], maxSeq = 100, minBytes = 60000, sleepMs = 1100 } = opts;
  const found = [];
  // Newest year first, highest seq first.
  const tries = [];
  for (const y of years) {
    for (let seq = maxSeq; seq >= 1; seq--) {
      tries.push(`CIAD-${y}-${String(seq).padStart(4, '0')}`);
    }
  }
  console.log(`Probing ${tries.length} candidate IDs across years ${years.join(", ")}…`);
  let i = 0;
  for (const id of tries) {
    i++;
    try {
      const html = await fetchAdvisory(id);
      // Size + content sniff: the shell page is exactly the wrong shape.
      if (html.length < minBytes) continue;
      if (!/contentTD;\s*red/i.test(html) && !/contentTD\s*red/i.test(html)) continue;
      // Quick date sniff: real advisories always have an "Original Issue Date" or
      // a parseable month in the head cell.
      if (!/Original Issue Date|Issue Date|Severity Rating/i.test(html)) continue;
      found.push(id);
      process.stdout.write(`\r  ${i}/${tries.length}  ${found.length} found  latest=${id}     `);
    } catch {
      // 4xx/5xx/timeout — just skip.
    }
    if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
  }
  process.stdout.write("\n");
  return found.sort().reverse();
}

async function main() {
  const args = process.argv.slice(2);
  let existing = [];
  if (existsSync(INDEX)) {
    try {
      existing = JSON.parse(readFileSync(INDEX, 'utf8'));
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }

  const useCache = args.includes('--from-cache');
  const doDiscover = args.includes('--discover');
  // --year YYYY: only probe the given year (default: current + previous).
  const yearFlag = args.indexOf('--year');
  const yearArg = yearFlag >= 0 ? args[yearFlag + 1] : null;
  const positional = args.filter(
    (a, i) => a !== '--from-cache' && a !== '--discover' && !(a === '--year') && i !== yearFlag
  );
  const byId = new Map(existing.map((e) => [e.id, e]));

  // --discover: probe the recent year range and print the discovered IDs
  // (one per line, newest first). Used by the cert-in-sync GitHub Action
  // to find new advisories without an upstream listing API.
  if (doDiscover) {
    const discoverOpts = {};
    if (yearArg && /^\d{4}$/.test(yearArg)) {
      discoverOpts.years = [Number(yearArg)];
    }
    const ids = await discoverAdvisories(discoverOpts);
    console.log(`\nDiscovered ${ids.length} advisories:`);
    for (const id of ids) process.stdout.write(id + '\n');
    process.exit(0);
  }

  if (useCache) {
    const { readFileSync: rfs, existsSync: ex, readdirSync: rds } = await import('node:fs');
    const cacheDir = join(ROOT, 'public/data/cert-in/_cache');
    if (ex(cacheDir)) {
      console.log(`Building index from cache in ${cacheDir}…`);
      const files = rds(cacheDir);
      let count = 0;
      for (const f of files) {
        if (!f.endsWith('.html')) continue;
        const id = f.replace(/\.html$/, '');
        const html = rfs(join(cacheDir, f), 'utf8');
        try {
          const rec = parseAdvisory(id, html);
          if (rec.severity === 'unknown' && rec.cves.length === 0) continue;
          byId.set(id, rec);
          count++;
        } catch (e) { /* skip */ }
      }
      console.log(`  parsed ${count} advisories from cache`);
      const merged = Array.from(byId.values()).sort((a, b) => {
        if (a.published_at && b.published_at) return b.published_at.localeCompare(a.published_at);
        return b.id.localeCompare(a.id);
      });
      mkdirSync(dirname(INDEX), { recursive: true });
      writeFileSync(INDEX, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      console.log(`\nWrote ${merged.length} advisories to ${INDEX}`);
      process.exit(0);
    } else {
      console.log(`No cache found at ${cacheDir}. Run without --from-cache to fetch live.`);
      process.exit(1);
    }
  }

  const toFetch = positional.length > 0 ? positional : existing.map((e) => e.id);

  if (toFetch.length === 0 && !useCache) {
    console.log('No advisories to fetch. Pass CIAD-YYYY-NNNN IDs as args, or seed the index first.');
    process.exit(1);
  }
  let ok = 0;
  let failed = 0;
  for (const id of toFetch) {
    process.stdout.write(`  ${id} ... `);
    try {
      const html = await fetchAdvisory(id);
      const rec = parseAdvisory(id, html);
      if (rec.severity === 'unknown' && rec.cves.length === 0) {
        console.log('SKIP (no severity/CVEs parsed — page may have changed)');
        failed++;
        continue;
      }
      byId.set(id, rec);
      console.log(`ok  [${rec.severity}]  ${rec.cves.length} CVEs  ${rec.products_affected.length} products`);
      ok++;
    } catch (err) {
      console.log(`FAIL  ${err.message ?? err}`);
      failed++;
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => {
    if (a.published_at && b.published_at) return b.published_at.localeCompare(a.published_at);
    return b.id.localeCompare(a.id);
  });

  mkdirSync(dirname(INDEX), { recursive: true });
  writeFileSync(INDEX, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`\nWrote ${merged.length} advisories to ${INDEX}`);
  console.log(`  ok: ${ok}   failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

// Export for the test harness.
export const __test__ = { normaliseDate, normaliseSeverity, buildSummary };

// Only run main() when invoked directly (not when imported for tests).
const isMain = process.argv[1] && process.argv[1].endsWith('build-cert-in-index.mjs');
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
