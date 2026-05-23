# `stix-build` — STIX 2.1 bundle builder

Generates STIX 2.1 bundles + flat frontend views from extracted CTI entities. Currently lives at `api/src/lib/stix-build.ts` inside the portfolio Worker; this README documents what it does and what would be needed to extract it into a standalone npm package.

## What it does

Given a feed item (title + body + URL) plus pre-extracted entities (IoCs, actors, malware, CVEs), this module emits two related artefacts in one pass:

- **`bundle`** — strict STIX 2.1 with `spec_version`, valid UUIDv5 IDs, the canonical TLP marking-definitions, per-indicator patterns, and the relationships analysts expect (`indicates`, `uses`, `targets`). Importable into OpenCTI, MISP, or any TAXII 2.1 client without further transformation.
- **`view`** — denormalized, flat shape suitable for direct rendering by a frontend component without re-parsing the bundle. Carries the same data but pre-resolved (actor → malware links, CVE → KEV flag, IoC → top-N provider scores).

## Public API

```ts
buildStixBundle(input: ReportInput, entities: ExtractedEntities, opts?: BuildOpts): BuildResult
```

`BuildResult = { bundle, view, stats }`.

The exported interfaces — `ReportInput`, `ExtractedEntities`, `IntelView`, `StixBundle`, `Tlp` — describe the contract.

## Determinism

Object IDs are UUIDv5-derived from a stable namespace (`NS_INTEL_BUNDLE`) plus a content key. Re-running the builder over the same input produces byte-identical IDs, so:

- The same IoC observed in two reports collapses into the same `indicator--<uuid>` downstream.
- Diff-friendly: bundle changes between runs are limited to what actually changed in the data.

## ATT&CK cross-reference

When an extracted actor / malware / technique slug matches an entry in `ATTACK_ID_INDEX`, an `external_references` entry is added pointing at `https://attack.mitre.org/...` and carrying the canonical `G####` / `S####` / `T####` external_id.

## Internal dependencies (extraction blockers)

To publish as a standalone package, the following internal imports need to be either inlined, vendored, or accepted as parameters:

| Internal import                       | Path                      | Extraction strategy                                                                     |
| ------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| `stixId`, `uuidv5`, `NS_INTEL_BUNDLE` | `./uuidv5`                | Vendor — this file has no further deps and is ~80 lines.                                |
| `IndicatorType`                       | `./indicator`             | Type-only; inline the union (`'ipv4' \| 'ipv6' \| 'domain' \| 'url' \| 'hash' \| ...`). |
| `ATTACK_ID_INDEX`                     | `../data/attack-id-index` | Make optional via constructor option; library default = `{}` (no ATT&CK linking).       |
| `ExtractedEntities` & co.             | `./extract`               | Type-only; inline or re-export from a sibling `types.ts`.                               |
| `IocEnrichment`, `ProviderScore`      | `./enrich-bulk`           | Type-only; inline.                                                                      |
| `CveEnrichment`                       | `./cve-enrich`            | Type-only; inline.                                                                      |
| `LlmEntities`                         | `./extract-llm`           | Type-only; inline. Optional input.                                                      |

No runtime dependencies on the Workers runtime — the module is pure TS, no `fetch`, no KV. Should run in Node, Deno, browser, anywhere.

## Test coverage

`api/test/lib/stix-build.test.ts` carries the spec — round-trips, ID determinism, ATT&CK linking, TLP marking selection. Lift these tests verbatim into the standalone package.

## What it deliberately does not do

- **No entity extraction.** Caller is responsible for extracting entities; pair with `extract.ts` (regex/dict) and optionally `extract-llm.ts` (LLM-assisted) for that step.
- **No enrichment.** Caller passes pre-enriched IoCs. Pair with `enrich-bulk.ts` for multi-provider IOC scoring.
- **No persistence.** Pure transform — call site decides how to store the bundle (KV, S3, DB, etc.).

## Suggested package name

`@pranithjain/stix-build` or `stix21-builder`. ~700 LOC + types. MIT licence.
