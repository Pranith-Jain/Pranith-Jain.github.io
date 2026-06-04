# Copilot → Professional Report Generator — Design Spec

**Date:** 2026-06-04
**Status:** Approved design, pending spec review
**Area:** `api/src/routes/copilot.ts`, new `api/src/lib/report/*`, new `ReportBuilderDO`, `src/pages/threatintel/Copilot.tsx`

---

## 1. Goal & context

Upgrade the existing AI "Copilot" (`api/src/routes/copilot.ts` + `src/pages/threatintel/Copilot.tsx`) from a single-turn, single-model, equal-weighted-sources investigation tool into a **professional-grade threat-intelligence report generator** — without leaving the free Groq + Workers-AI model stack.

The platform's quality ceiling today is the free model. We compensate with **architecture**: stronger source grounding, fact-validation against ground truth, recency/authority ranking, and multi-pass writing. Because that work is heavy and the Cloudflare **free plan caps each invocation at 50 subrequests** (KV + Cache-API + fetch all count) with CPU limits, the heavyweight pipeline runs as an **async Durable Object job** where each alarm gets a fresh budget.

### Decisions (locked)

- **Tiered, one shared engine.** Copilot stays the fast Q&A; a "Generate full report" escalation runs the heavyweight pipeline. Both consume the same grounding engine.
- **Lives inside the Copilot page.** No new route. `Copilot.tsx` gains a quick-answer mode (current behaviour) and a full-report mode rendered in the same page.
- **Deliverable:** a structured `Report` object rendered in-page **and** exportable to print-quality PDF. `.md` export retained.
- **Cover carries a TLP classification** (`TLP:CLEAR/GREEN/AMBER/RED`), user-selectable, default `TLP:AMBER`.
- **Model:** free Groq (`meta-llama/llama-4-scout-17b-16e-instruct`) → Workers-AI fallback, via existing `runCompletion`. No paid model.
- **Templates (v1):** Ransomware Group, Threat Actor, CVE/Vulnerability, IOC/Indicator dossier.
- **Execution:** Durable Object (`ReportBuilderDO`), alarm-driven state machine, WebSocket progress + poll fallback.
- **All four quality levers in v1:** fact-grounding, smarter source use, writing quality, confidence/traceability.

### Non-goals (deferred, NOT in this spec)

- Multi-model consensus / second-model fact validation.
- Interactive multi-turn follow-up chat on a report.
- Rebuilding the Vectorize RAG corpus to index the volatile live feeds.

---

## 2. Architecture overview

```
                          ┌─────────────────────────────────────────┐
                          │   Grounding engine  (api/src/lib/report) │
                          │  resolver → planner → gatherer →         │
                          │  validator → ranker → confidence/cites   │
                          └───────────────┬─────────────────────────┘
            quick (sync, shallow)         │          deep (async, multi-pass)
        ┌─────────────────────────────────┘          └───────────────────────────┐
        ▼                                                                          ▼
  copilot.ts (existing, reuses engine)                       ReportBuilderDO (new state machine)
  POST /api/v1/copilot/investigate                           POST /api/v1/report/build → {report_id}
  → 1-pass narrative (as today, better grounded)             alarms: resolve→plan→gather→validate→
                                                             rank→outline→write(per-section)→assemble
                                                             → persist Report to D1
                                                             WS GET /api/v1/report/:id/stream (progress)
                                                             GET  /api/v1/report/:id (poll/result)
```

The engine modules are pure/testable; the DO is only an execution wrapper that sequences them across alarms and streams progress. The same modules back Copilot quick mode (shallow plan, one writing pass, synchronous).

---

## 3. Grounding engine (`api/src/lib/report/`)

Each module is independently unit-testable with a small, explicit interface.

### 3.1 `subject-resolver.ts`

`resolveSubject(query: string): ResolvedSubject`

- Reuse Copilot's entity detection (CVE / IPv4 / domain / hash / actor / ransomware / generic).
- Canonicalize: actor aliases via `ACTOR_ALIASES`, ransomware groups via the ransomware KB, CVE format normalization, IOC typing.
- Output: `{ raw, type, canonical, identifiers: {aliases?, group?, cve?, iocType?}, suggestedTemplate }`.

### 3.2 `source-planner.ts`

`planSources(subject: ResolvedSubject, template: TemplateId, budget: Budget): SourcePlan`

- Emits an **ordered, phased** list of source descriptors, each `{ id, kind: 'cache'|'live'|'rag', authority: 'A'..'F', cost: number, phase: number }`.
- **Cheap first:** KV-cached snapshots (`ransomware-recent`, `live-iocs`, `actor-timeline`, `writeups`, `detections`, `cybercrime`, `negotiations`, `breach-disclosures`, `cve-recent`, `ioc-correlation`, `malpedia`) — near-zero subrequest cost.
- **Live, budgeted:** provider enrichment (VT, AbuseIPDB, GreyNoise, OTX, URLScan, MalwareBazaar, Shodan/CVEDB), ransomware.live group profile, NVD/EPSS/KEV (also used by validator), MITRE lookup, Wikipedia.
- **RAG:** one Vectorize `queryCorpus` call.
- Authority comes from `lib/confidence.ts`'s reliability registry. `cost` sums to **≤ MAX_PHASE_SUBREQUESTS (default 40)** per phase; planner splits live sources across phases when needed.

### 3.3 `gatherer.ts`

`gatherPhase(plan: SourcePlan, phase: number, env): Promise<SourceResult[]>`

- Executes one phase's descriptors. Normalizes everything to `SourceResult { id, name, authority, fetched_at, items: SourceItem[] }` where `SourceItem` carries `{ text, url?, observed_at?, fields }`.
- Per-source timeout (reuse 8 s); a timed-out source is returned with `status: 'timeout'` (NOT silently dropped) so coverage gaps are visible.
- Hard cap on items retained per source (keep 50; record `total` for transparency).

### 3.4 `validator.ts` (fact-grounding)

`validateFacts(candidates: ExtractedFacts, sources, env): ValidationResult`

- CVE IDs → NVD lookup (cached); confirm existence, attach authoritative CVSS/EPSS/KEV. Unknown CVE IDs are rejected.
- MITRE technique IDs → checked against `ATTACK_ID_INDEX`.
- Actor/group names → must resolve in `ACTOR_ALIASES` / ransomware KB / ransomware.live.
- **Contradiction detection:** group overlapping claims (same victim ransom amount, victim counts, attribution) across sources; disagreements → `conflicts: [{ claim, positions[], note }]`.
- Output: `{ allowlist: ValidatedFact[], rejected: [...], conflicts }`. Only allowlisted facts may appear in prose.

### 3.5 `ranker.ts`

`rankEvidence(sources, subject): RankedEvidence`

- Score each item by `recency × authority × relevance(subject)`. Trim to a token budget for the writer. Produces the ordered evidence set + a stable index.

### 3.6 `citation-index.ts`

Assign stable `[n]` refs; map `ref → { sourceId, name, authority, url, fragment, fetched_at }`. Drives inline citations and the sources appendix.

### 3.7 `confidence.ts` (extend existing `lib/confidence.ts`)

Reuse the Admiralty scorer; feed it the contributing source IDs, the `conflicts` count, and add **temporal decay** (down-weight stale claims). Output unchanged shape (`ConfidenceScore`) plus a per-source grade list for the appendix.

---

## 4. The writer (`api/src/lib/report/writer.ts`) — multi-pass

All calls via `runCompletion` (Groq → Workers-AI). Each prompt: cite ONLY provided evidence refs, no invented IDs, professional CTI tone, confidence tags `[High]/[Medium]/[Low]`.

1. **Outline pass** — input: ranked evidence + template section list. Output: validated JSON `{ sections: [{ id, heading, evidenceRefs[] }] }`.
2. **Section drafting** — one focused call per section, given only that section's evidence (small context → higher quality on free models, no overflow). Output: section markdown with inline `[n]`.
3. **Assemble + tighten** — concatenate sections; generate the **executive summary last** from the drafted sections; one global dedupe/tighten pass.
4. **Hallucination guard** — scan final prose for CVE/technique/actor IDs; any not on the validator allowlist is stripped or flagged `[unverified]`.

Quick-mode Copilot uses a single combined pass over the shallow evidence (close to today), still benefiting from grounding + validation.

---

## 5. Report data model + persistence

```ts
interface Report {
  meta: { id; subject; subject_type; template; tlp: 'CLEAR'|'GREEN'|'AMBER'|'RED';
          status: 'queued'|'building'|'done'|'error'; phase; model_used; generated_at; timings };
  cover: { title; subtitle; tlp; subject_badges: string[]; generated_at };
  executive_summary: string;            // markdown
  key_findings: { text; confidence: 'High'|'Medium'|'Low'; refs: number[] }[];
  sections: { id; heading; body_md; refs: number[] }[];   // template-driven
  appendices: {
    iocs:  { type; value; verdict?; first_seen?; refs: number[] }[];
    mitre: { tactic; technique_id; technique_name; refs: number[] }[];
    cves:  { id; cvss?; epss?; kev?; refs: number[] }[];
    sources: { ref; name; authority: 'A'..'F'; credibility: 1..6; url?; fetched_at; freshness }[];
    conflicts: { claim; positions: string[]; note }[];
  };
  confidence: ConfidenceScore;          // overall Admiralty + reasoning
}
```

Persist to a new D1 table `reports` (`id PK, subject, template, tlp, status, report_json, created_at, updated_at`). New migration via `/create-migration`. Retrieval by id powers poll + reload + share.

---

## 6. `ReportBuilderDO` (Durable Object)

State machine; each alarm = fresh subrequest budget.

| Phase      | Action                                      | Notes         |
| ---------- | ------------------------------------------- | ------------- |
| `resolve`  | subject-resolver                            | cheap         |
| `plan`     | source-planner                              | cheap         |
| `gather:N` | gatherer (one alarm per budget phase)       | may repeat    |
| `validate` | validator (+ NVD/MITRE/KB)                  | budgeted live |
| `rank`     | ranker + citation index                     | cheap         |
| `outline`  | writer outline pass                         | 1 LLM call    |
| `write:S`  | section draft (batched to fit budget)       | LLM calls     |
| `assemble` | exec summary + tighten + guard → persist D1 | finalize      |
| `done`     | —                                           |               |

- **State:** stored in DO storage `{ phase, pct, detail, partial, subjectPlan, evidence, draftSections }`.
- **Progress:** WS push on each transition `{ phase, pct, detail }` (mirror `LiveFeedDO`'s WS handling). Poll fallback `GET /api/v1/report/:id` reads the persisted/partial state.
- **Errors:** each phase wrapped; failure marks `status:'error'`, keeps partial, supports retry. `RateLimitError` → backoff-reschedule alarm (mirror case-study publisher).
- **Auth:** gated like Copilot (admin/API-key).

### Endpoints (`api/src/routes/report.ts`, mounted in router)

- `POST /api/v1/report/build` `{ subject, template?, tlp? }` → `{ report_id }` (resolves template if omitted).
- `GET /api/v1/report/:id` → current `Report` (partial while building).
- `GET /api/v1/report/:id/stream` → WS progress (DO-backed).

All under the existing `validate()` + body-cap middleware; `report.ts` declares schemas mirroring its reads (per the repo's schema-contract rule).

---

## 7. Frontend (`src/pages/threatintel/Copilot.tsx`)

- **Mode toggle in-page:** "Quick answer" (current flow, unchanged UX) and "Full report".
- **Full-report flow:** subject input + **template picker** (4 templates, or "auto") + **TLP selector** (default AMBER) → `POST /report/build` → **phase stepper** with live WS detail ("Validating 14 IOCs… Writing MITRE section…") → render the **Report**:
  - Cover (title, TLP banner, subject badges, timestamp).
  - Executive summary, key findings (with confidence chips + `[n]`).
  - Template sections (markdown via existing DOMPurify render path).
  - Appendices: **IOC table**, **MITRE ATT&CK matrix**, **CVE table**, **sources panel with per-source Admiralty badges**, **conflicts callout**.
  - Clickable `[n]` citation → reveals the exact source fragment + link.
  - Overall confidence panel.
- **Export:** **PDF** via `jspdf` + `jspdf-autotable` (already deps) — cover + sections + appendix tables, print-quality, TLP in header/footer. Keep `.md` export. Keep "Save as Assessment".
- No new route/sidebar/catalog entry (report is part of Copilot, which is already catalogued).

---

## 8. Source breadth ("more sources")

The planner pulls broadly but within budget. v1 wires these into templates:

- **Ransomware Group:** ransomware.live profile (TTPs/victims/negotiations), `ransomware-recent`, `negotiations`, `victim-releaks`, actor KB + MITRE, KEV-exploited CVEs, Malpedia, writeups, RAG.
- **Threat Actor:** actor KB + aliases + `actor-timeline`, campaigns, MITRE techniques, associated malware/CVEs, `cybercrime`, writeups, RAG.
- **CVE/Vulnerability:** NVD + EPSS + CISA KEV, Shodan/CVEDB exposure, `cve-recent`, exploitation signals, affected products, detections/mitigations, RAG.
- **IOC dossier:** multi-provider enrichment (VT/AbuseIPDB/GreyNoise/OTX/URLScan/MalwareBazaar/MalShare), `live-iocs`, `ioc-correlation`, related campaigns/actors, pivot suggestions.

Timed-out/over-budget sources are surfaced as coverage notes, never silently dropped.

---

## 9. Testing

**Unit (root vitest):** subject-resolver, source-planner (budget math — assert phase cost ≤ cap), validator (CVE/MITRE/actor validation + contradiction grouping), ranker ordering, citation index stability, report (de)serialization, PDF generation smoke (no throw, expected sections).

**Integration (api vitest-pool-workers, run un-sandboxed):** `ReportBuilderDO` phase transitions with mocked `env.AI` + mocked `fetch`; `POST /report/build` → poll → `done`; auth gating; **budget guard** asserting no single phase exceeds `MAX_PHASE_SUBREQUESTS` with mocked counters. Reuse existing `ai-client` mocking patterns. Route lives under `test/routes/` (CI skips it — run locally).

---

## 10. Constraints honored

- **50-subrequest/invocation cap:** enforced by per-phase planner budgeting; DO alarms reset the budget. KV + Cache-API + fetch all counted.
- **256 KB body cap:** report build inputs are tiny (subject + template); fine. Report retrieval is GET.
- **CPU/time limits:** multi-pass writing split across alarms, never one long invocation.
- **Schema-contract rule:** `report.ts` `validate()` schemas mirror handler reads.
- **Typecheck-on-edit + worker tsconfig:** keep each saved state compilable; run `tsc -p api/tsconfig.worker.json` after worker/DO edits.

---

## 11. Build order (for the implementation plan)

1. **Engine + data model + D1 migration** — resolver, planner, gatherer (cache sources), validator, ranker, confidence ext, citation index, `Report` types. Unit-tested. No UI.
2. **Writer** — outline → section → assemble → guard. Unit-tested with mocked AI.
3. **`ReportBuilderDO` + `report.ts` endpoints + streaming** — wrangler DO binding + migration; integration-tested.
4. **Frontend** — Copilot mode toggle, template/TLP pickers, phase stepper, Report renderer, PDF export, Copilot escalation.
5. _(deferred)_ corpus expansion, more live providers, multi-model consensus.

Each engine module and the writer have clear single responsibilities and interfaces, so they can be built and tested in isolation before the DO wires them together.
