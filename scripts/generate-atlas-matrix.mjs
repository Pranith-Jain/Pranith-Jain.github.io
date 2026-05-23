/**
 * Regenerate src/data/dfir/atlas-matrix.ts from upstream MITRE ATLAS.
 *
 * The static matrix powers /dfir/atlas's grid view. Per-technique detail
 * still loads live from /api/v1/atlas/technique against the same upstream,
 * so this file only needs tactic names, ordering, technique titles, and
 * sub-technique titles + IDs.
 *
 * The local matrix uses dash IDs (`AML-TA0002`, `AML-T0000`) so the URLs
 * stay readable, but the upstream STIX bundle uses dots (`AML.TA0002`).
 * `api/src/routes/atlas.ts` canonicalises both forms before its lookup,
 * so either format works in our paths.
 *
 * Re-run: `node scripts/generate-atlas-matrix.mjs [version]`
 *   Default version is whatever VERSION below pins. Override via argv.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';

const VERSION = process.argv[2] ?? 'v5.6.0';
const SOURCE_URL = `https://raw.githubusercontent.com/mitre-atlas/atlas-data/${VERSION}/dist/ATLAS.yaml`;
const OUT = resolve(import.meta.dirname, '..', 'src', 'data', 'dfir', 'atlas-matrix.ts');

const PRE = `/**
 * AUTO-GENERATED from MITRE ATLAS ${VERSION} (dist/ATLAS.yaml).
 * Do not edit by hand. To resync, run:
 *   node scripts/generate-atlas-matrix.mjs [version]
 *
 * Upstream: https://github.com/mitre-atlas/atlas-data
 * Generated: %DATE% (ATLAS %ATLAS_VERSION%)
 *
 * IDs use dash form (\`AML-T0000\`, \`AML-TA0002\`) locally; the backend
 * lookup at \`api/src/routes/atlas.ts\` canonicalises dot ⇄ dash before
 * querying the live upstream so either form works in URLs.
 */
import type { MitreTechnique, MitreTactic } from './mitre-matrix';

export type { MitreTechnique, MitreTactic };

export const atlasMatrix: MitreTactic[] = `;

function dashId(dotId) {
  // 'AML.T0000.001' → 'AML-T0000.001' (only the first dot becomes a dash —
  // the sub-technique dot in 'T0000.001' is preserved as MITRE renders it).
  return dotId.replace(/^AML\./, 'AML-');
}

function shortName(tacticId) {
  // The upstream YAML doesn't carry MITRE ATT&CK's `x_mitre_shortname`
  // field, so derive one from the lowercased name with spaces → dashes.
  return tacticId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function describe(text, maxLen = 320) {
  if (!text) return '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() + '…' : trimmed;
}

async function main() {
  console.log(`fetching ${SOURCE_URL}…`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ATLAS YAML`);
  const text = await res.text();
  const doc = yaml.load(text);

  const atlasVersion = doc.version ?? VERSION.replace(/^v/, '');
  const matrix = doc.matrices?.[0];
  if (!matrix) throw new Error('no matrices[0] in ATLAS.yaml');

  const tactics = matrix.tactics ?? [];
  const techniques = matrix.techniques ?? [];

  // Group techniques by their `tactics:` field. Each technique declares the
  // tactic IDs it belongs to as an array; a single technique can appear
  // under multiple tactics (the matrix grid is many-to-many).
  const techsByTactic = new Map();
  for (const t of tactics) techsByTactic.set(t.id, []);

  // Detect sub-techniques. ATLAS marks subs with `subtechnique-of: AML.TXXXX`.
  const subtechByParent = new Map(); // parent dotId → [{id,name}]
  for (const tech of techniques) {
    if (tech['subtechnique-of']) {
      const parent = tech['subtechnique-of'];
      const arr = subtechByParent.get(parent) ?? [];
      arr.push({ id: dashId(tech.id), name: tech.name });
      subtechByParent.set(parent, arr);
    }
  }

  // Now bucket the top-level (non-sub) techniques under their declared tactics.
  for (const tech of techniques) {
    if (tech['subtechnique-of']) continue; // subs ride along with their parent
    const declared = Array.isArray(tech.tactics) ? tech.tactics : [];
    if (declared.length === 0) {
      console.warn(`  ! technique ${tech.id} (${tech.name}) declares no tactic — skipped`);
      continue;
    }
    for (const tid of declared) {
      const bucket = techsByTactic.get(tid);
      if (!bucket) {
        console.warn(`  ! technique ${tech.id} references unknown tactic ${tid}`);
        continue;
      }
      bucket.push({
        id: dashId(tech.id),
        name: tech.name,
        description: describe(tech.description),
        subtechniques: subtechByParent.get(tech.id),
      });
    }
  }

  // Emit tactics in the YAML's listed order, which matches the matrix.
  const out = tactics.map((t) => ({
    id: dashId(t.id),
    name: t.name,
    short_name: shortName(t.name),
    description: describe(t.description),
    techniques: techsByTactic.get(t.id) ?? [],
  }));

  let total = 0;
  let subs = 0;
  for (const t of out) {
    total += t.techniques.length;
    for (const tech of t.techniques) subs += (tech.subtechniques?.length ?? 0);
  }
  console.log(`  → ${out.length} tactics, ${total} top-level techniques, ${subs} sub-techniques`);

  const json = JSON.stringify(out, null, 2);
  const header = PRE.replace('%DATE%', new Date().toISOString().slice(0, 10)).replace(
    '%ATLAS_VERSION%',
    `v${atlasVersion}`
  );
  writeFileSync(OUT, `${header}${json};\n`);
  console.log(`wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
