#!/usr/bin/env node
// Builds public/data/capec/index.json from the MITRE CAPEC STIX 2.0 bundle
// (https://github.com/mitre/cti, capec/2.0). Clones shallow + sparse
// (capec/ only) into the OS temp dir at build time (override with
// --source <local-cti-dir>), and writes a slim index read at runtime
// through env.ASSETS — no public internet hop.
//
// Usage: node scripts/build-capec-manifest.mjs [--source <dir>]
import { writeFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'capec');
const UPSTREAM_REPO = 'github.com/mitre/cti (CAPEC STIX 2.0)';

function slugify(s) {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'pattern'
  );
}

function ensureRepo() {
  const argIdx = process.argv.indexOf('--source');
  const override = argIdx !== -1 ? process.argv[argIdx + 1] : null;
  if (override) return { dir: override, cleanup: () => {} };
  const dir = join(tmpdir(), `mitre-cti-${Date.now()}`);
  console.log(`  cloning mitre/cti (depth 1, sparse: capec)…`);
  execFileSync(
    'git',
    ['clone', '--depth', '1', '--filter=blob:none', '--sparse', 'https://github.com/mitre/cti', dir],
    { stdio: 'inherit' },
  );
  execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', 'capec'], { stdio: 'inherit' });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const { dir, cleanup } = ensureRepo();
try {
  const apDir = join(dir, 'capec', '2.0', 'attack-pattern');
  const files = readdirSync(apDir).filter((f) => f.endsWith('.json'));
  if (files.length < 400) throw new Error(`only ${files.length} patterns — upstream format changed?`);

  const seen = new Set();
  const entries = [];
  for (const f of files.sort()) {
    const bundle = JSON.parse(readFileSync(join(apDir, f), 'utf8'));
    const ap = (bundle.objects || []).find((o) => o.type === 'attack-pattern');
    if (!ap) continue;
    const capecRef = (ap.external_references || []).find((r) => r.source_name === 'capec');
    const capecId = String(capecRef?.external_id || '');
    const cweIds = (ap.external_references || [])
      .filter((r) => r.source_name === 'cwe' && r.external_id)
      .map((r) => String(r.external_id));
    const attackIds = (ap.external_references || [])
      .filter((r) => /attack/i.test(String(r.source_name)) && r.external_id)
      .map((r) => String(r.external_id));
    const base = slugify(capecId || ap.name);
    let slug = base;
    let n = 2;
    while (seen.has(slug)) slug = `${base}-${n++}`;
    seen.add(slug);
    entries.push({
      slug,
      capecId,
      name: String(ap.name || capecId),
      abstraction: String(ap.x_capec_abstraction || ''),
      status: String(ap.x_capec_status || ''),
      likelihood: String(ap.x_capec_likelihood_of_attack || ''),
      severity: String(ap.x_capec_typical_severity || ''),
      domains: Array.isArray(ap.x_capec_domains) ? ap.x_capec_domains.map(String) : [],
      description: String(ap.description || '').replace(/\s+/g, ' ').trim().slice(0, 600),
      prerequisites: Array.isArray(ap.x_capec_prerequisites)
        ? ap.x_capec_prerequisites.map(String).join(' ').slice(0, 400)
        : '',
      cweIds: [...new Set(cweIds)],
      attackIds: [...new Set(attackIds)],
      url: capecId ? `https://capec.mitre.org/data/definitions/${capecId.replace(/^CAPEC-/, '')}.html` : '',
    });
  }

  const byAbstraction = {};
  const byStatus = {};
  for (const e of entries) {
    byAbstraction[e.abstraction] = (byAbstraction[e.abstraction] ?? 0) + 1;
    byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
  }

  mkdirSync(OUT, { recursive: true });
  const index = {
    source: UPSTREAM_REPO,
    license: 'upstream-collection (summaries only; no vendored content)',
    replicatedAt: new Date().toISOString().slice(0, 10),
    count: entries.length,
    byAbstraction,
    byStatus,
    entries,
  };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  console.log('✔ Built CAPEC manifest:');
  console.log(`    ${entries.length} patterns (${JSON.stringify(byStatus)})`);
} finally {
  cleanup();
}
