# ADR 0017: Evidence-led runtime detections

## Status

Accepted for the first runtime-detection vertical slice.

## Context

Runtime telemetry describes what a source observed. A failed sign-in, successful
consent change, model invocation, or tool call is not automatically a security verdict.
At the same time, preserving activity without evaluating well-defined harmful patterns
would leave Denali as a log viewer rather than an AI security platform.

The first detection slice must therefore convert only narrow, reproducible conditions
into detections while preserving the distinction between:

- raw activity observations;
- independently collected inventory and relationships;
- deterministic rule evaluations;
- detections, which are durable security records; and
- issues, which compose several findings or detections with proven graph paths.

## Decision

1. Runtime rules are pure, deterministic functions over normalized activity and
   independently collected inventory. The persistence layer supplies evidence; it does
   not contain hidden security heuristics.
2. A runtime detection requires an exact link to an independently inventoried asset of
   the expected kind. An unresolved reference, display-name match, or activity-created
   entity cannot satisfy that requirement.
3. `DENALI-RUNTIME-ENTRA-FAILURES-001` detects at least three failed sign-ins by the
   same exact actor to the same exact AI application in a sliding 24-hour window. The
   actor and application are both part of the grouping key. Activity outside the
   qualifying window is not evidence for that occurrence.
4. `DENALI-RUNTIME-ENTRA-CONSENT-001` detects a successful consent or delegated
   permission change concerning an active, unreviewed AI application. Correlated audit
   rows with the same application, actor, and trace or correlation identifier form one
   occurrence rather than duplicate detections.
5. Consent severity is high only when the winning, active application assertion
   independently reports a high-impact delegated scope. Otherwise the detection is
   medium. An audit event does not manufacture permission scope.
6. Every detection stores stable references to its supporting activity records and
   asset assertions. It also records the exact rule, severity, timestamps, bounded
   attributes, and deterministic fingerprint used for idempotency.
7. Every evaluation records coverage separately from results. Complete coverage and no
   match means the evaluated condition was not observed within the declared source
   boundary. Partial, failed, unsupported, or unknown coverage never becomes a clean
   result.
8. Re-running a rule with the same evidence updates the same detection rather than
   creating another row. Distinct qualifying windows or actors retain distinct
   evidence-backed identities.
9. Event-backed detections do not auto-resolve solely because time passed and the event
   fell outside a later rolling query. That would erase a historical incident without
   evidence that it was remediated. Explicit lifecycle evidence or a human decision is
   required before resolution.
10. Detection evidence is bounded. Denali retains stable identifiers, operation and
    result metadata, event timestamps, correlation identifiers, and scope names needed
    for the rule. It does not retain access tokens, secrets, IP addresses, or prompt and
    response content.
11. AWS AgentCore rules extend this contract with declared-versus-observed model drift,
    unapproved tool use, and retrieval-to-mutation sequence review. Exact rule and coverage
    semantics are in [ADR 0035](0035-aws-agentcore-runtime-detection-and-response.md). In
    particular, an unresolved tool name can support a negative inventory conclusion only when
    runtime, agent, and gateway-target coverage are complete.

## Initial rule boundaries

The first slice intentionally does not claim to detect:

- password spraying across many applications or actors;
- impossible travel, unfamiliar location, or device risk;
- malicious prompt or response content;
- anomalous model usage volume or cost;
- semantic judgment about harmful prompt, response, or tool content; or
- whether an OAuth permission was actually exercised.

Those require additional identity, network, behavioral-baseline, content-safety, or
tool telemetry. Their absence remains visible as unimplemented coverage rather than a
zero-risk claim.

## Consequences

- Operators can move from raw Entra activity to two explainable, evidence-linked
  security detections without losing source fidelity.
- Repeated failed sign-ins and high-impact consent changes remain reviewable after the
  original time window passes.
- Inventory governance influences the consent rule only through an explicit `unreviewed`
  state; application discovery alone is still not a finding.
- Detection detail can show the actor, application, correlated events, delegated
  scopes, and coverage boundary supporting the verdict.
- Future AWS, Azure, Google, MCP, and application-runtime rules can reuse the same
  contract without coupling Denali to a particular telemetry producer.
