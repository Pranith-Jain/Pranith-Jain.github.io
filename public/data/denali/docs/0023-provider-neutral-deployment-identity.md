# ADR 0023: Deployment correlation uses provider-neutral identity requirements

## Status

Accepted.

## Context

The first code-to-cloud slice encoded AWS CDK Lambda and ECS matching directly in the
correlator. Google Cloud, Azure, and Kubernetes need different independently observed
identifiers, but they must share the same evidence and disposition behavior. Copying the
correlator per provider would make ambiguity, provenance, and coverage semantics diverge.

## Decision

A deployment identity consists of:

- a cloud provider boundary;
- a provider-neutral runtime kind;
- one or more scoped identifier requirements; and
- an explicit comparison for each requirement, currently exact or prefix.

A declaration matches an observed target only when provider and runtime kind are equal and
every required identifier is satisfied by an independently observed identifier with the same
name. Comparisons are directional: a declared prefix may match a longer observed identifier;
an observed value never broadens a declaration's requirement.

Provider adapters own declaration parsing and the identifier contract for their supported
framework and runtime. Inventory collectors emit `provider`, `runtime_kind`, and
`deployment_identifiers`. The shared correlator owns candidate disposition, ambiguity
handling, relationship persistence, and evidence presentation.

The initial adapter preserves the accepted AWS joins:

- Lambda is `aws` + `serverless_function`, CloudFormation logical-ID prefix, and exact
  function name.
- ECS is `aws` + `container_task`, CloudFormation logical-ID prefix, and exact container name.

Persisted AWS observations from before this ADR receive a narrow read-time normalization.
No legacy inference is provided for new providers; their collectors must emit the complete
identity contract.

## Consequences

- Similar names across providers or runtime types cannot match.
- Google Cloud and Azure adapters can reuse dispositions and evidence without inheriting AWS
  identifiers.
- Adding a provider requires both an independent target collector and an explicit source
  declaration adapter.
- Artifact identity and source-revision attestation remain separate from deployment identity.
- Unsupported, incomplete, unmatched, and ambiguous declarations continue to create no edge.
