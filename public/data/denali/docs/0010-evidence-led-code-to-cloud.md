# ADR 0010: Code-to-cloud lineage requires independent identifiers

## Status

Accepted.

## Decision

Denali correlates a source repository to a deployed AI workload only when independent
code and cloud observations agree on deployment-specific identifiers.

The common provider/runtime/identifier contract is defined by
[ADR 0023](0023-provider-neutral-deployment-identity.md). This ADR retains the exact
identifier rules for the first AWS adapter.

For the first AWS CDK slice, a deployment link requires:

- Lambda: a literal `functionName`, a CDK construct identifier, an exact observed
  Lambda function name, and an observed CloudFormation logical ID with that construct
  prefix; or
- ECS: a literal `containerName`, a task-definition construct identifier, an exact
  observed container name, and an observed CloudFormation logical ID with that
  construct prefix.

The resulting active relationship is
`(:AIWorkload)-[:DEPLOYED_BY]->(:CodeRepository)`. It is an `inferred` assertion with
confidence `1.0`: the relationship is derived rather than directly returned by either
source, while the accepted join is deterministic and exact within this connector's
declared scope.

A shared model identifier, repository display name, application tag, or approximate
name is never sufficient to create a deployment edge. Multiple matching live targets
make coverage partial and produce no edge. Unsupported or dynamic deployment
declarations likewise remain visible as coverage limitations rather than negative
claims.

## Evidence boundary

The edge retains the repository revision, source path and line, construct identifier,
literal deployment identifier, optional entry path, observed workload key, observed
CloudFormation logical ID, and the locator of the independent control-plane evidence.
It does not store source snippets, environment values, prompts, payloads, or secrets.

The repository revision on the correlation observation is analysis context, not proof
that the deployed bytes were built from that revision. Deployment-artifact identity and
source-revision attestation are separate claims governed by
[ADR 0012](0012-deployment-artifact-provenance.md).

The correlator evaluates only active Lambda and ECS AI workloads independently observed
by the bounded AWS stack connector. A source declaration with no eligible target is not
proof that no deployment exists outside that connector's visibility.

## Finding applicability

Repository posture findings remain attached to the repository and their source call
sites. A proven repository-to-workload deployment edge does not, by itself, establish
which workload executes a particular call site when one repository builds multiple
artifacts. Denali therefore presents those findings as repository-level context and
does not create workload findings or correlated security issues from them.

Call-site-to-artifact evidence now narrows this boundary under the separate contract in
[ADR 0011](0011-static-artifact-inclusion.md). A deployment edge alone still leaves the
finding repository-wide; only a supported, evidence-bearing artifact trace may classify
the source module as included.

## Consequences

- The code-to-cloud UI can show an evidence-backed source-to-runtime chain without
  turning visual proximity into a security conclusion.
- An IaC declaration that is deployed but not classified as an observed AI workload is
  not silently added to the AI inventory.
- Reconciliation can withdraw a prior deployment edge only after a complete rerun of
  this connector's relationship plane no longer observes the accepted join.
- Additional IaC languages, cloud services, and build systems require their own explicit
  identifier contracts and coverage behavior.
