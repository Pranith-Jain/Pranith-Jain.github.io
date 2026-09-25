# ADR 0005: Evidence-bearing issue correlation

## Status

Accepted.

## Decision

Denali issues are deterministic projections over separately persisted findings,
inventory assertions, and relationship assertions. Issue records retain foreign-key
links to every contributing finding, asset, and relationship. They do not copy a finding
resource reference into inventory and do not manufacture graph edges.

The initial rule confirms an agent-to-sensitive-data write issue only when all of the
following are present:

1. An open, failed `identity.overprivileged` signal referencing an observed identity by
   exact natural key.
2. An open, failed `tool.write_without_confirmation` signal referencing an observed AI
   tool by exact natural key.
3. The same observed agent `runs_as` that identity.
4. The agent `can_invoke` that tool.
5. The tool `can_write` an observed datastore classified as sensitive, confidential, or
   restricted.

Every path asset and traversed relationship must be active, at least 0.8 confidence,
and observed or externally verified. Relationships must also be capability-category.
Declared or inferred inventory and relationships are not sufficient for this rule.

## Lifecycle

- Confirmed candidates are open issues.
- If a contributing finding is explicitly no longer open and failed, the issue resolves.
- If the findings remain open but correlation becomes incomplete or ambiguous, the issue
  becomes unknown rather than resolved.
- Rule-evaluation coverage is persisted independently from issue counts.

## Consequences

Denali may show fewer issues than a product that treats resource references as graph
facts. That is intentional. A visible unknown is more trustworthy than a fabricated
attack path, and the complete evidence chain remains inspectable in the UI and API.
