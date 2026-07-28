/**
 * CTI Mutation Engine — generates novel attack variants from seed patterns
 *
 * Takes a seed attack (campaign, malware, CVE, TTP chain), decomposes it
 * into MITRE ATT&CK kill chain phases, then generates novel variants by
 * swapping techniques, extending chains, and combining actor styles.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { runCompletion } from '../case-study/generation/ai-client';

interface SeedAttack {
  seed_id: string;
  name: string;
  description: string;
  phases: Array<{ phase: string; technique_id: string; technique_name: string; description: string }>;
}

interface MutationVariant {
  variant_id: string;
  title: string;
  mutation_type: string;
  threat_level: string;
  novelty_score: number;
  danger_score: number;
  plausibility: number;
  combined_score: number;
  summary: string;
  phases: Array<{
    phase: string;
    technique_id: string;
    technique_name: string;
    description: string;
    changed_from_seed: boolean;
  }>;
  mitre_chain: string[];
  what_changed: string[];
  why_dangerous: string;
  detection_gaps: string[];
  defensive_actions: string[];
}

const MUTATION_STRATEGIES: Record<string, { name: string; focus: string }> = {
  phase_swap: { name: 'Phase Swap', focus: 'Replace one or more phases with stealthier alternatives' },
  tool_upgrade: { name: 'Tool/Technique Upgrade', focus: 'Use more advanced tools and evasion techniques' },
  chain_extension: { name: 'Chain Extension', focus: 'Add phases the original attack skipped' },
  living_off_the_land: { name: 'Living-off-the-Land', focus: 'Rebuild using only native OS tools (LOLBins)' },
  supply_chain: { name: 'Supply Chain Pivot', focus: 'Add a supply chain compromise before initial access' },
  multi_vector: { name: 'Multi-Vector', focus: 'Launch multiple attack vectors simultaneously' },
};

// ── Seed parsing ───────────────────────────────────────────────────────

export async function parseSeedAttack(
  db: D1Database,
  _ai: unknown,
  rawInput: string,
  seedType: string = 'auto',
  providerKeys: { nvidiaKey?: string; groqKey?: string; googleKey?: string } = {}
): Promise<SeedAttack> {
  const prompt = `Parse this attack input into a structured kill chain.

INPUT: ${rawInput}
TYPE HINT: ${seedType}

Produce a JSON object with EXACTLY this structure:
{
  "name": "Short descriptive name",
  "description": "2-3 sentence summary",
  "phases": [
    {"phase": "initial-access", "technique_id": "T1566.001", "technique_name": "Spearphishing Attachment", "description": "What happens"},
    {"phase": "execution", "technique_id": "T1059.001", "technique_name": "PowerShell", "description": "What happens"}
  ]
}

Include ALL phases present. Use real MITRE ATT&CK technique IDs.
Return ONLY valid JSON.`;

  const result = await runCompletion(
    null,
    {
      system: '',
      user: prompt,
      maxTokens: 2000,
      temperature: 0.5,
    },
    providerKeys
  );

  const response = result.text;
  let raw = response.trim();
  if (raw.startsWith('```')) {
    raw = raw.split('```')[1] || raw;
    if (raw.startsWith('json')) raw = raw.slice(4);
  }

  const startIdx = raw.indexOf('{');
  const endIdx = raw.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not parse seed attack from AI response');
  }

  const parsed = JSON.parse(raw.slice(startIdx, endIdx + 1));
  const seedId = `SEED-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  // Store seed
  await db
    .prepare(
      `
    INSERT INTO cti_mutation_seeds (seed_id, name, description, seed_type, raw_input, phases, source_refs)
    VALUES (?, ?, ?, ?, ?, ?, '[]')
  `
    )
    .bind(
      seedId,
      parsed.name || rawInput.slice(0, 60),
      parsed.description || '',
      seedType,
      rawInput,
      JSON.stringify(parsed.phases || [])
    )
    .run();

  return {
    seed_id: seedId,
    name: parsed.name || rawInput.slice(0, 60),
    description: parsed.description || '',
    phases: parsed.phases || [],
  };
}

// ── Variant generation ─────────────────────────────────────────────────

export async function generateVariants(
  db: D1Database,
  _ai: unknown,
  seed: SeedAttack,
  opts: { count?: number; strategies?: string[]; target_sector?: string } = {},
  providerKeys: { nvidiaKey?: string; groqKey?: string; googleKey?: string } = {}
): Promise<MutationVariant[]> {
  const count = opts.count || 5;
  const strategies = opts.strategies || Object.keys(MUTATION_STRATEGIES);
  const phaseList = seed.phases.map((p) => `${p.phase}: ${p.technique_id} (${p.technique_name})`).join('\n');

  const prompt = `Generate ${count} novel attack variants from this seed attack.

SEED: ${seed.name} — ${seed.description}
KILL CHAIN PHASES:
${phaseList}

MUTATION STRATEGIES (use different ones for each variant):
${strategies.map((s) => `- ${s}: ${MUTATION_STRATEGIES[s]?.focus || s}`).join('\n')}

${opts.target_sector ? `TARGET SECTOR: ${opts.target_sector}` : ''}

Generate ${count} variants. Each variant should use a DIFFERENT mutation strategy.
Return ONLY a JSON array matching this schema:

[{
  "variant_id": "MV-HEXHEX",
  "title": "Descriptive title",
  "mutation_type": "phase_swap",
  "threat_level": "HIGH",
  "novelty_score": 75,
  "danger_score": 80,
  "plausibility": 70,
  "summary": "3 sentences explaining what is novel and dangerous",
  "phases": [{"phase": "initial-access", "technique_id": "T1190", "technique_name": "Name", "description": "What happens", "changed_from_seed": true}],
  "mitre_chain": ["T1190", "T1059"],
  "what_changed": ["Change 1 vs seed", "Change 2 vs seed"],
  "why_dangerous": "Why this variant is dangerous",
  "detection_gaps": ["Gap 1", "Gap 2"],
  "defensive_actions": ["Action 1", "Action 2"]
}]

Rules:
- Each variant must use a DIFFERENT mutation strategy
- Use real MITRE ATT&CK technique IDs
- Return ONLY the JSON array`;

  const result = await runCompletion(
    null,
    {
      system: '',
      user: prompt,
      maxTokens: 3000,
      temperature: 0.8,
    },
    providerKeys
  );

  const response = result.text;
  let raw = response.trim();
  if (raw.startsWith('```')) {
    raw = raw.split('```')[1] || raw;
    if (raw.startsWith('json')) raw = raw.slice(4);
  }

  const startIdx = raw.indexOf('[');
  const endIdx = raw.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not parse variants from AI response');
  }

  const variants: MutationVariant[] = JSON.parse(raw.slice(startIdx, endIdx + 1));

  // Store variants
  const stmt = db.prepare(`
    INSERT INTO cti_mutation_variants (variant_id, seed_id, title, mutation_type, threat_level, novelty_score, danger_score, plausibility, combined_score, summary, phases, mitre_chain, what_changed, why_dangerous, detection_gaps, defensive_actions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const batches: D1PreparedStatement[] = [];
  for (const v of variants) {
    const combined = Math.round((v.novelty_score + v.danger_score + v.plausibility) / 3);
    batches.push(
      stmt.bind(
        v.variant_id,
        seed.seed_id,
        v.title,
        v.mutation_type,
        v.threat_level,
        v.novelty_score,
        v.danger_score,
        v.plausibility,
        combined,
        v.summary,
        JSON.stringify(v.phases),
        JSON.stringify(v.mitre_chain),
        JSON.stringify(v.what_changed),
        v.why_dangerous,
        JSON.stringify(v.detection_gaps),
        JSON.stringify(v.defensive_actions)
      )
    );
  }
  if (batches.length) {
    try {
      await db.batch(batches);
    } catch {
      /* non-critical */
    }
  }

  return variants;
}

// ── Query helpers ──────────────────────────────────────────────────────

export async function getSeeds(db: D1Database): Promise<Array<Record<string, unknown>>> {
  const rows = await db.prepare('SELECT * FROM cti_mutation_seeds ORDER BY created_at DESC LIMIT 20').all();
  return rows.results.map((r) => ({
    ...r,
    phases: JSON.parse(String(r.phases || '[]')),
    source_refs: JSON.parse(String(r.source_refs || '[]')),
  }));
}

export async function getVariantsForSeed(db: D1Database, seedId: string): Promise<Array<Record<string, unknown>>> {
  const rows = await db
    .prepare('SELECT * FROM cti_mutation_variants WHERE seed_id = ? ORDER BY combined_score DESC')
    .bind(seedId)
    .all();
  return rows.results.map((r) => ({
    ...r,
    phases: JSON.parse(String(r.phases || '[]')),
    mitre_chain: JSON.parse(String(r.mitre_chain || '[]')),
    what_changed: JSON.parse(String(r.what_changed || '[]')),
    detection_gaps: JSON.parse(String(r.detection_gaps || '[]')),
    defensive_actions: JSON.parse(String(r.defensive_actions || '[]')),
  }));
}

export async function getTopVariants(db: D1Database, limit = 10): Promise<Array<Record<string, unknown>>> {
  const rows = await db
    .prepare(
      'SELECT v.*, s.name as seed_name FROM cti_mutation_variants v JOIN cti_mutation_seeds s ON v.seed_id = s.seed_id ORDER BY v.combined_score DESC LIMIT ?'
    )
    .bind(limit)
    .all();
  return rows.results.map((r) => ({
    ...r,
    phases: JSON.parse(String(r.phases || '[]')),
    mitre_chain: JSON.parse(String(r.mitre_chain || '[]')),
  }));
}

export async function getMutationStats(db: D1Database): Promise<Record<string, number>> {
  const [seeds, variants, avgScore] = await Promise.all([
    db.prepare('SELECT COUNT(*) as n FROM cti_mutation_seeds').first(),
    db.prepare('SELECT COUNT(*) as n FROM cti_mutation_variants').first(),
    db.prepare('SELECT AVG(combined_score) as avg FROM cti_mutation_variants WHERE combined_score > 0').first(),
  ]);
  return {
    seeds: Number(seeds?.n || 0),
    variants: Number(variants?.n || 0),
    avg_score: Math.round(Number(avgScore?.avg || 0)),
  };
}
