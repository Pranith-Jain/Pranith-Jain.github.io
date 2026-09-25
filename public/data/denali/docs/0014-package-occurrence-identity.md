# ADR 0014: Package locations are evidence, not component identity

## Status

Accepted on 2026-08-27.

## Context

Syft and Grype can attach several filesystem evidence paths to one installed
package. Denali initially treated each path as a separate software-component
occurrence. A Debian package represented by its status record and seven package
metadata files therefore produced eight component and vulnerability occurrences,
even though the scanner reported one artifact identifier.

That model overstated affected package occurrences and repeated the same
vulnerability in the product experience.

## Decision

Within one scan target, a component's canonical identity is its normalized PURL,
or its ecosystem, package type, name, and version when no PURL exists. Filesystem
locations do not participate in the canonical key.

All bounded, unique scanner locations remain attached to the component assertion,
containment assertion, vulnerability evidence, and normalized scanner attributes.
The first location remains in the singular `location` field for compatibility;
`locations` is authoritative when present.

Scanner artifact identifiers remain source-specific evidence. They may correlate
Syft and Grype observations for the same target when package name, version, and
package type also agree, but they do not replace Denali's scanner-neutral identity.

## Consequences

- One package version in one target produces one software-component occurrence,
  even when the scanner cites many supporting files.
- One scanner match produces one vulnerability occurrence for that package.
- Evidence paths remain available for investigation and audit.
- Multiple installations of the same package version in one target are currently
  one risk occurrence. A future install-instance discriminator must be independent
  of individual evidence files.
- Existing observations are reconciled through an authoritative re-import. Old
  assertions and vulnerability observations are withdrawn, not deleted, so their
  provenance and history remain available.
