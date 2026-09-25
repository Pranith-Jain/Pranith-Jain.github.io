# ADR 0016: Entra AI application discovery and runtime observations

## Status

Accepted for the first Microsoft 365 runtime vertical slice.

## Context

Microsoft Entra exposes several different facts that are easy to collapse into one
overstated conclusion:

- an enterprise application exists in a tenant;
- an OAuth grant or application-role assignment exists;
- a user or workload signed in to that application;
- an administrator changed the application;
- the application is approved, unwanted, or risky.

Shasta proved that Entra is a useful source for discovering AI SaaS applications, but
its earlier pass-oriented design turned catalog matches into findings too early. Denali
needs the inventory and runtime value without treating a product-name match as a
security verdict.

## Decision

1. A conservatively matched Entra enterprise application becomes an
   `ai_application` asset. The backing service principal is a separate `identity`
   asset. The application `runs_as` that service principal.
2. Matching is exact by application ID where known, otherwise by a curated,
   boundary-aware display-name alias. Broad aliases such as `Writer`, `Notion`,
   `Runway`, or `Cody` are not accepted.
3. Catalog membership is discovery metadata, not a risk rating. Denali does not infer
   data retention, training behavior, approval, or corporate licensing from the name.
4. Delegated OAuth grants are topology (`connects_to`) because their effective
   authority depends on a user and consent context. Application-role assignments are
   capability (`can_invoke`) relationships with the client service principal as the
   principal.
5. Entra sign-ins are immutable `ai_app_sign_in` activity observations. Directory
   audit changes concerning matched applications are immutable `admin_change`
   observations. Neither creates a finding or issue by itself.
6. Activity can link only to inventory collected independently. An event reference
   never creates an asset, identity, or graph edge.
7. Collection is bounded and declares independent coverage for application inventory,
   delegated grants, application permissions, sign-ins, and directory audits. A
   permission or licensing failure is visible as failed or partial coverage; it is
   never represented as an empty, healthy result. Sign-ins are filtered by matched
   application IDs. Directory audits are filtered to `ApplicationManagement` and then
   correlated locally because Entra may target either an application registration or
   its distinct enterprise service-principal object.
8. Evidence excludes access tokens, client secrets, IP addresses, prompt content, and
   unbounded Graph responses. OAuth scope names and stable directory identifiers are
   retained because they are necessary to explain authority.
9. Identity attribution remains evidence-specific. A sign-in actor proves observed use,
   not application ownership or approval. A directory-audit actor can identify who
   changed consent or configuration when a matching retained event exists. The OAuth
   grant object itself does not identify the administrator who granted consent, including
   tenant-wide `AllPrincipals` grants, so Denali must not manufacture a responsible user
   when the matching audit evidence is absent.

## Natural keys

- AI application: `entra:{tenant_id}:application:{app_id}`
- Service-principal identity: `entra:{tenant_id}:service-principal:{object_id}`

These keys let an independently collected sign-in correlate to the application by its
stable Entra application ID.

## Consequences

- The first AI application discovery experience can answer which AI applications exist, which have
  delegated or application permissions, and which were recently used.
- Human governance remains explicit: new applications begin `unreviewed`.
- User identities in sign-in logs remain references unless another connector has
  independently inventoried them.
- Application details can show observed sign-in users and consent/configuration actors,
  but label both by their narrower evidentiary meaning rather than as an owner.
- Mailbox signup/billing signals, endpoint software, and network egress require their
  own future coverage planes and must not be implied by Entra coverage.
