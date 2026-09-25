# ADR 0036: Azure AIDR uses metadata-only Foundry trace evidence

Date: 2026-09-14

Status: accepted and deployed

## Context

Denali correlates source declarations with Azure workloads, execution identities, models, and
declared tool/action surfaces. That graph describes what an agent is configured to do, but it does
not establish what happened during an execution.

Microsoft Foundry hosted agents can emit OpenTelemetry-compatible agent, model, and tool spans to
an Application Insights resource connected to the Foundry project. Microsoft documents that trace
content can include prompts, responses, system instructions, and tool arguments or results. Denali
does not need that content to establish an ordered execution graph and must not acquire it.

The provider contracts used here are Microsoft's documentation for
[Foundry agent tracing](https://learn.microsoft.com/azure/foundry/observability/concepts/trace-agent-concept),
[setting up tracing](https://learn.microsoft.com/azure/foundry/observability/how-to/trace-agent-setup),
[restricting sensitive trace content](https://learn.microsoft.com/azure/foundry/observability/how-to/traces-sensitive-content),
the Application Insights [query API](https://learn.microsoft.com/rest/api/application-insights/query/execute),
and Azure Monitor [RBAC operations](https://learn.microsoft.com/azure/role-based-access-control/permissions/monitor).

## Decision

1. Azure runtime collection is an opt-in plane on the existing tenant Azure connection. It uses
   the connection's consent-based service principal, selected subscriptions, Azure Resource Graph
   for bounded Application Insights discovery, and the Application Insights query API. Denali does
   not enable tracing or modify a customer's Foundry project, agent, Application Insights resource,
   diagnostic settings, or retention policy.
2. The collector requests an Azure Monitor data-plane token separately from its Azure Resource
   Manager token. Validation proves both bounded component discovery and a harmless Application
   Insights query before the connection is called healthy for this plane.
3. Collection is bounded per selected subscription, component, query, row count, and time window.
   The first run reads 30 minutes; later runs resume from the last cursor-safe durable job with five
   minutes of overlap and at most 24 hours of catch-up. A longer outage is explicit partial
   coverage. Trace/span identity makes the overlap idempotent.
4. The Kusto query performs an explicit server-side projection before telemetry leaves Azure.
   Denali requests only timestamps, duration, success/result metadata, trace/span hierarchy,
   operation names, service/project/agent/model/tool identifiers, session identifiers, and token
   counters. It never queries the sensitive content table and never projects prompt, response,
   system-instruction, tool-definition, tool-argument, tool-result, event-body, request-body, or
   response-body values. The normalizer rejects unexpected columns, discards unknown attributes,
   and persists `content_policy=metadata_only`.
5. Recognized operations are mapped into Denali's provider-neutral activity taxonomy: agent
   invocation, model invocation, tool invocation, retrieval, and reranking. Every event retains its
   Azure provider locator, exact trace/span hierarchy, and any exact session identifier.
6. Activity entities join existing inventory only through exact natural keys. Runtime collection
   does not manufacture assets, deployment correlations, or capability edges. Missing components,
   missing telemetry, an unsupported schema, or a query failure is partial/unknown coverage and is
   never presented as zero activity or proof of safety.
7. A five-minute Modal schedule creates the same PostgreSQL collection jobs used by manual and
   onboarding collection. It passes only tenant, connection, and job identifiers to a worker.
   Active-job uniqueness, leases, retry, stale-job recovery, and a durable cursor remain the
   survival boundary.
8. Sessions, evidence export, and the execution graph are provider-neutral read models. Existing
   AWS AgentCore exports retain their v1 schema and filename for compatibility, while Azure
   Foundry sessions identify their provider and use the same tenant-scoped API and UI contracts.
9. Existing deterministic runtime rules continue to operate only where their evidence
   prerequisites are satisfied. This change does not rename an AWS-specific rule into an Azure
   claim and does not add automated provider mutation. Response requests remain dual-control,
   manual-execution records.

## Azure prerequisites and boundaries

- The customer enables Foundry tracing and connects the project to Application Insights. Denali
  treats missing telemetry destinations as partial coverage.
- The Denali service principal needs read access to the selected subscription and the Application
  Insights query action (`Microsoft.Insights/Components/Query/Read`). The standard Azure Reader
  grant used by onboarding supplies the required read-only control-plane permissions; protected
  sensitive tables require a separate privileged role that Denali neither requests nor needs.
- Existing Azure connections do not silently gain the new scope. An administrator must explicitly
  opt in through connection setup so the durable collector cannot broaden access by itself.
- Application Insights retention, sampling, ingestion delay, and telemetry completeness remain
  customer-controlled. Denali reports the observed coverage boundary rather than inferring absent
  activity.

## Consequences

- The same execution graph can show Azure Foundry agent, model, and tool activity without creating
  a parallel Azure-only investigation experience.
- Server-side projection plus a fail-closed normalizer minimizes data before it crosses the
  provider boundary; Denali's database never receives generative-AI content from this collector.
- Polling is near-real-time rather than streaming. The overlap favors continuity and duplicate
  safety over second-level latency.
- Customers retain responsibility for enabling and governing their own Azure telemetry. Denali is
  a read-only consumer and does not become their observability control plane.

## Production acceptance

Production acceptance completed on 14 September 2026 against the experimental Anna reference
agent in subscription `8cd2b4cc-c789-466d-a8f7-8f51fb20985d`:

- the hosted Azure setup and validation flow created healthy connection
  `a9924478-c6de-4893-bce6-c39c1494fc4b` with the runtime plane explicitly selected;
- a fresh synthetic Anna session emitted one agent request, one model chat, and two tool spans to
  Application Insights;
- the five-minute production scheduler created a durable `azure_agent_runtime` job, which
  completed for one selected subscription and two discovered Application Insights components;
- Denali retained one provider-neutral session with six normalized activities: two agent, two
  model, and two tool invocations;
- every event used `azure_application_insights_foundry_span` evidence, carried
  `content_policy=metadata_only`, and produced complete
  `azure_foundry_agent_runtime_activity` coverage; and
- an aggregate inspection found zero prompt, response, system-instruction, tool-argument,
  tool-result, request-body, or response-body fields in retained attributes or evidence payloads.

The production Runtime page displayed the `anna-aidr` session, model invocation, and both tool
calls. Seventeen entity references remained unresolved against independently collected inventory;
the graph displays them as references and does not manufacture asset identity. The acceptance
therefore proves collection, persistence, privacy, coverage, and UI presentation, but not complete
runtime-to-inventory correlation.
