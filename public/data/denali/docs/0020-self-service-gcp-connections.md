# ADR 0020: Google Cloud onboarding uses a Denali service account and selected projects

## Status

Accepted for the first self-service Google Cloud connection slice.

## Decision

Denali creates a unique service account in its operator-owned Google Cloud project for every
connection. That immutable, connection-specific identity is the customer-visible runtime
principal. Customers never create or upload a service-account key and never give Denali a
user OAuth token or refresh token. In production, Denali reaches its service account through
its workload identity or service-account impersonation; that operator-side credential chain
is separate from customer onboarding.

The customer workflow is:

1. Create a Google Cloud connection plan. Denali first provisions its keyless, unique
   service account. The plan records its email and immutable unique ID,
   declared collection planes, and an initially empty project boundary.
2. Open Google Cloud Shell and run the connection-specific, reviewable setup script. Cloud
   Shell uses the customer's existing Google session to enumerate active projects visible to
   that identity and asks the customer to select one, several, or all.
3. Enable the Cloud Asset Inventory and Cloud Logging APIs, then grant
   `roles/cloudasset.viewer` and `roles/logging.viewer` to Denali's service account only on the
   selected projects.
4. Paste the script's one-time completion code into Denali. Denali stores the selected project
   IDs, names, and immutable project numbers, consumes the completion capability atomically,
   and validates each project independently.

The Cloud Shell session and its token never leave Google. The setup script is published under
an unguessable key in a private object store, expires within one hour, and is available both
as a copyable command and a direct download for inspection. Denali records its version, exact
SHA-256, principal email, publication time, and expiration time. It stores only the SHA-256
of the one-time completion token while setup is pending; the raw token, script URL, object
key, command, and completion code are not persisted.

## Project and location coverage

Project selection is explicit. A healthy connection says nothing about projects the customer
did not select. Each selected project is bound by both mutable project ID and immutable
project number before its declared planes are tested.

Cloud Asset Inventory queries are project-wide and cover resources across every Google Cloud
location. The first declared planes are:

- Vertex AI runtime inventory: endpoints, reasoning engines, and cached content;
- Vertex AI development inventory: models, datasets, pipelines, custom jobs, and notebook
  runtimes;
- Vertex AI Agent Builder inventory: Discovery Engine assistants, data stores, and engines;
- Dialogflow agent inventory; and
- Google Cloud AI management activity from Cloud Logging.
- Cloud Run and Cloud Run functions Gen2 deployment inventory for code-to-cloud correlation.

The asset types are drawn from Google Cloud Asset Inventory's supported-type catalog. A
successful validation proves only that the project-bound read entrypoint was callable at
that time. Resource-specific reads and exact locations remain collection evidence and are
not inferred from a successful empty query.

New IAM policy bindings can propagate asynchronously. Initial setup validation retries within
the existing bounded onboarding window and persists only its final attempt. Manual
revalidation is a single evidence-bearing attempt. If the propagation window ends with
partial access, each failed or unknown plane remains visible.

## Permission and evidence boundary

`roles/cloudasset.viewer` supplies project metadata, project-wide resource search, and the
bounded Cloud Asset RESOURCE snapshots used by the GCP code-to-cloud collector.
`roles/logging.viewer` supplies read access to log entries. The Cloud Shell identity needs
permission to enable services and update IAM policy on each selected project, normally Owner or
equivalent Service Usage Admin plus Project IAM Admin permissions.

This slice grants no write/remediation role, service-account key administration, secret
access, workload invocation, model invocation, data-plane payload access, prompt access, or
response access. Cloud Logging validation and collection concern bounded audit metadata;
they do not reinterpret log availability as access to model input or output content.

The one-principal-per-connection design prevents one customer setup capability from claiming
another connection merely by presenting a known project ID. The completion capability is
also bound to the connection-specific principal and the selected projects are rebound to
immutable project numbers before validation.

Connection health remains access validation, not inventory evidence, complete coverage, a
finding, or a risk verdict. Deleting Denali configuration does not silently remove customer
IAM policy bindings, and previously collected evidence remains.

## Operational consequences

- Denali's operator identity needs `iam.serviceAccounts.create` in the configured operator
  project (for example through Service Account Creator or a narrower custom role), and the
  IAM Service Account Credentials API must be enabled there. Service-account quota and
  cleanup are operator responsibilities.
- A production Denali workload should use Workload Identity Federation, an attached service
  account, or service-account impersonation. Long-lived service-account JSON keys are outside
  the accepted design.
- When Denali's ambient identity is not the declared service account, it needs
  `roles/iam.serviceAccountTokenCreator` on each connection-specific service account. A
  project-level grant in the operator project can cover all of them. This is an operator-side
  grant, never a customer-project grant.
- The Cloud Asset Inventory and Cloud Logging APIs must be callable by the Denali runtime.
  Disabled or unavailable services remain failed/unknown coverage rather than empty
  inventory claims.
- The current script publisher reuses the same private S3-compatible artifact contract as AWS
  and Azure. That backend can be replaced without changing the customer IAM boundary.
- Deleting Denali configuration does not automatically delete the operator-owned service
  account. The product must surface that cleanup boundary alongside the customer-project IAM
  bindings.
- GitHub, Slack, Jira, and additional Google Workspace onboarding remain outside this slice.

## Source comparison

Shasta uses local Application Default Credentials and one configured project, with optional
user ADC, service-account JSON keys, workload identity, or impersonation. Its useful idea is
to enumerate projects through the customer's authenticated Google context. Denali retains
that console-native selection experience but rejects customer JSON keys and user refresh
tokens, stores exact selected-project boundaries, validates all locations, and keeps setup,
access validation, inventory evidence, and risk conclusions separate.

## Deferred UX work

The user accepted this provider slice while explicitly parking two application-wide UX
issues: typography is too small on newer pages, and navigation does not create browser
history entries, so Back exits the single-page application. They remain cross-application
work and must not be lost or silently mixed into the GCP security contract.
