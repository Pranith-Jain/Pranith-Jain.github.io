# Report Engine — Multi-pass Writer (Plan C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Turn ranked evidence + citations + conflicts into a structured `Report` body using free LLMs, via outline → per-section draft → assemble → hallucination-guard passes.

**Architecture:** One module `api/src/lib/report/writer.ts`, plus a `templates.ts` of per-template section definitions. Each LLM call goes through the existing `runCompletion(ai, {system,user,maxTokens,temperature}, {groqKey})` (Groq → Workers-AI fallback). Small, single-section contexts keep free models accurate.

**Tech Stack:** TypeScript, Workers, Vitest (un-sandboxed). Reuses Plan A `types.ts` + `CitationIndex`, Plan B `RankedItem`/`Conflict`, and `runCompletion` from `api/src/case-study/generation/ai-client.ts`.

**Spec:** §4. **Depends on:** Plans A, B.

**Test approach:** `runCompletion` is injected as a parameter (default = the real import) so tests pass a stub returning canned JSON/markdown — no live model calls. Run: `cd api && npx vitest run test/lib/report/writer.test.ts`.

---

## File structure

| File                                                      | Responsibility                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `api/src/lib/report/templates.ts`                         | `REPORT_TEMPLATES: Record<TemplateId, TemplateDef>` — section list + per-section guidance per template. |
| `api/src/lib/report/writer.ts`                            | `writeReport(input, deps)` — outline → sections → assemble → guard.                                     |
| `api/test/lib/report/templates.test.ts`, `writer.test.ts` | Unit tests.                                                                                             |

---

## Task 1: Templates

**Files:** Create `api/src/lib/report/templates.ts`; Test `api/test/lib/report/templates.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
import { describe, it, expect } from 'vitest';
import { REPORT_TEMPLATES } from '../../../src/lib/report/templates';

describe('REPORT_TEMPLATES', () => {
  it('defines all four templates with non-empty section lists', () => {
    for (const id of ['ransomware-group', 'threat-actor', 'cve', 'ioc'] as const) {
      const t = REPORT_TEMPLATES[id];
      expect(t).toBeDefined();
      expect(t.sections.length).toBeGreaterThan(2);
      t.sections.forEach((s) => {
        expect(s.id).toBeTruthy();
        expect(s.heading).toBeTruthy();
        expect(s.guidance).toBeTruthy();
      });
    }
  });
  it('section ids are unique within a template', () => {
    for (const t of Object.values(REPORT_TEMPLATES)) {
      const ids = t.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `api/src/lib/report/templates.ts`:**

```ts
import type { TemplateId } from './types';

export interface SectionDef {
  id: string;
  heading: string;
  guidance: string; // what the writer should cover in this section, evidence-grounded
}
export interface TemplateDef {
  title: (subject: string) => string;
  sections: SectionDef[];
}

export const REPORT_TEMPLATES: Record<TemplateId, TemplateDef> = {
  'ransomware-group': {
    title: (s) => `Ransomware Group Report: ${s}`,
    sections: [
      {
        id: 'overview',
        heading: 'Group Overview',
        guidance: 'Who the group is, RaaS model, first observed, current status — grounded only in cited evidence.',
      },
      {
        id: 'ttps',
        heading: 'Tactics, Techniques & Procedures',
        guidance: 'MITRE ATT&CK techniques (validated IDs only) with how the group uses them.',
      },
      {
        id: 'victimology',
        heading: 'Victimology',
        guidance: 'Targeted sectors/regions and notable victims from the leak-site evidence.',
      },
      {
        id: 'cves',
        heading: 'Exploited Vulnerabilities',
        guidance: 'CVEs the group is reported to exploit; note KEV status where present.',
      },
      {
        id: 'negotiations',
        heading: 'Negotiation & Economics',
        guidance: 'Ransom demands, settlements, discounts where evidence exists.',
      },
      {
        id: 'recommendations',
        heading: 'Defensive Recommendations',
        guidance: 'Concrete detections/mitigations mapped to the TTPs above.',
      },
    ],
  },
  'threat-actor': {
    title: (s) => `Threat Actor Profile: ${s}`,
    sections: [
      {
        id: 'overview',
        heading: 'Actor Overview',
        guidance: 'Identity, aliases, suspected origin/motivation — cited only.',
      },
      { id: 'ttps', heading: 'TTPs', guidance: 'Validated MITRE techniques and tradecraft.' },
      {
        id: 'targeting',
        heading: 'Targeting & Campaigns',
        guidance: 'Sectors, regions, notable campaigns from evidence.',
      },
      { id: 'tooling', heading: 'Malware & Tooling', guidance: 'Associated malware families and tools.' },
      { id: 'recommendations', heading: 'Recommendations', guidance: 'Detection and hardening guidance.' },
    ],
  },
  cve: {
    title: (s) => `Vulnerability Brief: ${s}`,
    sections: [
      {
        id: 'summary',
        heading: 'Vulnerability Summary',
        guidance: 'What the flaw is, affected products, CVSS — from validated CVE data only.',
      },
      {
        id: 'exploitation',
        heading: 'Exploitation Status',
        guidance: 'KEV listing, EPSS, in-the-wild/ransomware use where evidenced.',
      },
      { id: 'impact', heading: 'Impact & Exposure', guidance: 'Exposure signals and blast radius from evidence.' },
      {
        id: 'remediation',
        heading: 'Remediation & Detection',
        guidance: 'Patch guidance and detection opportunities.',
      },
    ],
  },
  ioc: {
    title: (s) => `Indicator Dossier: ${s}`,
    sections: [
      {
        id: 'verdict',
        heading: 'Reputation Verdict',
        guidance: 'Synthesize provider verdicts (cited) into an overall assessment.',
      },
      {
        id: 'context',
        heading: 'Threat Context',
        guidance: 'Associated campaigns/actors/malware from correlation + feeds.',
      },
      {
        id: 'pivots',
        heading: 'Pivots & Related Indicators',
        guidance: 'Correlated indicators and suggested next pivots.',
      },
      {
        id: 'recommendations',
        heading: 'Recommended Actions',
        guidance: 'Blocklisting, hunting, and monitoring guidance.',
      },
    ],
  },
};
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `git add api/src/lib/report/templates.ts api/test/lib/report/templates.test.ts && git commit -m "feat(report): per-template section definitions"`.

---

## Task 2: Writer (outline → section → assemble → guard)

**Files:** Create `api/src/lib/report/writer.ts`; Test `api/test/lib/report/writer.test.ts`.

- [ ] **Step 1: Failing test** (injects a fake `runCompletion`):

```ts
import { describe, it, expect } from 'vitest';
import { writeReport } from '../../../src/lib/report/writer';
import type { RankedItem } from '../../../src/lib/report/ranker';

const evidence: RankedItem[] = [
  { sourceId: 'ransomwarelive-profile', authority: 'B', text: 'LockBit is a RaaS operation.', score: 0.9 },
  { sourceId: 'mitre-group', authority: 'A', text: 'T1486 Data Encrypted for Impact (Impact)', score: 0.95 },
];

// Fake model: returns an outline for the outline pass, else a section body that cites [1].
const fakeRun = async (_ai: unknown, input: { system: string; user: string }) => {
  if (input.system.includes('OUTLINE')) {
    return {
      text: JSON.stringify({
        sections: [
          { id: 'overview', evidenceRefs: [1] },
          { id: 'ttps', evidenceRefs: [2] },
        ],
      }),
      modelUsed: 'fake',
    };
  }
  return { text: 'LockBit operates as RaaS [1]. It uses T1486 [2].', modelUsed: 'fake' };
};

describe('writeReport', () => {
  it('produces sections + an executive summary citing only known refs', async () => {
    const out = await writeReport(
      { subject: 'LockBit', template: 'ransomware-group', evidence, conflicts: [] },
      { ai: {} as never, groqKey: undefined, runCompletion: fakeRun as never }
    );
    expect(out.sections.length).toBeGreaterThan(0);
    expect(out.executive_summary.length).toBeGreaterThan(0);
    expect(out.modelUsed).toBe('fake');
    // citations resolve: every [n] in any section body has an entry
    const maxRef = out.citations.length;
    const refsUsed = out.sections.flatMap((s) => s.refs);
    refsUsed.forEach((r) => expect(r).toBeLessThanOrEqual(maxRef));
  });

  it('strips an unverified bracket id the model invented', async () => {
    const hallucinate = async (_ai: unknown, input: { system: string }) =>
      input.system.includes('OUTLINE')
        ? { text: JSON.stringify({ sections: [{ id: 'overview', evidenceRefs: [1] }] }), modelUsed: 'fake' }
        : { text: 'It exploits CVE-2099-0001 [1].', modelUsed: 'fake' };
    const out = await writeReport(
      {
        subject: 'LockBit',
        template: 'ransomware-group',
        evidence,
        conflicts: [],
        allowlist: { cves: [], mitre: ['T1486'], actors: ['LockBit'] },
      },
      { ai: {} as never, groqKey: undefined, runCompletion: hallucinate as never }
    );
    // CVE-2099-0001 is not on the allowlist → flagged
    expect(out.sections[0].body_md).toContain('[unverified]');
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `api/src/lib/report/writer.ts`:**

```ts
import type { Ai } from '@cloudflare/workers-types';
import type { TemplateId } from './types';
import type { RankedItem } from './ranker';
import type { Conflict } from './validator';
import { REPORT_TEMPLATES } from './templates';
import { runCompletion as realRunCompletion } from '../case-study/generation/ai-client';

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
  let assignment: Record<string, number[]> = {};
  try {
    const r = await run(
      deps.ai,
      { system: outlineSys, user: outlineUser, maxTokens: 800, temperature: 0.2 },
      { groqKey: deps.groqKey }
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
    const sys = `You are a senior CTI analyst. Write the "${def.heading}" section of a professional threat report. ${def.guidance} Cite evidence inline as [n] using ONLY the provided refs. Do NOT invent CVE IDs, CVSS, or MITRE technique IDs. Use confidence tags [High]/[Medium]/[Low]. Markdown, no heading line.${conflictNote}`;
    const user = `Subject: ${input.subject}\nEvidence:\n${evidenceBlock(citations, refs)}`;
    let body = '';
    try {
      const r = await run(deps.ai, { system: sys, user, maxTokens: 700, temperature: 0.3 }, { groqKey: deps.groqKey });
      modelUsed = r.modelUsed;
      body = guard(r.text.trim(), input.allowlist);
    } catch {
      body = '_Section unavailable (model error)._';
    }
    sections.push({ id: def.id, heading: def.heading, body_md: body, refs });
  }

  // --- Executive summary (last, from the drafted sections) ---
  let executive_summary = '';
  try {
    const sys = `Write a 3-5 sentence executive summary of this threat report for a decision-maker. Markdown. No new facts beyond the sections.`;
    const user = sections.map((s) => `## ${s.heading}\n${s.body_md}`).join('\n\n');
    const r = await run(deps.ai, { system: sys, user, maxTokens: 400, temperature: 0.3 }, { groqKey: deps.groqKey });
    modelUsed = r.modelUsed;
    executive_summary = guard(r.text.trim(), input.allowlist);
  } catch {
    executive_summary = sections[0]?.body_md.slice(0, 400) ?? '';
  }

  return { executive_summary, sections, citations, modelUsed };
}
```

- [ ] **Step 4: Run → PASS** (both tests). Then `cd api && npx tsc --noEmit -p tsconfig.json` + `cd .. && npx tsc -p api/tsconfig.worker.json --noEmit` — clean.
- [ ] **Step 5: Commit** `git add api/src/lib/report/writer.ts api/test/lib/report/writer.test.ts && git commit -m "feat(report): multi-pass writer (outline/section/summary/guard)"`.

---

## Final verification

```
cd api && npx vitest run test/lib/report
cd .. && npx tsc -p api/tsconfig.worker.json --noEmit && npx eslint api/src/lib/report --ext ts
```

## Leaves out (Plan D)

The `ReportBuilderDO` orchestrator that calls resolve → plan → gather (per phase) → validate → rank → writeReport → assemble a full `Report` → persist to D1, plus the `/api/v1/report/*` routes and progress streaming.
