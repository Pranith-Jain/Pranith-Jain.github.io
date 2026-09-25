# ADR 0012: Deployment artifact identity is separate from source revision

## Status

Accepted.

## Decision

Denali represents three code-to-cloud claims independently:

1. a source declaration correlates to an observed workload through exact deployment
   identifiers;
2. a source call-site module is included in that declaration's supported artifact graph;
3. the live deployment artifact has a particular identity and, separately, may or may not
   attest a source-control revision.

The bounded AWS stack connector records deployment metadata without downloading code:

- Lambda: the processed CloudFormation S3 bucket and key plus the Lambda `CodeSha256`; and
- ECS: the exact image reference on the model-backed container in the active task
  definition.

The code-to-cloud connector may report `artifact_identity_status=matched` only when that
exact live S3 locator or container repository/tag appears in an inspected local CDK asset
manifest. It records the manifest path and CDK asset identifier used for the comparison.

An exact manifest locator match does not attest a Git commit. CDK asset manifests do not
carry an independently verifiable VCS revision, can be stale, and may have been produced
from a dirty worktree. Denali therefore reports `source_revision_status=unattested` even
when artifact identity matches. The repository revision and dirty marker remain analysis
context only.

## Negative and incomplete results

- No deployed artifact metadata or no local manifest means `not_evaluated`.
- A deployed locator absent from the inspected manifests means `not_matched`; it is not
  called drift because manifest coverage may be incomplete.
- A denied or malformed CloudFormation template read makes AWS stack coverage partial and
  cannot authorize withdrawal by absence.
- A manifest parse failure makes code-to-cloud coverage partial.

## Evidence boundary

Denali stores artifact locators, content hashes exposed by AWS, image references, CDK asset
identifiers, repository revision context, and manifest paths. It does not download Lambda
packages, pull container images, execute build tooling, retain arbitrary environment
variables, or infer a commit from timestamps.

Future source-revision attestation requires deployment metadata that cryptographically or
otherwise independently binds the immutable deployed artifact to a VCS revision. A tag,
branch name, local manifest timestamp, or clean worktree alone is insufficient.
