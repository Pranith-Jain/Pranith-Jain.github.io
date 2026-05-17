/**
 * One-off: copy historical briefings from the legacy BRIEFINGS KV namespace
 * into the briefings D1 table. The KV->D1 cutover never backfilled history,
 * so D1 only had the latest (broken) row while ~26 good briefings sat
 * stranded in KV. Idempotent: INSERT OR REPLACE.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';

const KV_NS = 'd7a0a96be0ef452087baef1172bbbe34';
const sh = (c) => execSync(c, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

// Optional CLI filter: `node restore... daily-2026-05-12 weekly-2026-W19`
const only = process.argv.slice(2);
const keys = JSON.parse(sh(`npx wrangler kv key list --namespace-id ${KV_NS} --remote`))
  .map((k) => k.name)
  .filter((n) => n.startsWith('briefing:'))
  .filter((n) => only.length === 0 || only.some((s) => n === `briefing:${s}`));

console.log(`found ${keys.length} briefing keys in KV`);
let ok = 0;
const failed = [];
for (const key of keys) {
  const raw = sh(`npx wrangler kv key get --namespace-id ${KV_NS} --remote ${JSON.stringify(key)}`);
  let b;
  try {
    b = JSON.parse(raw);
  } catch {
    console.warn(`skip ${key}: not JSON`);
    continue;
  }
  if (!b?.slug) {
    console.warn(`skip ${key}: no slug`);
    continue;
  }
  // The served payload caps IOC buckets at 30/type anyway (bucketIocs).
  // Historical KV bodies stored thousands, blowing D1's ~100KB statement
  // limit. Cap the stored body's buckets; keep stats_json's real counts so
  // the list/card still report the true totals.
  if (b.iocs) {
    for (const k of ['urls', 'domains', 'ipv4s', 'hashes']) {
      if (Array.isArray(b.iocs[k]) && b.iocs[k].length > 30) b.iocs[k] = b.iocs[k].slice(0, 30);
    }
  }
  // D1 caps a single SQL statement at ~100KB. A few busy briefings carry
  // hundreds of CVE findings (W19 = 730, 632KB). Keep stats_json's real
  // totals (list/card stay accurate) but adaptively trim the body's
  // sectioned findings — drop one from the largest section at a time —
  // until the serialized body is safely under the limit. The detail page
  // then shows the top findings, exactly like the 30-IOC display cap.
  const LIMIT = 90_000;
  if (Array.isArray(b.sections)) {
    let trimmed = 0;
    while (JSON.stringify(b).length > LIMIT) {
      let big = -1;
      let bigLen = 0;
      b.sections.forEach((s, i) => {
        const n = Array.isArray(s.findings) ? s.findings.length : 0;
        if (n > bigLen) {
          bigLen = n;
          big = i;
        }
      });
      if (big < 0 || bigLen === 0) break;
      b.sections[big].findings.pop();
      trimmed += 1;
    }
    if (trimmed) console.log(`  (trimmed ${trimmed} body findings on ${b.slug} to fit D1; stats_json keeps real totals)`);
  }
  const stmt =
    `INSERT OR REPLACE INTO briefings (slug,type,title,date,date_range,range_start,range_end,stats_json,sources_json,body) VALUES (` +
    [
      q(b.slug),
      q(b.type),
      q(b.title),
      q(b.date),
      q(b.date_range),
      q(b.range_start),
      q(b.range_end),
      q(JSON.stringify(b.stats ?? {})),
      q(JSON.stringify(b.sources ?? [])),
      q(JSON.stringify(b)),
    ].join(',') +
    `);`;
  // One statement per execute — a combined file blows D1's statement-size cap.
  const file = `/tmp/rb-${b.slug}.sql`;
  writeFileSync(file, stmt);
  try {
    sh(`npx wrangler d1 execute pranithjain-briefings --remote --file ${file}`);
    ok += 1;
    console.log(`  ✓ ${b.slug} (findings=${b.stats?.findings ?? '?'}, iocs=${b.stats?.iocs ?? '?'})`);
  } catch (e) {
    failed.push(b.slug);
    console.warn(`  ✘ ${b.slug}: ${String(e).split('\n')[0].slice(0, 120)}`);
  } finally {
    rmSync(file, { force: true });
  }
}
console.log(`done: ${ok} restored, ${failed.length} failed${failed.length ? ' -> ' + failed.join(', ') : ''}`);
