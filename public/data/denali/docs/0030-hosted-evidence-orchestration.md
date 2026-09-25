# ADR 0030: Healthy provider connections automatically collect and refresh derived evidence

Date: 2026-09-08

Status: accepted

## Context

Connection validation and evidence collection were independently durable, but they were also
independently initiated. A connection could therefore remain visibly healthy while it had never
collected evidence. Cloud deployment collection could also finish after GitHub source analysis,
leaving exact code-to-cloud dispositions stale until an operator happened to run source collection
again. Runtime detections and issues had no hosted trigger and could remain unevaluated even after
their source evidence arrived.

These gaps are unsafe for multi-tenant onboarding because a successful permission probe is not a
successful evidence run, and an absent scan or activity plane must not be rendered as zero risk.

## Decision

1. A durable validation worker that records healthy credentials and healthy declared-plane probes
   creates and dispatches the provider's primary durable collection job before completing the
   validation job. Existing active collection-job uniqueness remains the duplicate-dispatch guard.
2. AWS primary collection covers its declared Bedrock inventory, AgentCore inventory, bounded
   Bedrock management activity, invocation-logging configuration, and deployment scopes. Google
   Cloud primary collection covers declared Vertex AI inventory, Agent Builder/Dialogflow
   inventory, bounded Vertex audit activity, and deployment scopes. Entra, Azure, and GitHub retain
   their provider-specific bounded collectors.
3. Successful AWS, Azure, or Google Cloud collection dispatches source collection for each bounded,
   active, healthy GitHub connection in the same Denali tenant. Source analysis therefore observes
   the newest cloud targets. No tenant or connection identifier is accepted from the browser for
   this orchestration.
4. Every successful provider collection evaluates runtime-detection and issue rules for that
   tenant before the collection job completes. A transient evaluation failure uses the collection
   job's bounded idempotent retry path.
5. AWS control-plane observations retain CloudFormation logical IDs from AWS system tags and ECS
   container names as exact deployment identifiers. The source matcher remains strict; identity
   requirements are not weakened to recover links.
6. Product status separates validation from evidence readiness. Healthy-but-uncollected connections
   display `Collection needed`; complete collection displays `Ready`; partial or failed collection
   remains visible. Vulnerability and runtime pages display `N/A` when no non-fixture coverage plane
   exists. They display zero only after the relevant collector or scanner has established coverage.
7. Inventory, finding, vulnerability, activity, detection, and issue mutations take the same
   tenant-keyed PostgreSQL transaction advisory lock before touching evidence tables. Concurrent
   provider workers for one tenant therefore serialize their database mutations, while collectors
   for different tenants remain independent. The lock is transaction-scoped so it remains safe with
   pooled connections and releases automatically on commit, rollback, or worker failure.
8. A successful durable vulnerability evidence import evaluates tenant issue rules before the
   import job completes. Evaluation failures use the import job's bounded retry path, so scanner
   evidence cannot appear current while the issue view remains silently stale.
9. AWS AgentCore activity uses a five-minute Modal schedule that performs only bounded,
   identifier-only eligibility selection and durable job dispatch. Provider reads, evidence
   ingestion, detection evaluation, retries, and completion still occur inside the existing
   PostgreSQL job and Modal worker boundary. The scheduler neither uses process-local state nor
   claims streaming delivery. Cursor advancement comes only from a durable job whose regional
   reads were safe to advance; bounded catch-up exposes, rather than conceals, an outage over 24
   hours.

Vulnerability collection is not inferred from a cloud connection. It still requires a bounded SBOM
and scanner report for an exact artifact or target. Missing vulnerability coverage is therefore
`not assessed`, never `zero vulnerabilities`.

## Consequences

- New customer onboarding progresses from consent/setup through validation and first evidence
  collection without an undocumented manual step.
- Manual Collect actions remain available as explicit retries and refreshes.
- Provider collection may cause a bounded follow-on GitHub job and tenant rule evaluation, but all
  durable work is still represented by PostgreSQL jobs and Modal workers.
- A connection can be healthy while evidence needs attention; the UI no longer collapses those
  independent facts into one green badge.
- Existing connections need one validation or manual collection after rollout to enter the new
  orchestration path. Production repair is a post-merge, exact-main operation.
- A simultaneous all-provider refresh may perform provider reads concurrently, but tenant evidence
  writes and derived evaluation no longer deadlock each other.
