# ADR 0019: Azure onboarding uses a multi-tenant app and customer-selected subscriptions

## Status

Accepted for the first self-service Azure connection slice.

## Decision

Denali uses one operator-owned Microsoft Entra application configured as multi-tenant.
Customer onboarding creates that application's local enterprise application in the customer
tenant, then assigns Azure Reader only at subscription scopes explicitly selected by the
customer. Denali never asks for or stores a customer client secret, certificate, refresh
token, Azure CLI token, or user credential.

Azure Lighthouse is not the default connection mechanism. Lighthouse can delegate even one
customer tenant to a provider tenant, but its managed-service registration model is heavier
than Denali needs for subscription-scoped read access. The multi-tenant application and
ordinary Azure RBAC model gives customers direct, familiar role assignments at the exact
subscriptions they select.

The customer workflow is:

1. Create an Azure connection plan for one customer tenant.
2. Add Denali's multi-tenant application to the customer tenant. Microsoft's admin-consent
   endpoint creates or confirms the tenant-local enterprise application/service principal:
   the identity Azure RBAC can assign a role to. Denali requests no Microsoft Graph
   permissions in this slice, and this step does not grant access to Azure subscriptions.
3. Open Azure Cloud Shell and run the connection-specific, reviewable setup script. The
   script uses the customer's signed-in Azure CLI context to enumerate enabled subscriptions
   in the declared tenant and asks the customer to select one, several, or all.
4. Assign the built-in Reader role to the local Denali service principal only at the selected
   subscription scopes.
5. Paste the script's one-time completion code into Denali. Denali stores the selected
   subscription identifiers and names, consumes the completion capability atomically, and
   validates each selected subscription independently.

The Entra admin-consent redirect is visible setup feedback, not proof of Azure subscription
access. Denali selects the connection named by the returned state and shows the returned
success or failure explicitly. Actual access is established separately by customer-created
RBAC assignments and proved only by subsequent subscription and plane validation.

The setup script is published under an unguessable key in a private object store. Its URL
expires within one hour. The API response containing that URL and command is `no-store`.
Denali records the script version, exact SHA-256, application client ID, publication time,
and expiration time. It stores only the SHA-256 of the one-time completion token while setup
is pending; the token hash is removed when setup completes. The script URL, object key,
command, raw token, and completion code are never persisted as launch metadata.

The primary setup path opens Azure Cloud Shell and provides a copyable command that downloads
the exact script to a file before execution. The same script is separately downloadable for
inspection and manual execution. Denali does not use an opaque `curl | bash` pipeline.

## Subscription and location coverage

Subscription selection is explicit. Denali does not infer that every subscription in the
customer tenant was selected, and a healthy connection says nothing about unselected
subscriptions.

Each selected subscription is validated separately. Azure Resource Graph queries are scoped
to the exact subscription and cover resources in every Azure location; onboarding never
uses one preferred Region as an inventory boundary. The initial declared planes are:

- Azure AI services accounts;
- Azure AI Search services;
- Azure Machine Learning workspaces;
- Azure Bot Service resources; and
- Azure management Activity Log access.

Validation first obtains an application token for the exact customer tenant, then reads and
binds each selected subscription to that tenant. A failed subscription binding leaves that
subscription's planes unknown without suppressing results for other subscriptions. Each
declared read-only entrypoint then succeeds or fails independently. SDK/HTTP failures are
reduced to an error code or exception class; response bodies and messages are not retained.

New Azure role assignments can return transient `AccessDenied` responses while RBAC
propagates. Immediately after setup completion, Denali retries credential, subscription,
and plane validation within the same bounded onboarding window and persists only the final
attempt. A manual **Validate again** remains a single evidence-bearing attempt. If access is
still partial when the window ends, the independent failures are recorded rather than
converted to success.

Successful validation proves only that the configured application could bind the selected
subscriptions and call the declared entrypoints at that time. It is not collection evidence,
a completeness claim, a finding, or a risk verdict.

## Permission and evidence boundary

Azure Reader is a control-plane role and is broader than the initial AI resource queries.
The customer can review and remove each ordinary role assignment in Azure IAM. It grants no
write/remediation permission and no Azure resource data-plane role.

This Azure slice does not request Microsoft Graph directory permissions and does not collect
Entra enterprise applications, identities, sign-ins, directory audits, or OAuth grants.
Those remain a distinct Entra connection and consent decision. It also does not collect
model inputs, model outputs, prompts, responses, secrets, or data-plane payloads.

Deleting a Denali connection removes only Denali configuration and validation history after
the normal disable-and-confirm safeguard. It does not silently remove Azure role assignments
or the customer enterprise application, and previously collected evidence remains.

## Operational consequences

- The Denali application registration must allow accounts in any organizational directory.
- The Denali runtime owns its application credential. A certificate or workload-federated
  credential is preferred for production; the current runtime also supports an operator-
  managed client secret. This is Denali infrastructure state, never a customer credential.
- The consent redirect URI must exactly match a redirect registered on the Denali application.
- The person granting tenant consent needs an appropriate Entra application administrator
  role. The Cloud Shell identity assigning Reader needs role-assignment authority, such as
  Owner or User Access Administrator, at each selected subscription.
- Setup-script publishing currently uses the same private S3-compatible publisher contract as
  AWS onboarding. This backend detail is not exposed as customer cloud access and can be
  replaced by another private short-lived object publisher later.
- GCP, GitHub, Slack, Jira, and Entra onboarding remain outside this slice.

## Source comparison

Shasta's checked-in Azure source validates local `az login` credentials and uses a configured
subscription ID. Its useful product pattern is to use the customer's authenticated cloud
console context and never ask them to paste credentials. Denali keeps that pattern, but adds
explicit subscription selection, a customer-reviewable script, one-time setup completion,
provider-neutral lifecycle storage, and evidence-bounded validation suitable for a hosted
service.
