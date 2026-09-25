# FlowViz + Procedure-Extraction integration (2026-09-25)

## Sources

| Repo | License | Stars | What it is |
| ---- | ------- | ----- | ---------- |
| `davidljohnson/flowviz` | MIT | 246 | AI article → interactive ATT&CK attack-flow graph (React + Express + Claude/OpenAI/Ollama), export PNG/STIX/.afb/JSON |
| `netandneedle/procedure-extraction-pipeline` | Apache-2.0 | 16 | LLM report → STIX `x-procedure` bundles via 16-stage LangGraph + 4 human review gates (Postgres + Neo4j + Docling + SecureBERT) |

## Decision: edge-native ports, not lift-and-shift

Neither backend can run on Workers. FlowViz's Express server ports cleanly
to Hono; the procedure pipeline's Python/Docker stack (Torch, Docling,
LangGraph-checkpointed multi-day gates, Neo4j Bolt) cannot. So:

- **FlowViz → full edge port.** Prompt + validation + SSRF guard ported
  verbatim; providers replaced by the platform `runCompletion` chain
  (gemini → groq → nvidia → Workers AI); jsdom+Readability replaced by a
  dependency-free readability-lite; canvas + exporters ported to the
  platform's `@xyflow/react@12` + dagre standard.
- **Procedures → edge-native scaffold.** One-pass `runCompletion`
  extraction with the same reconciliation rules (verbatim grounding,
  ATT&CK-index check, no fabricated commands), D1 job queue + 4 review
  gates (admin-gated writes, `ai_escape_reports` pattern), `x-procedure`
  + Attack-Flow bundle builder reusing `attack-flow.ts`/`stix-export.ts`.
  The full Docling/Neo4j/SecureBERT pipeline stays self-hosted by design.

## What shipped

**FlowViz** (`/threatintel/flowviz`):
- `api/src/lib/flowviz-prompt.ts` — analysis + assistant prompts (single copy, upstream discipline)
- `api/src/lib/flowviz-validate.ts` — SSRF guard, node/edge schema checks, balanced-brace JSON parse
- `api/src/routes/flowviz.ts` — `GET /flowviz/`, `/techniques`, `/fetch-article`; `POST /analyze`, `/analyze-stream` (SSE progress+done), `/assistant`, `/validate`
- `worker/lib/flowviz-manifest.ts` (+ api symlink) — ATT&CK technique index via ASSETS
- `public/data/flowviz/techniques.json` — seed from upstream snapshot; regen: `node scripts/build-flowviz-techniques.mjs` (pins ATT&CK v18.1 like upstream)
- `src/lib/flowviz-export.ts` — STIX 2.1 + compact `.afb` + localStorage library
- `src/components/flowviz/FlowVizCanvas.tsx` (lazy, eslint allowlist) + `src/pages/threatintel/FlowViz.tsx`
- MCP: `flowviz_list_techniques`, `flowviz_validate_graph` (analysis/assistant are REST-only — they need the LLM chain)

**Procedures** (`/dfir/procedure-extract`):
- `api/src/lib/procedure-extract.ts` — one-pass extractor (never throws; `{ran, partial}` like `extract-llm.ts`)
- `api/src/lib/x-procedure.ts` — fingerprint, tuple check, name shape, bundle builder
- `api/src/routes/procedures.ts` — jobs CRUD + gate reviews (POSTs admin-gated) + bundle + rules reads
- `migrations/0047_procedure_jobs.sql` — `procedure_jobs`, `procedure_reviews`, `procedure_rules` (routes also `ensureTables()` self-heal)
- `worker/lib/procedure-manifest.ts` (+ api symlink) + `public/data/procedures/rules.json` seed
- `src/pages/dfir/ProcedureExtract.tsx` — queue + 4-gate review + STIX download
- MCP: `proc_list_rules`

**Shared wiring**: routes in `api/src/index.ts`, SPA routes + hub catalog entries + prerender list, manifest regen (`public/mcp-manifest.json`, `llms-full.txt`).

## Deliberate omissions (documented in code)

- Ollama provider (dials localhost — self-host only), token-level SSE
  deltas (runCompletion is unary; SPA gets progress + ordered full graph),
  Docling PDF parse / SecureBERT retrieval / Neo4j writes / LangGraph
  orchestration (stay in the Python container; the edge never runs them).
- `.afb` export is compact-valid (Builder opens it); pixel-perfect
  anchor/latch routing is future work. D1-backed `IFlowStorage` is future
  work (localStorage contract preserved).

## Verification

- `tsc -p api/tsconfig.json`, `tsc -p api/tsconfig.worker.json`, root `tsc` — clean (one pre-existing `Nova.tsx` error at HEAD, untouched)
- `npx vitest run worker/lib/flowviz-manifest.test.ts` — 5 passed
- `npx vitest run --config api/vitest.config.ts api/test/routes/flowviz.test.ts` — 16 passed
- `eslint` on all new/changed files — clean (canvas split per the `@xyflow/react` lazy-vendor rule)
- `node scripts/build-mcp-manifest.mjs && node scripts/build-llms-full.mjs` — 3 new tools indexed

## Follow-ups (not in this change)

- Quarterly `node scripts/build-flowviz-techniques.mjs` refresh (ATT&CK revises ~quarterly); consider folding into `threat-intel-sync.yml`
- Token-streaming `/analyze-stream` if `runCompletion` ever gains SSE
- D1-backed saved flows behind the existing `IFlowStorage`-shaped helpers
- Full Builder-fidelity `.afb` latch routing
