#!/usr/bin/env node
/**
 * Build the Post-Quantum Cryptography manifest under public/data/pqc/.
 *
 * Sources authored PQC reference from scripts/data-src/pqc/pqc.json and
 * slices into a slim index + per-algorithm bodies.
 *
 * Emits:
 *   public/data/pqc/index.json
 *   public/data/pqc/algorithms/<name-slug>.json
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'pqc');
const SRC = join(ROOT, 'scripts', 'data-src', 'pqc', 'pqc.json');

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function main() {
  const now = new Date().toISOString().slice(0, 10);
  const data = JSON.parse(readFileSync(SRC, 'utf8'));

  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  ensureDir(join(OUT, 'algorithms'));

  const algIndex = [];
  for (const a of data.algorithms) {
    const slug = slugify(a.name);
    writeFileSync(join(OUT, 'algorithms', `${slug}.json`), JSON.stringify({ ...a, slug }));
    algIndex.push({ slug, name: a.name, fips: a.fips, type: a.type, status: a.status });
  }

  const index = {
    metadata: {
      description: 'Post-quantum cryptography reference — ML-KEM, ML-DSA, SLH-DSA, FN-DSA, hybrid TLS; harvest-now-decrypt-later threat; crypto inventory classes; readiness assessment',
      totalAlgorithms: algIndex.length,
      totalReadiness: data.readiness.length,
      totalCryptoClasses: data.cryptoClasses.length,
    },
    source: 'NIST FIPS 203/204/205/206, NSA CNSSP-15, IETF TLS hybrid drafts (summarized)',
    sourceUrl: 'https://pranithjain.qzz.io/dfir/pqc',
    license: 'Public standards — summarized reference',
    replicatedAt: now,
    counts: { algorithms: algIndex.length, readiness: data.readiness.length, cryptoClasses: data.cryptoClasses.length },
    algorithmIndex: algIndex,
    models: data.models,
    hndl: data.hndl,
    cryptoClasses: data.cryptoClasses,
    readiness: data.readiness,
  };

  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
  console.log(`✔ Built PQC manifest: ${algIndex.length} algorithms, ${data.readiness.length} readiness items`);
}

main();