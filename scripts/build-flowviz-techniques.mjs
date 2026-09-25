/**
 * Regenerate public/data/flowviz/techniques.json from the pinned MITRE
 * ATT&CK enterprise STIX bundle.
 *
 * Upstream FlowViz pins ATT&CK v18.1 deliberately (v19 renames TA0005
 * Defense Evasion → Stealth and adds TA0112, which would break its
 * TACTIC_NAMES/prompts). We pin the same release so technique ids, names
 * and tactic mappings agree with the ported prompt.
 *
 * Run: node scripts/build-flowviz-techniques.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const PINNED_URL =
  'https://raw.githubusercontent.com/mitre/cti/enterprise-attack-v18.1/enterprise-attack/enterprise-attack.json';
const OUT = new URL('../public/data/flowviz/techniques.json', import.meta.url);

const TACTIC_NAMES = {
  TA0001: 'Initial Access',
  TA0002: 'Execution',
  TA0003: 'Persistence',
  TA0004: 'Privilege Escalation',
  TA0005: 'Defense Evasion',
  TA0006: 'Credential Access',
  TA0007: 'Discovery',
  TA0008: 'Lateral Movement',
  TA0009: 'Collection',
  TA0010: 'Exfiltration',
  TA0011: 'Command and Control',
  TA0040: 'Impact',
};

async function main() {
  process.stdout.write(`Fetching ${PINNED_URL}…\n`);
  const res = await fetch(PINNED_URL, { headers: { 'user-agent': 'pranithjain build-flowviz-techniques' } });
  if (!res.ok) throw new Error(`ATT&CK fetch ${res.status}`);
  const { objects } = await res.json();
  const tactics = new Map();
  for (const o of objects) {
    if (o.type !== 'x-mitre-tactic') continue;
    const ref = (o.external_references ?? []).find((r) => r.source_name === 'mitre-attack');
    if (ref?.external_id) tactics.set(o.id, { id: ref.external_id, name: TACTIC_NAMES[ref.external_id] ?? o.name });
  }
  const out = [];
  for (const o of objects) {
    if (o.type !== 'attack-pattern' || o.revoked || o.x_mitre_deprecated) continue;
    const ref = (o.external_references ?? []).find((r) => r.source_name === 'mitre-attack' && typeof r.external_id === 'string');
    if (!ref || !/^T\d{4}(\.\d{3})?$/.test(ref.external_id)) continue;
    const ts = (o.kill_chain_phases ?? [])
      .filter((p) => p.kill_chain_name === 'mitre-attack')
      .map((p) => tactics.get(`x-mitre-tactic--${p.phase_name}`))
      .filter(Boolean);
    // Fallback: resolve via phase shortname → TA id scan.
    const mapped = ts.length > 0 ? ts : [];
    out.push({ id: ref.external_id, name: o.name, tactics: mapped });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  mkdirSync(new URL('../public/data/flowviz/', import.meta.url), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  process.stdout.write(`Wrote ${out.length} techniques → public/data/flowviz/techniques.json\n`);
}

main().catch((e) => {
  process.stderr.write(`build-flowviz-techniques failed: ${e.message}\n`);
  process.exit(1);
});
