# ADR 0007: Discover custom AWS AI workloads from an explicit stack boundary

## Status

Accepted for the Anna live pilot.

## Context

Many production agents are ordinary Lambda functions or ECS tasks that call a model API.
They are not resources in Bedrock Agents Classic or AgentCore. Treating a successful empty
managed-agent scan as proof that no AI system exists would be a material visibility error.

Anna is the first concrete example: its CloudFormation stack contains a model-calling
Lambda application and an optional model-calling ECS proposal worker. The stack also
contains a renderer and supporting infrastructure that must not be labelled AI merely
because it is nearby.

## Decision

Denali adds a separate, stack-scoped AWS connector for custom applications.

- The operator supplies the CloudFormation stack and a stable Denali application ID.
- A Lambda function or ECS task is classified as an AI workload only when its control-plane
  configuration contains an allow-listed key ending in `MODEL_ID` and a bounded model ID.
- The explicit application boundary becomes one inferred AI agent linked to each observed
  model-backed workload.
- Workloads link to their observed execution roles and model identifiers.
- The model natural key is shared with the Bedrock connector:
  `aws:bedrock:model:<model-id>`.
- TypeScript and JavaScript repository discovery recognizes the same literal model
  declarations, without executing source code.

## Evidence and privacy boundary

The connector may call only `ListStackResources`, `GetFunctionConfiguration`, and
`DescribeTaskDefinition` after binding the account with STS. It does not call Lambda,
run ECS tasks, download deployment packages, retrieve secret values, or inspect runtime
traffic.

AWS responses are reduced in memory to an allow list. Evidence may retain resource IDs,
logical IDs, runtimes, container names, model configuration key names, and model IDs. It
must not retain arbitrary environment variables, secret references, exception messages,
container commands, or source artifacts.

## Failure semantics

- Failure to list the stack is `failed` coverage.
- A denied or malformed Lambda/ECS detail read makes both inventory and relationship
  coverage `partial`.
- Partial or failed coverage never authorizes withdrawal.
- A complete empty result means only that no compute resource inside the named stack met
  the explicit model-backed classifier.

## Consequences

This provides honest visibility for serverless and containerized agents without turning
Denali into a generic cloud inventory product. IAM permission analysis, supporting data
stores, network exposure, runtime activity, and model calls hidden behind opaque external
configuration remain later, independent collection planes.
