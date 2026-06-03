# Self-Hosted Tool Bridges — Design Spec

**Date:** 2026-06-03
**Status:** Approved (review gate waived by user — implement directly)
**Scope:** Integrate the CTI capabilities that are _not yet wired in_ because they
can't run inside the Cloudflare Workers V8 runtime: a malware **sandbox (CAPEv2)**,
the **recon CLIs** (Subfinder / Amass / theHarvester / SpiderFoot), and an external
**TAXII 2.1 puller**. OpenCTI live-client is **cut** (YAGNI — IntelOwl's fan-out
pattern is already replicated and OpenCTI stays interop-only).

## Problem

`api/src/providers/` already holds ~45 live providers and the app exposes ~180
routes, but three capability classes remain catalog-only / interop-only because
they are CLI binaries or stateful Docker stacks that cannot execute on Workers:

- **CAPEv2** — dynamic malware detonation (needs nested-virt + Windows guest).
- **Subfinder / Amass / theHarvester / SpiderFoot** — Go/Python recon CLIs.
- **External TAXII 2.1 feeds** — we _serve_ TAXII (`routes/taxii.ts`) but never
  _poll_ an external one.

## Core pattern: the optional self-hosted bridge

Every self-hosted integration follows the repo's existing **optional-provider**
convention (cf. `SPUR_API_KEY`, `PDCP_API_KEY`, `SERPAPI_API_KEY`):

- Optional Worker secrets `*_BRIDGE_URL` + `*_BRIDGE_TOKEN`.
- **Unset → dormant, never breaks:** route returns `503` with a setup hint;
  any provider adapter returns `status:'unsupported'`.
- **Set →** Worker calls the bridge over HTTPS with a bearer token, a short
  `AbortSignal.timeout`, and caches results in `KV_CACHE`.
- **Transport (recommended): Cloudflare Tunnel.** The self-hosted box runs
  `cloudflared`, exposing the tool API as a private tunnel hostname with **no
  open inbound ports** — the right posture for a malware host. The Worker is
  just an HTTPS client of that hostname; nothing in this repo assumes the box
  exists until the secret is set.

This keeps all code in this repo **free-tier-safe and mergeable today**; the
host is provisioned by the operator later.

---

## Subsystem 1 — CAPE sandbox bridge (flagship, build first)

CAPEv2 ships its own REST API (`/apiv2/`), so no custom shim is required — the
"bridge" is CAPE's native API reached through the tunnel.

**Worker (this repo, now):**

- `api/src/lib/cape-bridge.ts` — typed client: `submitFile`, `taskStatus`,
  `taskReport`; normalizes a CAPE report into a summary + extracted IOCs
  (network hosts/domains/URLs, dropped-file hashes, signatures, score/verdict).
  Reads `CAPE_BRIDGE_URL` / `CAPE_BRIDGE_TOKEN`; throws `BridgeUnconfigured`
  when unset.
- `api/src/routes/sandbox-cape.ts` — three handlers, **all admin-gated**
  (`Authorization: Bearer <ADMIN_TOKEN>` via the existing `safeEqual` compare —
  we are uploading malware):
  - `POST /api/v1/cape/submit` — accepts a multipart file (`c.req.formData()`),
    enforces a max size, forwards bytes to CAPE `tasks/create/file/`, returns
    `{ task_id }`. Worker only proxies bytes — never executes.
  - `GET /api/v1/cape/task/:id` — proxies `tasks/view/{id}` (status polling).
  - `GET /api/v1/cape/report/:id` — normalized report + extracted IOCs.
  - All three return `503 {error, setup}` when `CAPE_BRIDGE_URL` is unset.
- `api/src/env.ts` — add `CAPE_BRIDGE_URL?` and `CAPE_BRIDGE_TOKEN?`.
- Register the three routes in `api/src/index.ts`.

**Frontend:**

- `src/pages/dfir/CapeSandbox.tsx` — admin-token gated (reuse `lib/admin-token.ts`):
  drag-drop upload → live task polling → report render (score/verdict chips,
  signatures, dropped files, network IOCs, screenshots if present) → a
  **"push extracted IOCs → /ioc/check"** action reusing the existing pipeline.
- Lazy-route in `src/App.tsx` + nav entry; flip the `secops-catalog.ts` CAPE
  entry from external-link to live (status pill driven by a health probe).

**Host deliverable (operator stands up later — documented, not run here):**

- `docs/self-hosted/cape-bridge.md` + a `docker-compose.yml` snippet: CAPEv2 +
  Windows-guest notes (KVM, RAM) + `cloudflared`. Clearly flagged as **not
  free** (needs nested virt) and dormant until `CAPE_BRIDGE_URL` is set.

**Error handling:** bridge unreachable → `502` with a clear message; CAPE 4xx →
surfaced verbatim; timeouts via `AbortSignal.timeout`. **Security:** untrusted
file upload + outbound fetch → run `security-review` before merge.

**Tests:** `api/test/routes/sandbox-cape.test.ts` — unset-secret → 503; missing
admin token → 401; mocked CAPE submit/poll/report happy path; oversize upload → 413. (Run un-sandboxed: `dangerouslyDisableSandbox`.)

## Subsystem 2 — Recon-tool bridge (build second)

One generic recon service contract behind `RECON_BRIDGE_URL` / `RECON_BRIDGE_TOKEN`:
`POST /recon { tool: 'subfinder'|'amass'|'theharvester'|'spiderfoot', target }`
→ normalized JSON (`{ subdomains[], hosts[], emails[], source, tool }`).

- `api/src/lib/recon-bridge.ts` + `api/src/routes/recon.ts`
  (`POST /api/v1/recon/scan`, public-readable but rate-limited; 503 when unset).
- UI: extend the existing subdomain / Socmint surfaces with a "deep recon
  (self-hosted)" tab; promote the four `secops-catalog.ts` entries to live.
- Host: `docs/self-hosted/recon-bridge.md` + compose with the four CLIs + a
  tiny HTTP wrapper + `cloudflared`. **Can be free** (runs on a free Oracle ARM
  VM — unlike CAPE).

## Subsystem 3 — External TAXII 2.1 puller (build third)

Scheduled-cron + route that polls a free external TAXII 2.1 server and ingests
STIX via the existing `api/src/lib/stix-import.ts` → intel pipeline.

- **Confirm-a-feed step first:** verify a genuinely-free external TAXII 2.1
  server still exists (MITRE deprecated its hosted TAXII; Anomali Limo shut
  down). If none is free → **fallback (user-approved):** a scheduled
  STIX-over-HTTPS refresh of curated bundle URLs (same ingest path, minus the
  TAXII discovery/collection dance).
- `api/src/lib/taxii-client.ts` (poll-side, distinct from the server in
  `routes/taxii.ts`) + a scheduled hook in `worker/scheduled.ts` + KV/D1 cursor
  so we only pull new objects. Config via `TAXII_POLL_URL?` (+ token if needed).

---

## Build order & packaging

CAPE → recon → TAXII, **each its own PR**, each typecheck-clean (per-edit `tsc`
hook) and route-tested locally (un-sandboxed) before the next. Deploy from repo
root (two-wrangler topology). No wiring into the 44-provider fan-out in PR1 —
noted as an optional follow-up (add a `cape` hash-lookup adapter later).

## Out of scope

- OpenCTI live client (cut).
- Running/operating any self-hosted box (operator task; we ship code + docs).
- Wiring CAPE/recon into the unified enrichment fan-out (follow-up).
