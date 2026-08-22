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
  everywhere, em dashes in UI copy.
- Enterprise-security cliché: dark-blue-everything with red "THREAT" badges shouting.

## Strategic principles

1. Live data over mockups — every surface shows real feeds; staleness is visible.
2. Density with rhythm — tables and mono data blocks are fine; give sections breathing room.
3. One navy-tinted palette across modes — surfaces ladder up in brightness, never gray-on-blue.
4. Tokens over raw colors — new code uses semantic tokens (`text-muted`, surface/border vars).
