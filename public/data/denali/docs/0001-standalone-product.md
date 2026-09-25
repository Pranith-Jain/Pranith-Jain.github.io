# ADR 0001: Denali is a standalone product

**Status:** accepted — 2026-08-26

## Decision

Denali owns its user experience, authentication boundary, canonical store, domain model,
API, deployment, and release lifecycle.

Prowler is the first reference CSPM integration. It is not Denali's application shell,
identity provider, database, or required runtime. Other CSPMs and cloud-security services
connect through the same public connector boundary.

## Product hierarchy

The product has four related layers:

1. Inventory — durable resources, identity, relationships, governance, and coverage.
2. Findings — atomic security facts with evidence.
3. Issues — deterministic correlations and attack paths over resources and findings.
4. Threats — observed activity and investigations.

This hierarchy is also the implementation order. Runtime work must not distort the
inventory contracts, and findings must not become substitute inventory records.

## Consequences

- The Prowler UI patch set is not imported.
- Prowler JWTs are not Denali's native identity model.
- Prowler's Neo4j graph may be queried by an optional relationship provider, but Denali's
  own store remains authoritative for first-party AI facts.
- Existing detectors, MCP observation, evidence, reconciliation, Bedrock collection, and
  path logic are candidates for extraction after contract review.
- Shasta is retired. Its relevant AI UX patterns may be reimplemented; its AWS SaaS,
  generic CSPM, SOC, mobile, and voice infrastructure are not carried forward.
