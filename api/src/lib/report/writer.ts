import type { Ai } from '@cloudflare/workers-types';
import type { TemplateId } from './types';
import type { RankedItem } from './ranker';
import type { Conflict } from './validator';
import { REPORT_TEMPLATES } from './templates';
import { runCompletion as realRunCompletion } from '../../case-study/generation/ai-client';

export interface WriteInput {
  subject: string;
  template: TemplateId;
  evidence: RankedItem[];
  conflicts: Conflict[];
  allowlist?: { cves: string[]; mitre: string[]; actors: string[] };
}
export interface WriteDeps {
  ai: Ai;
  groqKey?: string;
  googleKey?: string;
  runCompletion?: typeof realRunCompletion;
}
export interface WriteOutput {
  executive_summary: string;
  sections: { id: string; heading: string; body_md: string; refs: number[] }[];
  citations: { ref: number; sourceId: string; text: string }[];
  modelUsed: string;
}

const CVE_RE = /CVE-\d{4}-\d{4,}/gi;
const TID_RE = /\bT\d{4}(?:\.\d{3})?\b/g;

function numberEvidence(evidence: RankedItem[]) {
  // [n] refs are 1-based positions into the ranked evidence list.
  return evidence.map((e, i) => ({ ref: i + 1, sourceId: e.sourceId, text: e.text }));
}

function evidenceBlock(citations: { ref: number; text: string }[], refs: number[]): string {
  return citations
    .filter((c) => refs.includes(c.ref))
    .map((c) => `[${c.ref}] ${c.text}`)
    .join('\n');
}

/** Replace any CVE/technique id in prose that is NOT on the allowlist with an [unverified] marker. */
function guard(text: string, allow?: WriteInput['allowlist']): string {
  if (!allow) return text;
  let out = text.replace(CVE_RE, (m) =>
    allow.cves.map((c) => c.toUpperCase()).includes(m.toUpperCase()) ? m : `${m} [unverified]`
  );
  out = out.replace(TID_RE, (m) =>
    allow.mitre.map((t) => t.toUpperCase()).includes(m.toUpperCase()) ? m : `${m} [unverified]`
  );
  return out;
}

export async function writeReport(input: WriteInput, deps: WriteDeps): Promise<WriteOutput> {
  const run = deps.runCompletion ?? realRunCompletion;
  const template = REPORT_TEMPLATES[input.template];
  const citations = numberEvidence(input.evidence);
  let modelUsed = 'none';

  // --- Outline pass ---
  const outlineSys = `You are a CTI analyst producing an OUTLINE. Return ONLY JSON {"sections":[{"id","evidenceRefs":[numbers]}]}. Section ids MUST come from this list: ${template.sections.map((s) => s.id).join(', ')}. Assign each evidence ref to the most relevant section.`;
  const outlineUser = `Subject: ${input.subject}\nEvidence:\n${citations.map((c) => `[${c.ref}] ${c.text}`).join('\n')}`;
  const assignment: Record<string, number[]> = {};
  try {
    const r = await run(
      deps.ai,
      { system: outlineSys, user: outlineUser, maxTokens: 800, temperature: 0.2 },
      { groqKey: deps.groqKey, googleKey: deps.googleKey }
    );
    modelUsed = r.modelUsed;
    const json = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1)) as {
      sections?: { id: string; evidenceRefs?: number[] }[];
    };
    for (const s of json.sections ?? [])
      assignment[s.id] = (s.evidenceRefs ?? []).filter((n) => n >= 1 && n <= citations.length);
  } catch {
    // Fallback: give every section all evidence.
    for (const s of template.sections) assignment[s.id] = citations.map((c) => c.ref);
  }

  // --- Section drafting ---
  const conflictNote = input.conflicts.length
    ? `\nKNOWN CONFLICTS (note explicitly): ${input.conflicts.map((c) => `${c.claim}: ${c.positions.join(' vs ')}`).join('; ')}`
    : '';
  const sections: WriteOutput['sections'] = [];
  for (const def of template.sections) {
    const refs = assignment[def.id] ?? [];
    if (refs.length === 0) continue; // skip sections with no evidence
    const sys =
      `You are a senior CTI analyst writing the "${def.heading}" section of a professional threat report about ${input.subject}. ${def.guidance}\n` +
      `STRICT RULES:\n` +
      `- Write ONLY about ${input.subject}. Do NOT mention, compare to, or draw analogies with any other CVE, product, vendor, version, or incident that is not the subject — even if it appears in the evidence. Unrelated history is noise; omit it.\n` +
      `- Ground every statement in the evidence below and cite inline as [n] using the provided ref numbers. Never contradict the evidence (e.g. if evidence says it is on KEV, say it is).\n` +
      `- If the evidence for this section is thin, say so in ONE short sentence. Do NOT pad with speculation or filler.\n` +
      `- Do NOT invent CVE IDs, CVSS scores, versions, dates, products, or technique IDs.\n` +
      `- Output clean prose and "- " bullets only. Do NOT write any markdown heading (no #, ##, ###) and do NOT repeat the section title. Mark each claim's confidence inline as [High]/[Medium]/[Low].${conflictNote}`;
    const user = `Subject: ${input.subject}\nEvidence:\n${evidenceBlock(citations, refs)}`;
    let body = '';
    try {
      const r = await run(deps.ai, { system: sys, user, maxTokens: 700, temperature: 0.25 }, { groqKey: deps.groqKey, googleKey: deps.googleKey });
      modelUsed = r.modelUsed;
      body = stripHeadings(guard(r.text.trim(), input.allowlist));
    } catch {
      body = '_Section unavailable (model error)._';
    }
    sections.push({ id: def.id, heading: def.heading, body_md: body, refs });
  }

  // --- Executive summary (last, from the drafted sections) ---
  let executive_summary = '';
  try {
    const sys = `Write a 3-5 sentence executive summary of this report about ${input.subject} for a decision-maker. Plain prose only — NO heading, NO markdown headers (#), NO bullet list, NO section title. Use only facts already in the sections; introduce no new CVEs, products, or claims, and never reference unrelated CVEs/incidents.`;
    const user = sections.map((s) => `${s.heading}: ${s.body_md}`).join('\n\n');
    const r = await run(deps.ai, { system: sys, user, maxTokens: 400, temperature: 0.25 }, { groqKey: deps.groqKey, googleKey: deps.googleKey });
    modelUsed = r.modelUsed;
    executive_summary = stripHeadings(guard(r.text.trim(), input.allowlist));
  } catch {
    executive_summary = sections[0]?.body_md.slice(0, 400) ?? '';
  }

  return { executive_summary, sections, citations, modelUsed };
}

/** Remove stray markdown heading markers the model sometimes emits despite instructions. */
function stripHeadings(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, ''))
    .join('\n')
    .trim();
}
