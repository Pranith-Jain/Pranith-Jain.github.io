#!/usr/bin/env node
/**
 * Build the Cloud Security Reference manifest under public/data/cloud-ref/.
 *
 * Sources authored shared-responsibility matrix + cloud hunt queries from
 * scripts/data-src/cloud-ref/ and slices into a slim index + per-query bodies.
 *
 * Emits:
 *   public/data/cloud-ref/index.json   (SRM full + query index + provider counts)
 *   public/data/cloud-ref/queries/<id>.json
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'cloud-ref');
const SRM_SRC = join(ROOT, 'scripts', 'data-src', 'cloud-ref', 'srm.json');
const Q_SRC = join(ROOT, 'scripts', 'data-src', 'cloud-ref', 'hunt-queries.json');

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function main() {
  const now = new Date().toISOString().slice(0, 10);
  const srm = JSON.parse(readFileSync(SRM_SRC, 'utf8'));
  const queries = JSON.parse(readFileSync(Q_SRC, 'utf8'));

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  ensureDir(join(OUT, 'queries'));

  const providerCounts = {};
  const queryIndex = [];
  for (const q of queries) {
    providerCounts[q.provider] = (providerCounts[q.provider] || 0) + 1;
    writeFileSync(join(OUT, 'queries', `${q.id}.json`), JSON.stringify(q));
    queryIndex.push({ id: q.id, name: q.name, provider: q.provider, mitre: q.mitre });
  }

  const index = {
    metadata: {
      description: 'Cloud security reference — shared responsibility matrix (AWS/Azure/GCP × IaaS/PaaS/SaaS × 15 domains) + cloud hunt queries (KQL) across AWS/Azure/GCP/K8s',
      totalDomains: srm.domains.length,
      totalQueries: queries.length,
    },
    source: 'Vendor shared-responsibility documentation (summarized) + authored hunt queries',
    sourceUrl: 'https://pranithjain.qzz.io/dfir/cloud-reference',
    license: 'CC-BY-NC-SA; queries free to reuse',
    replicatedAt: now,
    counts: { domains: srm.domains.length, queries: queries.length, providers: Object.keys(providerCounts).length },
    providerCounts,
    srm,
    queryIndex,
  };

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
  console.log(`✔ Built Cloud Ref manifest: ${srm.domains.length} SRM domains, ${queries.length} hunt queries`);
}

main();