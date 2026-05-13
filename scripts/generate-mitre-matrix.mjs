/**
 * Regenerate src/data/dfir/mitre-matrix.ts from the upstream MITRE ATT&CK
 * v19 enterprise-attack.json bundle.
 *
 * The static matrix powers /dfir/mitre's grid view. Per-technique detail
 * still loads live from /api/v1/mitre/technique, so this file only needs
 * tactic names, ordering, technique titles, and sub-technique titles.
 *
 * Re-run: `node scripts/generate-mitre-matrix.mjs`
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BUNDLE_URL =
  'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';

const OUT = resolve(import.meta.dirname, '..', 'src', 'data', 'dfir', 'mitre-matrix.ts');

const PRE = `/**
 * AUTO-GENERATED from MITRE ATT&CK enterprise-attack.json. Do not edit by
 * hand. To resync from upstream, run:
 *   node scripts/generate-mitre-matrix.mjs
 *
 * Upstream: ${BUNDLE_URL}
 * Generated: %DATE% (ATT&CK %VERSION%)
 *
 * This file ships the tactic + technique titles only. Per-technique
 * detail (description, procedures, mitigations) loads live from
 * /api/v1/mitre/technique against the same upstream.
 */

export interface MitreTechnique {
  id: string;
  name: string;
  description?: string;
  subtechniques?: Array<{ id: string; name: string }>;
}

export interface MitreTactic {
  id: string;
  name: string;
  short_name: string;
  description: string;
  techniques: MitreTechnique[];
}

export const mitreMatrix: MitreTactic[] = `;

function externalId(obj) {
  return obj?.external_references?.find((r) => r.source_name === 'mitre-attack')?.external_id;
}

function describe(text, maxLen = 240) {
  if (!text) return '';
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() + '…' : trimmed;
}

async function main() {
  console.log(`fetching ${BUNDLE_URL}…`);
  const res = await fetch(BUNDLE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bundle = await res.json();
  const objects = bundle.objects ?? [];

  // The Enterprise matrix object lists tactic STIX refs in the order they
  // should appear in the kill chain.
  const matrixObj = objects.find((o) => o.type === 'x-mitre-matrix' && externalId(o) === 'enterprise-attack');
  if (!matrixObj) throw new Error('enterprise matrix object not found');
  const orderedTacticRefs = matrixObj.tactic_refs ?? [];

  // Tactic STIX-id → tactic record.
  const tacticById = new Map();
  for (const o of objects) {
    if (o.type !== 'x-mitre-tactic' || o.revoked || o.x_mitre_deprecated) continue;
    tacticById.set(o.id, {
      stixId: o.id,
      id: externalId(o),
      name: o.name,
      short_name: o.x_mitre_shortname,
      description: describe(o.description, 200),
    });
  }

  // Techniques grouped by parent tactic kill-chain phase.
  const byPhase = new Map();
  // is-subtechnique map: parent technique X.id → [{id,name}].
  const subTechs = new Map();

  for (const o of objects) {
    if (o.type !== 'attack-pattern' || o.revoked || o.x_mitre_deprecated) continue;
    if (!o.kill_chain_phases?.some((p) => p.kill_chain_name === 'mitre-attack')) continue;
    const id = externalId(o);
    if (!id) continue;
    if (o.x_mitre_is_subtechnique) {
      const parent = id.split('.')[0];
      if (!subTechs.has(parent)) subTechs.set(parent, []);
      subTechs.get(parent).push({ id, name: o.name });
    } else {
      for (const phase of o.kill_chain_phases) {
        if (phase.kill_chain_name !== 'mitre-attack') continue;
        if (!byPhase.has(phase.phase_name)) byPhase.set(phase.phase_name, []);
        byPhase.get(phase.phase_name).push({ id, name: o.name });
      }
    }
  }

  // Sort sub-techniques numerically (T1059.001 < .002 < .010).
  for (const arr of subTechs.values()) {
    arr.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  // Sort techniques in each tactic by ID (T1001 < T1002).
  for (const arr of byPhase.values()) {
    arr.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  // Build the final ordered tactic list.
  const tactics = [];
  for (const ref of orderedTacticRefs) {
    const tactic = tacticById.get(ref);
    if (!tactic) continue;
    const techs = (byPhase.get(tactic.short_name) ?? []).map((t) => {
      const subs = subTechs.get(t.id);
      return subs && subs.length > 0 ? { ...t, subtechniques: subs } : t;
    });
    tactics.push({
      id: tactic.id,
      name: tactic.name,
      short_name: tactic.short_name,
      description: tactic.description,
      techniques: techs,
    });
  }

  // Version detection — first attempt the marking definition's
  // x_mitre_attack_spec_version on the matrix; fall back to looking at the
  // most-recent modified date.
  const versionObj = objects.find(
    (o) =>
      o.type === 'x-mitre-collection' ||
      (o.type === 'marking-definition' && o.definition_type === 'statement' && /v\d+/.test(o.definition?.statement ?? ''))
  );
  const version =
    versionObj?.x_mitre_version ?? matrixObj?.x_mitre_version ?? matrixObj?.x_mitre_attack_spec_version ?? 'master';

  const totals = {
    tactics: tactics.length,
    techniques: tactics.reduce((n, t) => n + t.techniques.length, 0),
    subtechniques: tactics.reduce(
      (n, t) => n + t.techniques.reduce((m, k) => m + (k.subtechniques?.length ?? 0), 0),
      0
    ),
  };
  console.log(`extracted: ${totals.tactics} tactics / ${totals.techniques} techniques / ${totals.subtechniques} subtechniques (v${version})`);

  const body = JSON.stringify(tactics, null, 2)
    // Switch JSON keys to bare identifiers where TypeScript allows.
    .replace(/^(\s*)"(id|name|short_name|description|techniques|subtechniques)":/gm, '$1$2:')
    .replace(/^/gm, '');

  const header = PRE.replace('%DATE%', new Date().toISOString().slice(0, 10)).replace('%VERSION%', `v${version}`);
  const out = `${header}${body};\n`;
  writeFileSync(OUT, out);
  console.log(`wrote ${OUT} (${out.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
