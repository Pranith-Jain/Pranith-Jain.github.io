# Crypto Fund-Flow Tracer — Phase D (Bloodhound OSINT Pivot) Design Spec

**Date:** 2026-06-11
**Status:** Draft — awaiting user review
**Scope:** Phase D. From a selected tracer node (a crypto address + its label),
fan out to the platform's existing OSINT routes to surface off-chain identity
leads. Lightweight in-Tracer panel; no new search infrastructure.

**Parent spec:** `docs/superpowers/specs/2026-06-10-crypto-fund-flow-tracer-design.md`

## Background

Phases A–C are live: trace, label, calldata-inspect, save/export/pin. Phase D is
Spectra's "Bloodhound" — pivot from an address to off-chain identity (social,
leaks, domains, forum chatter). The repo **already owns every OSINT route**; Phase
D is wiring + a panel, not new search code.

## Decisions (locked, from brainstorming)

- **Tier 1 + Tier 2 (ENS-gated)** — lightweight in-Tracer "OSINT pivots" panel.
- **No OsintMapper deep handoff** (deferred; needs a seed-state path that doesn't exist).
- **ENS-label-only** identity derivation (precise, low false-positive). No email pattern-guessing.

## Hard constraints

- Reuse > rebuild. No new OSINT providers.
- `/api/v1/*` reads key-gated (public via OPEN_PUBLIC_READS valve in tests).
- api tsconfig `noUncheckedIndexedAccess`; 3× `tsc --noEmit`; route tests un-sandboxed.

---

## §1 · OSINT pivot tiers

**Tier 1 — driven by the raw address (always available):**

- **Dorks** — pure `buildDorkQueries(address, label?)` emits Google-dork strings:
  `"<address>" site:etherscan.io`, `… site:github.com`, `… site:twitter.com`,
  `… site:t.me`, `… (pastebin OR ghostbin OR throwbin)`, `… "private key" OR seed`.
  Each becomes a `google.com/search?q=…` link AND a one-click call to the existing
  `GET /api/v1/google-dorks?q=…` (which returns programmable-search results).
- **Unified search** — `GET /api/v1/unified-search?q=<address>` (and `?q=<label>`):
  one-shot context across IOCs / actors / ransomware victims / breaches.

**Tier 2 — driven by a _derived_ label, gated on a resolved ENS/domain:**

- `deriveOsintTargets(ctx)` (pure): from the node's label / `AddressContext.ens_name`,
  extract `{ ens, domains, usernames }` — e.g. `vitalik.eth` → username `vitalik`;
  `foo.com`-style label → domain `foo.com`. Only non-empty when an ENS/domain exists.
- When targets exist, surface one-click pivots to: `breach` (domain), `hudsonrock`
  (infostealer logs by domain), `threat-hunt` (telegram-leak + IOC DB), `leakix`
  (domain), `proxynova` (combolist by username), `email-rep` (if an email is derivable).
- These are rendered as **links/buttons** the analyst clicks — Phase D does NOT
  auto-fan all of them (subrequest + noise discipline). The panel shows which Tier-2
  pivots are _available_ given the derived targets.

## §2 · Components

**New (frontend, pure + panel):**

- `src/lib/dfir/osint-pivots.ts` — pure: `buildDorkQueries(address, label?) → DorkQuery[]`
  (`{ label, url, apiPath }`) and `deriveOsintTargets(label, ensName?) → { ens, domains, usernames }`.
  Plus `tier2Pivots(targets) → PivotLink[]` mapping derived targets to route deep-links.
- `src/pages/dfir/Tracer.tsx` — an **"OSINT pivots"** section in the detail panel
  (when a node is selected): renders the Tier-1 dork links + a "Run unified search"
  button (calls `/api/v1/unified-search`, shows a compact result count + top hits),
  and the Tier-2 pivot links when `deriveOsintTargets` yields targets. The address's
  label (from the node) seeds derivation; an optional "Resolve ENS" affordance calls
  `/api/v1/crypto-trace?address=…` to populate `AddressContext` when the node has no label.

**Reuse (no change):** `google-dorks`, `unified-search`, `crypto-trace`, `breach`,
`hudsonrock`, `threat-hunt`, `leakix`, `proxynova`, `email-rep` routes — all already live.

## §3 · Data flow

`selected node (address, label, chain)` → `buildDorkQueries` → Tier-1 links (open in
new tab) + `unified-search` fetch (inline result summary). In parallel,
`deriveOsintTargets(label, ensName)` → if non-empty, `tier2Pivots` → Tier-2
deep-links. No persistence; everything is derived from the selected node + optional
on-demand `crypto-trace`/`unified-search` calls.

## §4 · Non-goals (YAGNI)

- No OsintMapper handoff / identifier-graph seeding.
- No email pattern-guessing (ENS-derived only).
- No auto-fanning every Tier-2 route (analyst clicks; avoids subrequest waste + noise).
- No new OSINT providers or persistence.

## §5 · Error handling

- `unified-search` failure → panel shows "search unavailable"; dork links still work (they're static URLs).
- No ENS/label → Tier-2 section hidden (only Tier-1 shows).
- `crypto-trace` resolve failure → "couldn't resolve ENS"; Tier-1 unaffected.

## §6 · Testing

- `src/lib/dfir/osint-pivots.test.ts` (new) — `buildDorkQueries` emits the expected
  dork strings + escapes the address; `deriveOsintTargets` extracts username from
  `vitalik.eth`, domain from a domain-shaped label, and returns empty for a bare hex
  address; `tier2Pivots` maps a domain target to the breach/hudsonrock links and is
  empty when no targets.
- Frontend: the panel is exercised by a render smoke (no new route tests — Phase D
  adds no backend route).

## §7 · File structure

**New:** `src/lib/dfir/osint-pivots.ts`, `src/lib/dfir/osint-pivots.test.ts`.
**Modified:** `src/pages/dfir/Tracer.tsx` (OSINT pivots panel).

## Summary

Phase D turns a traced address into an investigation lead generator by reusing the
platform's OSINT route suite: pure dork/target builders + an in-Tracer "OSINT
pivots" panel. Tier-1 (address-driven dorks + unified search) is always available;
Tier-2 (leak/breach/infostealer) appears only when an ENS/domain resolves. No new
backend, no persistence — wiring + one panel + two pure functions.
