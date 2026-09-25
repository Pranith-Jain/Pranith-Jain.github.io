# ADR 0025: Azure code-to-cloud uses bounded Resource Graph inventory

## Status

Accepted for Azure Container Apps and Azure Functions. Live subscription, PostgreSQL,
reporting, and connected-browser acceptance passed on 2026-08-31 using an independently
observed Container App and an exact Azure resource-export identity join.

## Decision

Denali reads Container Apps and Function Apps through Azure Resource Graph using the existing
multi-tenant connection identity and each exact subscription selected during onboarding. The
collector requests only these resource types:

- `microsoft.app/containerapps`; and
- `microsoft.web/sites`, restricted to resources whose `kind` contains `functionapp`.

Each type has independent inventory and relationship coverage. A query is limited to 1,000
records per page, 100 pages, and 10,000 retained resources per type and subscription. A failed
type cannot withdraw observations from the other type. Every result is checked against its
full Azure resource ID, subscription, resource group, name, and expected resource type before
it can become inventory.

The accepted Azure Reader boundary already permits subscription-scoped Resource Graph reads.
The new `azure.code_to_cloud` scope adds Container Apps and Function Apps validation planes so
connection health proves that the same bounded entrypoints used by collection are callable.

## AI workload classification

Every valid result is retained as an observed `cloud_resource`. It becomes an `ai_workload`
eligible for correlation only when at least one bounded signal exists:

- the explicit tag `denali_ai_workload=true`; or
- an environment-variable **name** matching the model/deployment configuration-key contract,
  such as `AZURE_OPENAI_DEPLOYMENT_ID`.

Environment values, secret references, arbitrary provider responses, and tag values other
than the explicit classification tag are not persisted. Evidence retains bounded resource
identity, subscription, resource group, location, resource UID when available, revision,
classification method, and matching configuration-key names. Container image, endpoint, and
system-assigned managed-identity principal are retained as normalized runtime context. The
collector emits `HOSTED_ON` and, when independently observed, `RUNS_AS` relationships.

## Source identity contracts

Eligible declarations must make the complete Azure deployment identity literal:

- Terraform supports `azurerm_container_app`, `azurerm_linux_function_app`, and
  `azurerm_windows_function_app`. The default `azurerm` provider must contain one literal
  `subscription_id`; the resource must contain literal `resource_group_name`, `location`, and
  `name` values.
- ARM JSON supports direct resource exports with a full Azure resource ID and location. ARM
  templates require literal `metadata.denali.subscriptionId` and
  `metadata.denali.resourceGroup` values plus literal resource name and location.
- Bicep requires literal `denaliSubscriptionId` and `denaliResourceGroup` metadata plus a
  literal resource name and location.

The exact join requires provider `azure`, the same runtime kind, subscription ID, resource
group, normalized location, and Container App or Function App name. Dynamic or incomplete
values remain visible analysis limitations and create no deployment edge.

Revision, image digest, endpoint, and managed identity remain independent runtime context.
This slice does not claim that a source image string, deployed image digest, or Git revision
proves the bytes running in Azure; artifact identity and source-revision attestation remain
separate claims.

## Operational consequences

- Existing Azure connections created without `azure.code_to_cloud` must explicitly adopt and
  validate the scope before production collection.
- A successful empty query proves only that both bounded resource types were enumerated.
- Name similarity, unrelated tags, shared model names, and configuration values never create
  a deployment relationship.
- Resource Graph freshness is provider-controlled and is represented by collection time,
  revision, and resource state rather than assumed to be instantaneous.
- The live fixture used Consumption scale-to-zero, internal ingress, and a dedicated resource
  group. Its app, environment, registry, image, identity, and role assignment were deleted
  after acceptance so no ongoing fixture cost remains. Azure's empty resource-group shell can
  remain transiently visible in `Deleting` state after its child resources are gone.
