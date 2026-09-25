# ADR 0034: Azure Repos uses delegated proof and app-only collection

## Status

Accepted for the first hosted Azure Repos source and code-to-cloud slice.

## Decision

Azure Repos is a separate provider connection from Azure Resource Manager and Microsoft Entra.
The customer records one Entra tenant UUID and one `dev.azure.com` organization, authorizes a
short Microsoft user session, selects exact repository UUIDs, and grants Denali's enterprise
application read access in Azure DevOps. Azure subscriptions do not imply Azure DevOps access.

The one-time delegated token is used only to prove that the signed-in user can enumerate the
recorded organization. Denali stores a hash of OAuth state and a bounded PKCE verifier while the
flow is active, discards both plus the delegated token after callback, and stages only repository
and project metadata for 30 minutes. Completion accepts only a subset of those candidates and
independently re-fetches every selected identity using Denali's service principal.

Steady-state validation and collection use an application token for Azure DevOps resource
`https://app.vssps.visualstudio.com/.default` and the read-only `vso.code` permission. The service
principal must be explicitly added to the Azure DevOps organization with Basic access and
project/repository read permission. It is not sufficient to place it in an Entra group.

## Collection and evidence

For each exact repository, Denali rebinds the repository UUID, project UUID, and names, resolves
the default branch to an immutable commit, enumerates the tree, and downloads only eligible
regular blobs under the same 20,000-entry, 2,000-file, 2-MB-per-blob, and 25-MB-total limits used
for GitHub source collection. Repository contents live only in a temporary directory and are
never persisted or executed.

The canonical asset key is `dev.azure.com/{organization}/{project}/{repository}`. Evidence uses
`azure-repos://organizations/{organization}/projects/{project_id}/repositories/{repository_id}/commits/{sha}`.
Inventory, posture, and exact code-to-cloud analysis remain separate coverage planes. Missing or
partial source access is never presented as complete or as zero findings.

## Security consequences

- No personal access tokens, refresh tokens, customer secrets, raw source snapshots, or OAuth
  access tokens are stored.
- Provider callbacks resolve tenant and connection only from expiring one-time state.
- Repositories outside the user-authorized candidate list or outside the app-visible list cannot
  be selected.
- Azure DevOps permissions are administered separately from Microsoft Graph and Azure RBAC.
- Azure DevOps Server and pipeline/run inventory are not part of this first slice.

Microsoft references:

- [Service principals in Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/service-principal-managed-identity?view=azure-devops)
- [Microsoft Entra OAuth for Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra-oauth?view=azure-devops)
- [Repositories - List](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/repositories/list?view=azure-devops-rest-7.1)
