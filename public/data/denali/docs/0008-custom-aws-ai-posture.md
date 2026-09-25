# ADR 0008: Custom AWS AI posture is a separate evidence source

## Status

Accepted

## Context

Custom Lambda and ECS applications that call foundation models do not expose the same
control plane as managed Bedrock Agents. Applying managed-agent checks to those systems
would produce false assurance and false findings. Denali nevertheless needs posture
facts that can be reconciled, explained, and resolved independently of inventory.

## Decision

`denali.aws_stack_posture` evaluates one explicit CloudFormation stack and produces
atomic configuration findings. It independently establishes which Lambda functions and
ECS task definitions are model-backed, then reads only the control-plane metadata needed
for these checks:

- effective inline and attached execution-role policies for Bedrock invocation grants
  with wildcard model identifiers;
- account-and-region Bedrock model invocation logging configuration; and
- retention configuration on existing CloudWatch log groups used by model-backed
  workloads.

The connector emits only failed controls. A successful, complete scan is authoritative
for this connector, connection, and stack scope, so an absent prior failure is resolved.
Any denied, malformed, or incomplete detail read makes coverage partial and therefore
cannot resolve earlier findings.

## Evidence and privacy boundary

Denali retains allow-listed identifiers, evaluated action and resource patterns, policy
names, log-group names, and normalized control results. It does not retain arbitrary
environment values, policy conditions, log events, model prompts or responses, secret
values, AWS error messages, or application code. AWS errors are reduced to operation and
error code or class.

The model-family check does not treat a wildcard region on an exact global inference
profile as an unrestricted model grant. It flags only `*`, or wildcards inside the model
or inference-profile identifier. The invocation-logging check states only that Bedrock's
destination configuration is absent; it does not claim CloudTrail or application
telemetry is absent.

## Consequences

- Custom AI workloads receive meaningful posture checks without pretending they are
  managed Bedrock Agents.
- Findings remain separate from inventory assertions and cannot mint graph assets or
  edges.
- The initial checks are intentionally narrow. Data-resource protections, public entry
  points, code-level guardrail use, and effective capability paths require separate
  evidence planes rather than expansion by assumption.
