# ADR 0035: AWS AIDR uses metadata-only AgentCore span evidence

Date: 2026-09-11

Status: accepted

## Context

Denali already correlates source declarations with AWS workloads, execution identities, models,
and declared tool/action surfaces. That graph describes what an agent is configured to do, but it
does not establish what happened during one execution. CloudTrail Event History supplies bounded
Bedrock management activity; it does not supply the ordered AgentCore tool and model spans needed
for agent detection and response.

AgentCore Observability emits OpenTelemetry-compatible runtime spans to CloudWatch Logs. Depending
on the AgentCore configuration and creation date, AWS stores them in per-runtime log groups or the
unified `aws/spans` group. Application instrumentation can add OpenTelemetry GenAI or OpenInference
child spans to the same trace.

The provider contracts used here are AWS's documentation for
[AgentCore Observability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability.html),
[runtime-generated span attributes](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-runtime-metrics.html),
[span destination and instrumentation configuration](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html),
[Gateway span attributes](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-gateway-metrics.html),
and the CloudWatch [`aws/spans` transaction store](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Transaction-Search-ingesting-span-log-groups.html).

## Decision

1. The first AWS AIDR plane reads AgentCore span log streams through the tenant connection's
   existing keyless assume-role session. It uses only `logs:DescribeLogGroups` and
   `logs:FilterLogEvents`; it does not enable observability, invocation logging, or workload
   instrumentation for the customer.
2. Collection is bounded per Region, log group, page, event count, and time window. The first run
   reads 30 minutes; later runs resume from the last cursor-safe durable job with five minutes of
   overlap and at most 24 hours of catch-up. A longer outage leaves an explicit partial-coverage
   gap before advancing the cursor. Trace/span identity makes overlap and mirrored unified/legacy
   destinations idempotent. No discovered log group is partial coverage, never zero activity.
3. Per-runtime `spans` streams are accepted directly. Records from shared `aws/spans` are retained
   only when their trace contains an AgentCore anchor such as an AgentCore resource ARN, agent ID,
   runtime operation, or service name. Recognized child spans on that anchored trace may then
   participate in the session.
4. Denali persists an allowlisted metadata projection: timestamps, duration, outcome, provider,
   account, Region, session, trace, span hierarchy, operation names, model/tool identifiers, usage
   counters, and evidence locators. Prompt/response text, messages, retrieval documents, request or
   response bodies, tool arguments, tool results, and unknown attributes are discarded before
   persistence. The stored content policy is `metadata_only`.
5. Activity entities join to existing inventory only through exact natural keys. Runtime activity
   does not create assets or capability edges. A session investigation is a read model over
   immutable events and includes ordered spans, parent IDs, exact entity links, detections, and the
   source coverage boundary.
6. A declared tool or action is shown as `observed` only when a successful tool event links exactly
   to that tool, and for an action, to the exact target in the same event. Names, trace proximity,
   failure outcomes, and unresolved references cannot promote capability state.
7. The initial deterministic AWS rules are:

   - `DENALI-RUNTIME-AWS-UNDECLARED-MODEL-001`: an exact model is successfully used by one exact
     AgentCore agent without an active declared assertion;
   - `DENALI-RUNTIME-AWS-UNAPPROVED-TOOL-001`: an exact non-approved tool is successfully invoked,
     or an unresolved tool is invoked while runtime, agent, and gateway-target inventory coverage
     are all complete; and
   - `DENALI-RUNTIME-AWS-RISKY-SEQUENCE-001`: retrieval is followed within five minutes in the same
     session by a successful tool whose metadata has a deterministic mutation verb.

   These are drift or review conditions, not claims of compromise or malicious intent. An
   unresolved negative join is forbidden unless the required inventory coverage is complete.
   Evaluation snapshots are capped at 50,000 recent activity records and 100,000 active assets;
   reaching either bound makes every otherwise-complete rule evaluation partial while retaining
   exact positive evidence.

8. A Modal schedule runs every five minutes but performs no provider reads itself. It selects a
   bounded identifier-only set of healthy, active, opted-in AWS connections and creates the same
   PostgreSQL collection jobs used by manual and onboarding flows. Active-job uniqueness, worker
   leases, bounded retry, and stale-job recovery remain the durability boundary.
9. Investigation provides a downloadable, versioned JSON evidence package over the same
   tenant-scoped read model. The package is explicitly marked `metadata_only`, is served with
   `no-store`, and contains no additional source fields beyond the bounded investigation view.
10. Investigation can create a bounded response request tied to the exact detection and,
    optionally, one of its linked assets. A different organization administrator must approve or
    reject it. This release records the approval with `execution_mode=manual`; it never mutates
    AWS. Provider execution, verification, rollback, and failure recovery require a separately
    reviewed durable executor before the mode may change.

## AWS prerequisites and boundaries

- The customer enables AgentCore Observability and any desired application instrumentation. Denali
  reports missing span destinations as partial coverage.
- The v2 onboarding template grants `logs:FilterLogEvents` when the
  `aws.agent_runtime_activity` scope is declared; `logs:DescribeLogGroups` remains a baseline
  read-only discovery permission. Existing roles must be updated before validation and collection
  can succeed.
- Bedrock Agents Classic `InvokeAgent` and `InvokeInlineAgent` are CloudTrail data events and are not
  logged by default. This AgentCore slice does not claim Classic-agent session coverage. Supporting
  those calls requires a separately configured, bounded data-event source and a later ADR.
- AgentCore vended application log bodies are not queried. Denali's metadata-only guarantee does
  not govern data that the customer independently retains in AWS.

## Consequences

- Denali's existing execution graph gains ordered runtime proof without weakening its distinction
  between declared, inferred, and observed evidence.
- Analysts can move from a detection to the exact session, span order, identity, model, tool,
  resource, and provider locator without granting Denali prompt access.
- Five-minute collection is near-real-time polling, not streaming. The overlap favors continuity
  and duplicate safety over second-level latency.
- Approval records establish a safe response control plane while deliberately leaving AWS change
  execution manual for this release.
