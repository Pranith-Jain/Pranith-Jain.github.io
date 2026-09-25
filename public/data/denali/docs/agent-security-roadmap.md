# Denali agent security roadmap

Date: 2026-09-15

Last updated: 2026-09-17

## Product direction

Denali is the independent evidence, detection, and containment layer for autonomous AI activity
across source, cloud, identity, workload, runtime, and response systems. It makes activity
attributable, independently observable, coverage-aware, investigable, and containable without
claiming to solve model alignment or prevent unknown vulnerabilities.

The July 2026 OpenAI and Hugging Face incident sharpened this direction. OpenAI reported that
agents escaped intended isolation, communicated through an unintended shared channel, obtained
internet access, used exposed credentials, compromised third-party infrastructure, and moved
laterally across systems. METR independently reported large-scale agent coordination and
successful small-scale tool-call spoofing in part of the reviewed transcript set. The product
lesson is that a prompt or a self-reported trace is not sufficient evidence of what an agent did.

Primary sources:

- [OpenAI incident account and response](https://openai.com/index/hugging-face-incident-and-the-road-ahead/)
- [METR independent investigation](https://metr.org/blog/2026-08-26-openai-hugging-face-incident-investigation/)

Denali will therefore preserve its metadata-minimizing boundary while prioritizing independently
collected effects: exact identities, credential use, tool and destination activity, workload and
network boundaries, evidence provenance, coverage gaps, and reversible response.

## Delivery rule

Priorities are sequential release gates, not labels for parallel feature accumulation. P1 does
not begin until every P0 software control is merged and deployed and every external acceptance
item is either evidenced or recorded as an explicit blocker. A passing unit test, healthy
connection badge, configuration value, or mock provider response cannot substitute for hosted
acceptance against the real provider boundary.

## P0 — trustworthy provider and operating foundation

P0 covers AWS, Microsoft Azure, Google Cloud, Microsoft Entra, Google Workspace, GitHub, and Azure
Repos. Its purpose is to prove that Denali can safely onboard, validate, collect, isolate, operate,
and retire every connection before runtime attribution is expanded.

### Provider exit contract

Each provider requires one dated, redacted production record containing:

1. an authenticated `org:admin` creates the connection without submitting a customer secret;
2. setup or callback binds the exact customer account, tenant, domain, installation, project,
   subscription, or repository scope through expiring one-time state where applicable;
3. validation calls every declared read-only plane and records independent passed, failed,
   partial, unsupported, or unknown results;
4. a successful healthy validation queues the provider's durable primary collection;
5. collection survives API-container replacement, rejects duplicate dispatch, uses bounded retry
   and leases, and records explicit coverage independently from connection health;
6. the UI exposes collected evidence and its coverage without manufacturing identity or safety;
7. `org:member` receives `403` for setup, validation, collection, disable, and delete mutations;
8. another organization receives `404` and cannot read or mutate the connection, jobs, evidence,
   or retained history;
9. disable prevents new validation and collection and waits for active jobs to finish;
10. delete requires the disabled state and exact display-name confirmation, removes connection
    configuration, and retains previously collected evidence; and
11. customer-side revocation and Denali-side rollback instructions are verified and recorded.

Use the [hosted provider acceptance record template](../deployment/provider-acceptance-template.md)
so every provider is judged against the same evidence contract.

Provider-specific acceptance must additionally prove:

| Provider         | Required scope evidence                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS              | Exact account binding, enabled-Region discovery, every declared plane, keyless assume-role and external-ID boundary, deployment collection, and AgentCore runtime collection when selected   |
| Azure            | Exact tenant and selected-subscription binding, unselected-subscription exclusion, per-subscription partial state, deployment collection, and metadata-only Foundry collection when selected |
| Google Cloud     | Unique per-connection principal, exact selected-project binding, workload identity federation, per-project partial state, and deployment collection                                          |
| Microsoft Entra  | Exact customer tenant from one-time admin-consent state, disclosed fixed Graph application permissions, independent application/sign-in/audit planes, and evidence collection                |
| Google Workspace | Exact domain and delegated administrator, fixed disclosed read-only scope, independent Gemini and OAuth-report planes, and evidence collection without retained delegated tokens             |
| GitHub           | Verified App installation owner, exact repository selection, bounded immutable-revision source collection, and no retained installer or repository token                                     |
| Azure Repos      | Exact Entra tenant, DevOps organization, project and repository UUIDs, transient delegated proof, app-only validation, and bounded immutable-revision source collection                      |

### Shared operating exit contract

P0 is complete only when all of the following are evidenced:

- production configuration validation fails closed for every required provider group;
- validation and every collection kind use PostgreSQL jobs and Modal workers with durable
  identifiers, leases, duplicate suppression, bounded retry, sanitized failure, stale recovery,
  and API-container replacement coverage;
- the worker rejects a collection job whose kind does not belong to the connection's provider;
- two real Clerk Organizations containing non-empty evidence are tested for organization
  switching, member/admin authorization, and cross-tenant read and mutation isolation;
- the Neon pooled runtime role is distinct from the direct migration owner, has only required
  runtime privileges, and cannot perform schema administration;
- Neon backups and alerts are enabled and a dated restore drill meets the documented recovery
  objective;
- Modal worker failure/timeout alerts and Vercel deployment monitoring are enabled and exercised;
- logs contain bounded structured tenant, connection, and job identifiers but no credentials,
  tokens, callback codes, DSNs, provider payloads, prompts, or responses; and
- the full Python, PostgreSQL, frontend, and production build gates pass on the release revision.

### Current P0 evidence and gaps

This table is a planning snapshot. The linked dated acceptance records and launch checklist remain
authoritative.

| Boundary           | Current evidence                                                                                                                                                                                  | P0 gap                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS                | The dated AgentCore record retains hosted create/update/invoke, five-plane validation, durable collection, investigation/export, privacy inspection, disable, and post-disable retention evidence | Prove delete and post-delete retention on a different disposable connection; the accepted fixture remains disabled by operator decision                                       |
| Azure              | Production setup and healthy validation were observed; Foundry metadata-only AIDR is production accepted                                                                                          | Retain unselected-subscription, partial-state, disable, and delete evidence in a complete lifecycle record                                                                    |
| Google Cloud       | Production onboarding was reported working and live local project acceptance exists                                                                                                               | Retain a complete hosted lifecycle and collection record                                                                                                                      |
| Microsoft Entra    | Production consent and validation were observed                                                                                                                                                   | Retain a complete hosted lifecycle and collection record                                                                                                                      |
| Google Workspace   | Implementation, durable jobs, fixed-scope validation, and automated contracts exist                                                                                                               | Complete and retain the first hosted production lifecycle and collection record                                                                                               |
| GitHub             | Production installation is healthy across five exact repositories and all 15 validation planes; a 2026-09-17 collection completed source, inventory, and posture for all five                     | Retain a complete hosted lifecycle record; Shasta code-to-cloud coverage remains explicitly partial because one Terraform deployment name is computed rather than one literal |
| Azure Repos        | Hosted lifecycle and code-to-cloud acceptance passed on 2026-09-10                                                                                                                                | Preserve a dedicated dated acceptance record with the complete evidence fields above                                                                                          |
| Tenancy            | Two real non-empty Clerk Organizations now contain separately scoped evidence; hosted switching and UI read isolation passed in both directions                                                   | Complete direct API read/mutation and member/admin outcomes in both directions                                                                                                |
| Neon operations    | Runtime and migration roles are split, the rotated runtime is active, and the obsolete owner CRUD compatibility grant has been removed                                                            | Project control-plane access is absent from the signed-in Neon identity; enable managed alerts/backups and complete a restore drill after the owner grants access             |
| Runtime operations | Modal timeout alerting passed; privacy-safe Vercel Web Analytics code is merged and deployed; protected production and Vercel deployment checks are succeeding                                    | The GitHub identity is not linked to the existing Vercel account; log in with that account, link GitHub, then enable Web Analytics and exercise the dashboard/runtime path    |

On 2026-09-15, the deployed identifier-only status function reported 20 active connections across
seven Denali tenants and included every P0 provider. Thirteen connections were healthy, three were
partial, and four were unhealthy. Ten had a complete latest primary collection, four had a partial
latest collection, and six had none. No validation or collection job was running. This confirms
real deployed breadth and durable status visibility; it does not prove lifecycle acceptance,
tenant isolation, freshness, or correctness of the partial and unhealthy boundaries.

The Modal half of the runtime-operations gate passed on 2026-09-15. The
[dated alert record](modal-alert-hosted-acceptance-2026-09-15.md) retains the enabled notification
settings, an isolated ten-second timeout, immediate failure-email delivery, and drill cleanup.
Vercel monitoring remains open and P0 is not complete.

The Neon role split passed its database and fresh-container checks on 2026-09-15. A later protected
production deployment replaced the warm Modal application, and on 2026-09-17 the obsolete owner
CRUD compatibility grant was removed before the deployed status function again succeeded through
the rotated runtime DSN. See the [dated least-privilege record](neon-role-split-2026-09-15.md).
Managed backup, alert, and restore controls remain open because the available Neon dashboard
identity has no access to the production project.

## P1 — trusted agent execution evidence

P1 turns the provider-neutral execution graph into an evidentiary control plane. Resolve exact
provider-native project, agent, model deployment, tool, workload, execution identity, credential,
destination, source revision, and policy configuration. Record source provenance, collector
identity, provider and ingest timestamps, sequence integrity, duplication, and explicit evidence
gaps. Treat runtime-supplied traces as claims until independently corroborated by cloud audit,
identity, network, or workload evidence.

Initial success criteria:

- accepted AWS AgentCore and Azure Foundry sessions have no resolvable entity left as a name-only
  reference;
- joins are exact and deterministic, with ambiguous or missing candidates remaining unresolved;
- evidence exports identify provenance and coverage for every event and relationship; and
- a tampered, missing, duplicated, or contradictory runtime record cannot silently become an
  authoritative fact.

## P2 — agent detections and bounded containment

Add explainable detections for unauthorized cross-run communication, new or prohibited external
destinations, credential discovery followed by use, privilege escalation, lateral movement,
persistence after repeated task failure, coordinated activity across isolated executions, and
logging interruption or contradiction.

Add durable, reversible containment for an exact execution, workload, egress rule, scoped
identity, connection, destination, or tool. Provider mutation remains separately permissioned,
dual-control, precondition-checked, verified after execution, auditable, and rollback-capable.
Autonomous destructive remediation remains out of scope.

## P3 — open cross-system evidence ingestion

Accept bounded OTLP, OpenTelemetry GenAI, and OpenInference metadata plus identity, network,
workload, and cloud-audit evidence. Preserve the same provenance and coverage rules as first-party
collectors. Raw prompts, responses, chain of thought, tool arguments, and tool results remain
excluded by default. A customer may later opt into a separately designed content boundary;
content-derived monitors should initially emit only verdict, category, confidence, monitor
version, event reference, and optional content hash.

## Later priorities

After the operational detection and response loop is accepted, deepen AISPM ownership,
permissions, data-access posture, policy packs, exceptions, regulatory mapping, integrations,
scale, and proof-of-value packaging. Do not trade exact evidence for provider breadth, implement a
proprietary prompt firewall as the initial wedge, or describe missing telemetry as a safe result.
