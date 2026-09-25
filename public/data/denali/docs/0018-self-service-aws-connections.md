# ADR 0018: Self-service connections start with bounded AWS role onboarding

## Status

Accepted for the first self-service connection slice.

## Decision

Denali represents a provider connection independently from the inventory, findings,
activity, detections, and issues collected through it. A connection records its provider,
lifecycle, credential reference, declared scopes, coverage plan, last validation, and
health state. Deleting connection configuration never deletes previously collected
evidence.

The first provider is AWS. Denali generates a CloudFormation template that creates a
read-only IAM role trusted by an operator-supplied Denali principal ARN and a generated
external ID. Denali does not create, accept, return, or persist AWS access keys. Normal
connection responses expose the role ARN but not the external ID; the external ID appears
only as the `NoEcho` parameter default in the setup template and in the internal role
assumption target.

AWS connections default to the stable physical IAM role name `DenaliSecurityAuditRole` for
compatibility with the operator role's least-privilege `sts:AssumeRole` policy. An AWS account
can therefore have only one default Denali onboarding role at a time. Before replacing a
connection for the same AWS account, the customer must delete the previous Denali CloudFormation
stack (or otherwise remove its role) and wait for deletion to complete. Denali must surface an
`AlreadyExists` stack failure rather than implying that validation can repair the conflict.

The primary hosted onboarding path is CloudFormation Quick Create, not a shell installer.
Denali renders the same connection-specific template as the download path, uploads it under
an unguessable key in a private S3 onboarding bucket, and returns a console URL containing a
one-hour-or-shorter presigned template URL, stable stack name, and the configured Denali
principal ARN. The external ID is not placed directly in the console URL. The object has
`no-store` cache metadata and server-side encryption; deployment must add an S3 lifecycle
rule that removes onboarding objects after one day. The download remains an explicit
fallback when the publisher is not configured or an organization requires manual review.

A launch record stores only the template version, exact SHA-256, intended principal ARN,
publication time, and URL expiration. It never stores the S3 key, presigned URL, or external
ID. This is evidence of the configuration Denali prepared, not evidence that the customer
created an unchanged stack. Connection health continues to depend exclusively on live role
assumption, exact account binding, Region discovery, and declared plane probes.

Post-deployment validation is deterministic and ordered:

1. Assume the exact configured role and call STS to bind the observed account ID.
2. Refuse a healthy result if the observed account differs from the declared account.
3. Call `ec2:DescribeRegions` and record the enabled/opted-in Region set and observation
   time. Automatic coverage, the default, evaluates every enabled Region and rediscovers
   that set on every validation. Selected-region coverage is an explicit restriction and
   records enabled Regions excluded by the selection.
4. Make one bounded read-only call for every declared collection plane in every in-scope
   Region. The planned CloudFormation stack location is recorded separately and never defines
   inventory coverage; the role it creates is account-wide.
5. Store each plane result independently. SDK failures are reduced to an AWS error code or
   exception class; messages and response bodies are not retained.

Validation runs outside the initiating HTTP response because automatic coverage can span
many service/Region combinations. The API returns an accepted/running state immediately;
clients poll connection state until the new validation is atomically recorded. Regional
probes use a bounded worker pool with isolated AWS SDK sessions plus bounded connection,
read, and retry limits. Result ordering remains deterministic, while unavailable endpoints
cannot hold the workflow behind SDK defaults or temporary-credential lifetime for several
minutes.

Quick Create begins a bounded onboarding validation job while the customer reviews the
stack. Credential failures are retried for at most 15 minutes and are not persisted as an
intermediate access conclusion. The first credential success proceeds through every normal
plane, while expiration persists the final credential failure. Manual **Validate again**
remains a single deterministic attempt.

The UI must keep that durable wait visible after route changes, distinguish the role-deploy
wait from plane validation, state the 10-second retry cadence and 15-minute ceiling, and
direct the user to CloudFormation stack Events when AWS reports a rollback. Denali cannot
read CloudFormation status until the configured role exists and can be assumed.

The initial regional planes are Bedrock Agents Classic agents and guardrails; AgentCore
runtimes, gateways, workload identities, and memories; Bedrock management activity in
CloudTrail Event History; and Bedrock invocation-logging configuration. Resource-specific
detail reads are exercised by collection only when a matching resource exists, and this
limit remains explicit in validation results. Successful authentication with any failed
top-level plane is `partial`, not healthy. Failed authentication or account binding is
`unhealthy`; unattempted planes stay `unknown`. A service without an SDK endpoint in a
discovered Region is `not_applicable`, which remains visible and is never interpreted as
an empty inventory result. If automatic Region discovery fails, regional planes remain
unknown and the connection cannot be healthy.

An opted-in `aws.agent_runtime_activity` plane also validates metadata-only AgentCore span access
through `logs:DescribeLogGroups` and `logs:FilterLogEvents`. The v2 onboarding template adds
`logs:FilterLogEvents` for that declared scope; `logs:DescribeLogGroups` remains part of the
baseline read-only discovery policy. Existing stacks must be updated before the plane can be
healthy. Collection and detection semantics are defined in
[ADR 0035](0035-aws-agentcore-runtime-detection-and-response.md).

## Scope boundary

The onboarding role also contains the bounded read-only permissions already required by
Denali's explicit CloudFormation-stack inventory and posture connectors. No stack is
declared in this connection slice, so those planes are shown as not configured and are not
included in connection health. A future stack-scope contract must add the stack identifier
and its own coverage plan before Denali may claim that validation.

The template grants no remediation, workload invocation, task execution, role passing,
secret retrieval, prompt access, or response access. GCP, Azure/Entra, GitHub, Slack, and
Jira remain outside this slice.

## Lifecycle safeguards

An active connection must be disabled before deletion, and deletion requires its exact
display name as confirmation. Disabling prevents further validation. Deletion removes the
connection configuration and validation history while retaining all evidence already
collected under the connection identifier.

## Consequences

A connection's health describes access to its declared planes at one validation time. It
does not state that a collection completed, that no findings exist, or that an AWS account
is secure. Collection coverage remains an independent evidence claim with its own source,
scope, and observation time.
