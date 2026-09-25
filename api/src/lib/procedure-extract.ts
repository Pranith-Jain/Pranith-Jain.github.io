/**
 * Procedure extractor — edge-native distillation of the
 * netandneedle/procedure-extraction-pipeline (Apache-2.0) idea.
 *
 * Upstream runs 16 LangGraph stages (Docling parse → entities → chunks →
 * propose→retrieve→validate→pick techniques → drafts → normalize →
 * serialize → validate → distribute → synthesize) with four human review
 * gates, backed by Postgres checkpoints + Neo4j + SecureBERT + Torch.
 * NONE of that runs on Workers; this module implements the portable core:
 *
 *   1. Strict-JSON LLM extraction (entities + behavior chunks + technique
 *      picks + procedure drafts) via runCompletion — modeled on
 *      api/src/lib/extract-llm.ts reconciliation rules.
 *   2. Verbatim grounding: technique picks and command lines must appear
 *      in the source; ATT&CK ids must exist in the index; invented ids
 *      dropped (same defense-in-depth as extract-llm.ts).
 *   3. Human review gates happen OUTSIDE this module (procedures router +
 *      D1 job rows + admin approve) — mirroring upstream gates 0–2 and the
 *      ai_escape_reports pending→approved pattern.
 *
 * Failure mode: never throws — returns { ran, partial, … } like extract-llm.
 */
import type { Env } from '../env';
import { loadedAttackIdIndexOrNull } from './attack-id-lazy';
import { runCompletion as defaultRunCompletion } from '../case-study/generation/ai-client';
import { fenceUntrusted, UNTRUSTED_DATA_SYSTEM_NOTE } from './prompt-fence';
import { parseFlowvizJson } from './flowviz-validate';

export interface ProcedureEntity {
  kind: string;
  value: string;
}

export interface ProcedureChunk {
  id: string;
  text: string;
  excerpt: string;
  order: number;
}

export interface ProcedureTechniquePick {
  chunkId: string;
  techniqueId: string;
  confidence: 'definite' | 'probable' | 'possible';
  quote: string;
}

export interface ProcedureDraft {
  chunkId: string;
  name: string;
  description: string;
  techniqueIds: string[];
  platforms: string[];
  tactics: string[];
  commandLines: string[];
  confidence: number;
}

export interface ProcedureExtraction {
  ran: boolean;
  partial: boolean;
  modelUsed?: string;
  entities: ProcedureEntity[];
  chunks: ProcedureChunk[];
  techniques: ProcedureTechniquePick[];
  drafts: ProcedureDraft[];
  isSequential: boolean;
  notes: string[];
}

export const EMPTY_PROCEDURE_EXTRACTION: ProcedureExtraction = {
  ran: false,
  partial: false,
  entities: [],
  chunks: [],
  techniques: [],
  drafts: [],
  isSequential: false,
  notes: [],
};

const SYSTEM = `You are a CTI procedure extractor. Return ONLY a JSON object with keys: entities[], chunks[], techniques[], drafts[], isSequential.
- entities: [{kind, value}] kinds: actor, malware, tool, campaign, cve, victim, infra. Values must be named in the source.
- chunks: [{id, text, excerpt, order}] one chunk per discrete adversary behavior in attack order. excerpt = 1-3 continuous sentences copied verbatim from the source.
- techniques: [{chunkId, techniqueId, confidence, quote}] techniqueId = MITRE ATT&CK id (Txxxx[.xxx]). confidence in definite/probable/possible. quote = verbatim source span proving THIS technique.
- drafts: [{chunkId, name, description, techniqueIds[], platforms[], tactics[], commandLines[], confidence}] name = "[Verb] [Object] via [Tool/Method]", no actor names. commandLines = ONLY exact command lines quoted in the source (else []). description ends with the observable evidence a defender would see. confidence 0-100.
- isSequential: true when the source narrates an ordered intrusion.
No prose before or after the JSON. ${UNTRUSTED_DATA_SYSTEM_NOTE}`;

function asStr(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

const TECH_RE = /^T\d{4}(\.\d{3})?$/;

/** Verbatim + catalog reconciliation. Pure. */
export function reconcileProcedureExtraction(raw: unknown, sourceText: string, validTechniqueIds: Set<string>): ProcedureExtraction {
  const notes: string[] = [];
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PROCEDURE_EXTRACTION, ran: true, partial: true, notes: ['unparseable'] };
  const r = raw as Record<string, unknown>;
  const hay = sourceText.toLowerCase();

  const entities: ProcedureEntity[] = [];
  if (Array.isArray(r.entities)) {
    for (const e of r.entities.slice(0, 100)) {
      const kind = asStr((e as Record<string, unknown>)?.kind, 40).toLowerCase();
      const value = asStr((e as Record<string, unknown>)?.value, 300).trim();
      if (!kind || !value) continue;
      if (!hay.includes(value.toLowerCase())) {
        notes.push(`dropped-entity-not-verbatim:${value.slice(0, 60)}`);
        continue;
      }
      entities.push({ kind, value });
    }
  }
  const chunks: ProcedureChunk[] = [];
  if (Array.isArray(r.chunks)) {
    let order = 0;
    for (const ch of r.chunks.slice(0, 60)) {
      const id = asStr((ch as Record<string, unknown>)?.id, 60) || `chunk-${order + 1}`;
      const text = asStr((ch as Record<string, unknown>)?.text, 4000).trim();
      const excerpt = asStr((ch as Record<string, unknown>)?.excerpt, 2000).trim();
      if (!text) continue;
      if (excerpt && !hay.includes(excerpt.slice(0, 60).toLowerCase())) {
        notes.push(`chunk-excerpt-not-grounded:${id}`);
      }
      chunks.push({ id, text, excerpt, order: order++ });
    }
  }
  const chunkIds = new Set(chunks.map((c) => c.id));
  const techniques: ProcedureTechniquePick[] = [];
  if (Array.isArray(r.techniques)) {
    for (const t of r.techniques.slice(0, 200)) {
      const o = t as Record<string, unknown>;
      const chunkId = asStr(o.chunkId, 60);
      const techniqueId = asStr(o.techniqueId, 20).toUpperCase();
      const confidence = asStr(o.confidence, 20).toLowerCase();
      const quote = asStr(o.quote, 2000).trim();
      if (!chunkIds.has(chunkId)) {
        notes.push(`dropped-technique-bad-chunk:${techniqueId}`);
        continue;
      }
      if (!TECH_RE.test(techniqueId) || !validTechniqueIds.has(techniqueId)) {
        notes.push(`dropped-technique-unknown:${techniqueId}`);
        continue;
      }
      if (quote && !hay.includes(quote.slice(0, 60).toLowerCase())) {
        notes.push(`technique-quote-not-grounded:${techniqueId}`);
        continue; // upstream demotes unquoted picks; edge build drops them
      }
      techniques.push({
        chunkId,
        techniqueId,
        confidence: confidence === 'definite' || confidence === 'probable' ? confidence : 'possible',
        quote,
      });
    }
  }
  const drafts: ProcedureDraft[] = [];
  if (Array.isArray(r.drafts)) {
    for (const d of r.drafts.slice(0, 60)) {
      const o = d as Record<string, unknown>;
      const chunkId = asStr(o.chunkId, 60);
      const name = asStr(o.name, 200).trim();
      const description = asStr(o.description, 4000).trim();
      if (!chunkIds.has(chunkId) || !name || !description) continue;
      const techniqueIds = Array.isArray(o.techniqueIds)
        ? (o.techniqueIds as unknown[]).map((x) => String(x).toUpperCase()).filter((x) => TECH_RE.test(x) && validTechniqueIds.has(x)).slice(0, 10)
        : [];
      const commandLines = Array.isArray(o.commandLines)
        ? (o.commandLines as unknown[])
            .map((x) => String(x).slice(0, 2000))
            .filter((cmd) => cmd.trim() && hay.includes(cmd.slice(0, 40).toLowerCase()))
            .slice(0, 20)
        : [];
      const droppedCmds = (Array.isArray(o.commandLines) ? (o.commandLines as unknown[]).length : 0) - commandLines.length;
      if (droppedCmds > 0) notes.push(`dropped-fabricated-commands:${chunkId}:${droppedCmds}`);
      drafts.push({
        chunkId,
        name,
        description,
        techniqueIds,
        platforms: Array.isArray(o.platforms) ? (o.platforms as unknown[]).map((x) => String(x).slice(0, 80)).slice(0, 10) : [],
        tactics: Array.isArray(o.tactics) ? (o.tactics as unknown[]).map((x) => String(x).slice(0, 60)).slice(0, 10) : [],
        commandLines,
        confidence: Math.min(100, Math.max(0, Math.round(Number(o.confidence) || 50))),
      });
    }
  }
  return {
    ran: true,
    partial: notes.length > 0,
    entities: entities.slice(0, 100),
    chunks,
    techniques,
    drafts,
    isSequential: r.isSequential === true,
    notes: notes.slice(0, 50),
  };
}

export async function extractProcedures(
  env: Env,
  sourceText: string,
  opts: { runCompletion?: typeof defaultRunCompletion; maxChars?: number } = {}
): Promise<ProcedureExtraction> {
  const text = sourceText.slice(0, opts.maxChars ?? 30000);
  if (text.trim().length < 600) return { ...EMPTY_PROCEDURE_EXTRACTION, ran: false, partial: true, notes: ['too-short'] };
  const run = opts.runCompletion ?? defaultRunCompletion;
  let out: { text: string; modelUsed: string };
  try {
    out = await run(
      env.AI,
      { system: SYSTEM, user: `${fenceUntrusted('REPORT', text)}\n\nExtract procedures from the REPORT above.`, maxTokens: 6000, temperature: 0.1 },
      { role: 'procedure-extract' }
    );
  } catch {
    return { ...EMPTY_PROCEDURE_EXTRACTION, ran: true, partial: true, notes: ['llm-failed'] };
  }
  const parsed = parseFlowvizJson(out.text);
  const index = loadedAttackIdIndexOrNull();
  const valid = new Set(Object.keys(index ?? {}).filter((k) => TECH_RE.test(k)));
  // Without the catalog snapshot, still return the shape but mark partial —
  // technique ids cannot be verified (upstream grades this as error@conf≥70).
  const rec = reconcileProcedureExtraction(parsed, text, valid);
  if (valid.size === 0) rec.notes.push('attack-index-unloaded');
  return { ...rec, modelUsed: out.modelUsed, partial: rec.partial || valid.size === 0 };
}
