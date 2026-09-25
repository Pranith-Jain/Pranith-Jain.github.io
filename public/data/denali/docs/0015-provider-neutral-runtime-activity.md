# ADR 0015: Runtime activity is an observation, not a security conclusion

**Status:** accepted — 2026-08-27

## Decision

Denali stores provider-neutral AI runtime activity as an append-only evidence stream.
The bounded adapters cover AWS Bedrock CloudTrail management activity, metadata-only AWS
AgentCore OpenTelemetry/OpenInference spans, Google Cloud Vertex AI audit logs, Google Workspace
Gemini audit activity, and Microsoft Entra AI-application sign-ins.

An activity record answers what happened, when, where, by whom, and with what observed
outcome. It does not by itself assert maliciousness, policy failure, exploitability, or
reachability. Those conclusions require separate deterministic detection or issue rules.

Activity entity references are reconciled to inventory only by an exact identifier that
was independently collected. Unmatched actors, models, agents, tools, workloads, and
applications remain visible as unresolved references. Activity ingestion never creates
inventory assets or capability relationships.

## Evidence and collection semantics

Each event retains a digest and bounded source payload, provider event identity,
timestamp, actor, category, outcome, session or trace context when supplied, and entity
references. Duplicate provider events are idempotent within their connector and
connection.

Coverage is explicit. A malformed sibling, truncated export, permission failure, or
unsupported record shape must produce partial or failed coverage; it cannot be presented
as an empty activity stream. A cursor may advance only after the destination has
confirmed the corresponding batch was accepted.

Provider-specific constraints remain visible:

- The live AWS connector reads only supported Bedrock management operations from
  regional CloudTrail Event History. It neither enables sensitive model-invocation
  content logging nor claims coverage of Agent Runtime data events.
- The separate AgentCore connector reads only CloudWatch span destinations, stores an allowlisted
  metadata projection, and discards prompts, responses, documents, tool arguments, and tool
  results. Its exact session and correlation rules are in [ADR 0035](0035-aws-agentcore-runtime-detection-and-response.md).
- An AWS assumed-role session is retained as the observed actor while its independently
  collected IAM role is used as the exact inventory correlation key.
- The live Vertex connector queries only `aiplatform.googleapis.com` Cloud Audit Log
  entries. Query completion and source-side Data Access logging configuration are
  separate claims.
- Google Workspace records may contain multiple sibling events; every sibling is
  normalized independently.
- Entra licensing or permission failures are coverage failures, not zero sign-ins.
- Entra sign-ins are observations even when the application belongs to a curated AI SaaS
  catalog; risky classification is a separate rule.
- MCP discovery proves that a tool exists. Only runtime evidence proves invocation.

## Product boundary

Denali owns AI runtime visibility, deterministic detections, evidence-led investigation,
AI-specific session context, and evidence-bound response requests. Denali can record independent
approval while response execution remains manual. El Capitan owns generic validation, automated
change execution, rollback, and remediation lifecycle; Denali does not duplicate that change
engine.

## Consequences

- The activity UI can show successful, failed, and unresolved provider events without
  inflating issue counts.
- Runtime detections can be added incrementally while retaining their source evidence.
- Live pollers can reuse the normalized contract after their pagination, cursor,
  backpressure, and permission behavior is proven.
- OpenTelemetry and OpenInference traces reuse the activity contract without redefining activity
  as inventory or findings.
