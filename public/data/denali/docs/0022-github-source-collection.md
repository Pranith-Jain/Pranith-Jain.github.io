# ADR 0022: GitHub source collection uses immutable, bounded snapshots

## Status

Accepted for the first GitHub-backed repository-to-runtime correlation slice.

## Decision

Source collection is an explicit operation after GitHub App onboarding and validation. It is
not implied by connection health. For every recorded repository, Denali:

1. revalidates the installation account and exact repository ID, node ID, and full name;
2. mints a short-lived installation token restricted to that one repository;
3. resolves the default branch to an immutable commit SHA;
4. reads the recursive Git tree by that SHA and rejects truncated or over-limit trees;
5. downloads only analysis-relevant regular blobs under fixed file and byte limits;
6. analyzes the snapshot without executing repository code; and
7. deletes the temporary source tree and drops the token when the repository run ends.

Analysis-relevant inputs include bounded application source, deployment configuration, MCP
configuration, and direct dependency manifests (`package.json`, `pyproject.toml`, and
`requirements*.txt`). Exact matches to the maintained AI framework and provider-SDK catalog
produce source-declared inventory. When a repository contains at least one such dependency or
another existing AI source signal, Denali emits one AI application for that repository revision,
links it to the repository, and retains the supporting file-and-line evidence.

This Git-only application inventory is deliberately labeled `declared`, with deployment and
runtime status `not_observed`. It does not require a cloud connection, but it also does not claim
that the application is deployed, running, reachable, approved, or safe. Cloud collection remains
the independent evidence required for code-to-cloud proof and runtime conclusions. A dependency
that is not in the high-confidence AI catalog remains ordinary software inventory and does not
create an AI application.

The persisted source locator is `github://repositories/{id}/commits/{sha}`. Temporary paths,
installation tokens, and raw source blobs are not stored. Existing repository inventory,
repository-posture, and code-to-cloud connectors receive explicit remote snapshot metadata so
their evidence cannot accidentally claim a local checkout.

## Correlation and observability

The code-to-cloud connector still requires an exact join between a literal deployment
identifier in supported IaC and an independently observed cloud workload identifier. A proven
candidate emits a `deployed_by` relationship at confidence 1.0. Unmatched and ambiguous
candidates emit no relationship.

Every declaration receives one structured disposition: `proven`, `ambiguous`, or `unmatched`.
The latest source-collection coverage and analysis coverage are queryable independently, so a
failed download, partial static analysis, zero declarations, and zero proven deployments do
not collapse into the same state.

## Safety limits

The first slice rejects repository trees above 20,000 entries, analysis selections above 2,000
files, individual blobs above 2 MB, and aggregate selected content above 25 MB. Symlinks,
submodules, excluded dependency/build/test trees, hidden directories, and irrelevant file
types are not materialized. A truncated GitHub tree is a failure, never complete coverage.

## Current limits

- The shared identity matcher is provider-neutral, but source and workload adapters currently
  support only the existing literal AWS CDK Lambda and ECS rules.
- The source revision is analysis context until an independently observed deployed artifact
  attests that revision.
- Git-only estate discovery covers high-confidence direct dependency and source declarations; it
  does not yet resolve transitive lockfile dependencies or prove that declared code is reachable.
- Background job ownership is process-local; durable leases across replicas remain deferred.
- GitHub Enterprise Server and repository lifecycle reconciliation remain deferred.
