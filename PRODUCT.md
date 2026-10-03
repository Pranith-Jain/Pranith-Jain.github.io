# PRODUCT.md

## Users

Two distinct audiences:

1. **The owner (Pranith)** — a security researcher/CTI analyst running this as both a
   personal portfolio and a daily-driver threat-intel workstation. Expert user, keyboard-first,
   reads raw JSON without flinching, values density and speed over hand-holding.
2. **Public visitors** — recruiters, security peers, and MSSP clients who arrive via shared
   report links (`/share/report/:token`), social cards, blog posts, or the threat-intel
   catalog. They skim: they need credibility signals (real data, live feeds) within seconds.

## Product Purpose

A dual-nature platform:

- **Portfolio** (brand register): landing, projects, blog — design IS the product here.
- **Threat-intel workstation** (product register): DFIR console, investigator agent,
  60+-provider IOC enrichment, feed catalogs, detection tooling — design SERVES the product.
  Density is a feature. Empty states should still feel alive (live data everywhere).

## Register

Hybrid, section-scoped: `/` and `/projects/*` and `/blog/*` are brand;
`/dfir/*`, `/threatintel/*`, `/share/*` are product. When unsure, product rules win —
this is first and foremost a working tool that happens to be public.

## Tone

Precise, technical, quietly confident. Monospace for data/identifiers is a signature.
No marketing fluff inside tool surfaces. Terminal-adjacent aesthetic (the investigator,
hex workbench, and console lean into it deliberately) but never at the cost of readability.

## Anti-references

- Generic SaaS-dashboard look: rows of identical stat cards, gradient hero-metric blocks.
- AI-slop tells: ambient glows (one was already removed from light mode), glassmorphism
  everywhere, and **em dashes used as sentence connectors in prose**.
- Enterprise-security cliché: dark-blue-everything with red "THREAT" badges shouting.

### The em-dash rule, stated precisely

An earlier version of this file banned em dashes in UI copy outright. That was
too blunt and was producing bad outcomes, so the exception is written down here.

An em dash is an AI tell when it is doing a **sentence connector's** job in
running prose: "Aggregates results in one pass — a single query can surface 900+
hits." That is the thing to avoid; use a period, a comma, a colon, or parentheses.

An em dash is **not** a tell when it is doing structural work, and these must be
left alone:

- **Null-value placeholder in a table.** `dfir/TidCmm` renders `'—'` for a
  missing measurement. That is a data glyph, not punctuation; a comma there
  would read as a value.
- **Term–definition pairs in structured data.** `data/frameworks.ts`,
  `dfir/Utiom`, `threatintel/UnifiedKillChain` use `Label — definition` and
  `0: 'Not started — no documented intent.'` These are parallel constructions
  where the dash is the delimiter, and replacing it with a comma changes the
  structure the reader is parsing.
- **Feed titles quoted from a source.** `pages/argus/data/feed.ts` and similar
  mirror upstream headlines verbatim; editing them misquotes the source.

`npm run check:em-dashes` reports the split (comment vs copy, and by shape) so
the debt is measurable and cannot quietly grow. It deliberately proposes no
replacement: the right punctuation is a per-string judgement, and a blanket
`—` → `,` codemod would corrupt the structural uses above.

**As of this writing the connector form is gone from hand-written copy.** The
residual is structural only: null glyphs (`value ?? '—'`), labels and tool
titles (`T1 — Primitive`, `CLOAK — Anonymity Framework`), `ID — title` rows in
result tables, scored `Level N — Name` strings, and framework cross-references
(`GV.PO — Clause 5`). Do not "finish" those; they are the cases the rule
carves out.

Side comments (`// Phase 3 — persist library`, `{/* Sidebar — actor list */}`)
were normalised to a colon too, for consistency with the rule. Code comments
are not user-facing copy, so this is a style preference, not a PRODUCT.md
requirement.

## Strategic principles

1. Live data over mockups — every surface shows real feeds; staleness is visible.
2. Density with rhythm — tables and mono data blocks are fine; give sections breathing room.
3. One navy-tinted palette across modes — surfaces ladder up in brightness, never gray-on-blue.
4. Tokens over raw colors — new code uses semantic tokens (`text-muted`, surface/border vars).
