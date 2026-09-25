# ADR 0029: Microsoft Entra onboarding uses tenant-bound admin consent

## Status

Accepted for the first hosted Microsoft Entra customer onboarding slice.

## Decision

Denali uses one operator-owned, multi-tenant Microsoft Entra application with application-only
Microsoft Graph permissions. A customer never supplies a client secret, user password, refresh
token, access token, or service-principal credential. The customer supplies only the exact Entra
tenant UUID and a Global Administrator grants the permissions displayed by Microsoft.

The first evidence bundle is intentionally fixed and disclosed in the product:

- `Directory.Read.All` for enterprise applications, service-principal context, delegated OAuth
  grants, and application-role assignments;
- `AuditLog.Read.All` for bounded sign-in metadata and application-management directory audits.

The connection planner does not present these as independently grantable permissions. Microsoft
admin consent applies to the application's registered permission bundle as a whole. A future
optional permission tier requires a separate reviewed application/consent design; it must not be
simulated with checkboxes that do not change what Microsoft grants.

## Customer workflow

1. An authenticated Denali organization administrator creates an Entra connection with a display
   name and the exact customer Entra tenant UUID. Denali records no customer credential.
2. Denali creates an expiring admin-consent URL pinned to that tenant. The state capability embeds
   the internal Denali tenant UUID and connection UUID plus high-entropy random material. Only its
   SHA-256 digest and expiry are stored in PostgreSQL.
3. A Global Administrator reviews the two application permissions on Microsoft's tenant-specific
   consent page and accepts or rejects them.
4. Microsoft returns to the same-origin public callback. The callback reconstructs tenant and
   connection only from state, compares its digest in constant time, checks expiry, and requires
   the returned Entra tenant to equal the tenant declared in step 1. It never uses the browser's
   currently active Clerk Organization.
5. Success or failure atomically consumes the one-time state. A successful callback creates a
   durable validation job and redirects to the connection detail page without provider error text,
   tokens, or authorization codes.
6. Validation mints an application token for the exact customer tenant in memory and checks every
   declared Graph plane independently. The token is discarded and is never persisted or returned.
7. An explicit collection action creates a PostgreSQL job and spawns a Modal worker with only the
   durable job UUID. The worker recollects its tenant and connection boundary from PostgreSQL,
   mints a fresh transient token, ingests normalized evidence, and records a sanitized result.

## Authorization and tenant boundary

Connection creation, consent launch, validation, collection, disable, and delete are authenticated
`org:admin` actions. `org:member` remains read-only. The callback is intentionally public because
Microsoft invokes it, but its only authority is verified, expiring, one-time state already stored
for the connection.

Every repository operation is scoped by the internal Denali tenant UUID. The customer Entra tenant
UUID is provider configuration, never a substitute for Denali's tenant key. A returned tenant that
differs from the declared tenant consumes the state as failed and cannot bind the connection.

## Evidence and durability boundary

Validation proves only that the declared read-only entry points were callable at that time. It does
not prove collection completed, that inventory exists, that sign-in/audit retention was sufficient,
or that the tenant is safe.

Collection remains explicit and reports complete, partial, or failed coverage independently for
application inventory, service-principal context, delegated grants, application permissions,
sign-ins, and directory audits. Missing licensing, retention, or permission is evidence of a
coverage limitation, never a reassuring zero.

The collection job has one active job per tenant, connection, and kind; bounded retries; a lease;
stale-worker recovery; sanitized terminal errors; and duplicate-dispatch safety. Collected evidence
may outlive connection disablement or deletion. Disabling blocks new validation and collection.
Deleting removes Denali's configuration and job history but does not revoke Microsoft consent; a
customer administrator revokes the enterprise application separately.

## Operator configuration

The following belong only in the environment's Modal provider Secret:

```text
DENALI_ENTRA_CLIENT_ID
DENALI_ENTRA_CLIENT_SECRET
DENALI_ENTRA_CALLBACK_URL=https://<production-domain>/api/v1/connections/entra/setup/callback
```

The callback must be registered exactly on the Microsoft Entra application. The client secret is
never sent to Vercel, exposed through a `VITE_*` variable, logged, or persisted per customer.

## Deferred work

- Optional permission tiers with consent that genuinely narrows the registered Graph permissions.
- Scheduled collection, revocation detection, and consent-expiry operational alerts.
- National cloud support; the first slice targets the public Microsoft cloud.
- Hosted acceptance evidence for two real tenant boundaries and licensing/retention variants.
