/**
 * x-procedure STIX 2.1 object — edge-native port of the core idea from
 * github.com/netandneedle/procedure-extraction-pipeline (Apache-2.0).
 *
 * Upstream centers every bundle on a custom `x-procedure` SDO:
 * "a discrete, repeatable technical implementation that integrates one or
 * more techniques to fulfill a specific adversarial objective as an atomic
 * event within an attack sequence." Names follow `[Verb] [Object] via
 * [Tool/Method]` (e.g. `Download web shell via certutil`).
 *
 * Well-formedness tuple P = { AP, LS, <C> }:
 *  • AP — x_technique_refs (resolved ATT&CK ids, never invented)
 *  • LS — x_log_source_refs (ATT&CK detection-chain projection; on the edge
 *    we emit data-component refs from the ATT&CK index when known, else omit)
 *  • <C> — x_components_refs (ordered observables, one process per quoted command)
 *
 * Fingerprint (upstream utils/fingerprint.py, single impl shared by
 * normalizer+validator):
 *   sha256(sorted(techniques)::sorted(platforms)::sorted(phases))[:32]
 * Instance-not-template: same behavior in two reports = two objects with the
 * same name, different ids; fingerprint groups at query time.
 *
 * Sequencing uses CTID Attack-Flow `precedes` relationships (see
 * api/src/lib/attack-flow.ts buildAttackFlowObjects).
 *
 * License: port of Apache-2.0 upstream design; this file is original code.
 * ATT&CK® is a registered trademark of The MITRE Corporation.
 */

export const X_PROCEDURE_EXT_ID = 'extension-definition--b422519e-c47a-439d-9195-0f16b94fa889';

export interface ProcedureDraftInput {
  name: string;
  description: string;
  techniqueIds: string[];
  platforms?: string[];
  tactics?: string[];
  commandLines?: string[];
  confidence?: number;
  sourceRef?: string;
  procedureType?: 'reporting' | 'hypothetical';
  provenance?: 'prose' | 'code' | 'figure' | 'paraphrased';
}

export interface XProcedureObject {
  type: 'x-procedure';
  spec_version: '2.1';
  id: string;
  created: string;
  modified: string;
  created_by_ref: string;
  name: string;
  description: string;
  extensions: Record<string, { extension_type: string }>;
  x_technique_refs: string[];
  kill_chain_phases: Array<{ kill_chain_name: string; phase_name: string }>;
  x_platforms: string[];
  confidence: number;
  x_source_refs: string[];
  x_procedure_type: 'reporting' | 'hypothetical';
  x_source_provenance: 'prose' | 'code' | 'figure' | 'paraphrased';
  x_fingerprint: string;
  x_components_refs: string[];
  x_log_source_refs?: string[];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'procedure';
}

function uuidv4(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** djb2 hex (sync, edge-safe). Used for deterministic component ids. */
export function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * Fingerprint: sha256 hex of
 * `sorted(techniques).join(',')::sorted(platforms)::sorted(phases)`,
 * truncated to 32 chars. Async (WebCrypto); falls back to djb2-doubled
 * when subtle is unavailable (tests / node w/o webcrypto).
 */
export async function xFingerprint(techniques: string[], platforms: string[], phases: string[]): Promise<string> {
  const canon = `${[...techniques].sort().join(',')}::${[...platforms].sort().join(',')}::${[...phases].sort().join(',')}`;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch {
    return (djb2Hex(canon) + djb2Hex(`1:${canon}`) + djb2Hex(`2:${canon}`) + djb2Hex(`3:${canon}`)).slice(0, 32);
  }
}

/** Name must look like `[Verb] [Object] via [Tool/Method]`. Pure. */
export function isWellFormedProcedureName(name: string): boolean {
  if (!name || name.length < 8 || name.length > 200) return false;
  if (/\b(apt|lazarus|cozy bear|mustang panda)\b/i.test(name)) return false; // no actor names
  return /\bvia\b/i.test(name) || /^[A-Z][a-z]+ [a-z0-9][^]{4,}/.test(name);
}

export interface TupleCheck {
  hasAp: boolean;
  hasLs: boolean;
  hasComponents: boolean;
  errors: string[];
  warnings: string[];
}

/** Grade the P = {AP, LS, <C>} tuple. Pure. */
export function checkProcedureTuple(
  techniqueRefs: string[],
  logSourceRefs: string[],
  componentRefs: string[],
  confidence: number
): TupleCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hasAp = techniqueRefs.length > 0;
  const hasLs = logSourceRefs.length > 0;
  const hasComponents = componentRefs.length > 0;
  if (!hasAp && confidence >= 70) errors.push('missing-techniques@conf>=70');
  if (!hasAp) warnings.push('missing-techniques');
  if (!hasLs && confidence >= 70) errors.push('missing-log-sources@conf>=70');
  if (!hasLs) warnings.push('missing-log-sources');
  if (!hasComponents) warnings.push('missing-components');
  return { hasAp, hasLs, hasComponents, errors, warnings };
}

/** Build one x-procedure + its process observables. */
export async function buildXProcedure(
  draft: ProcedureDraftInput,
  opts: { identityId: string; time: string; techniqueStixIds: Record<string, string> }
): Promise<{ procedure: XProcedureObject; observables: Array<Record<string, unknown>> }> {
  const now = opts.time;
  const id = `x-procedure--${uuidv4()}`;
  const techniqueRefs = draft.techniqueIds
    .map((t) => opts.techniqueStixIds[t])
    .filter((x): x is string => !!x);
  const platforms = (draft.platforms ?? []).slice(0, 10);
  const phases = (draft.tactics ?? []).map((p) => ({ kill_chain_name: 'mitre-attack', phase_name: p })).slice(0, 10);
  const observables: Array<Record<string, unknown>> = [];
  const componentRefs: string[] = [];
  for (const cmd of (draft.commandLines ?? []).slice(0, 20)) {
    const pid = `process--${uuidv4()}`;
    const exe = (cmd.trim().split(/\s+/)[0] ?? '').split(/[\\/]/).pop() ?? '';
    observables.push({ type: 'process', spec_version: '2.1', id: pid, command_line: cmd.slice(0, 2000), x_exe_name: exe.slice(0, 120) });
    componentRefs.push(pid);
  }
  const fingerprint = await xFingerprint(draft.techniqueIds, platforms, draft.tactics ?? []);
  const confidence = Math.min(100, Math.max(0, Math.round(draft.confidence ?? 50)));
  const procedure: XProcedureObject = {
    type: 'x-procedure',
    spec_version: '2.1',
    id,
    created: now,
    modified: now,
    created_by_ref: opts.identityId,
    name: draft.name.slice(0, 200),
    description: draft.description.slice(0, 4000),
    extensions: { [X_PROCEDURE_EXT_ID]: { extension_type: 'new-sdo' } },
    x_technique_refs: techniqueRefs,
    kill_chain_phases: phases,
    x_platforms: platforms,
    confidence,
    x_source_refs: draft.sourceRef ? [draft.sourceRef] : [],
    x_procedure_type: draft.procedureType ?? 'reporting',
    x_source_provenance: draft.provenance ?? 'paraphrased',
    x_fingerprint: fingerprint,
    x_components_refs: componentRefs,
  };
  void slug;
  return { procedure, observables };
}
