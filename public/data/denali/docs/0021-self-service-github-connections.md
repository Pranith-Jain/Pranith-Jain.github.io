# ADR 0021: GitHub onboarding uses an App and exact repository boundaries

## Status

Accepted for the first self-service GitHub connection slice.

## Decision

Denali uses a Denali-owned GitHub App instead of accepting a customer personal access token,
OAuth refresh token, deploy key, or GitHub password. The App requests only repository Metadata
read, Contents read, and Actions read. It requests no organization, enterprise, administration,
secret, webhook, or write permission.

The customer workflow is:

1. Create a GitHub connection plan. It records the App identity, declared planes, and an empty
   repository boundary.
2. Follow a one-time, state-bound link to GitHub's native App installation page. GitHub shows
   the exact permissions and lets the customer select repositories in one user or organization
   account.
3. Return through the configured Setup URL. GitHub warns that `installation_id` on this return
   is untrusted, so Denali does not accept it as proof of installation ownership.
4. Complete an explicit GitHub App user-authorization flow protected by state and PKCE. Denali
   exchanges the code for a temporary GitHub App user token, verifies the signed-in user can
   access that exact installation, independently reads the installation using an App JWT, and
   compares its App ID, account, repository-selection mode, suspension state, and permissions.
5. Record the selected repositories by numeric repository ID, node ID, full name, and owner
   identity. Consume all one-time state atomically and discard the user access token, refresh
   token, authorization code, and PKCE verifier. None is returned by the API or retained as
   connection configuration.
6. Validate each recorded repository and declared plane independently.

GitHub documents the App permission model, the Setup URL spoofing risk, and the user-token
installation repository endpoint in its official documentation:

- <https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app>
- <https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url>
- <https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app>
- <https://docs.github.com/en/rest/apps/installations>

## Repository and token boundary

The first slice accepts between 1 and 500 repositories. Pagination must agree with GitHub's
reported total; a changing selection, duplicate identity, truncated response, or total above
the supported bound fails setup. Denali never turns a partial list into a healthy connection.

An installation may be configured in GitHub for `selected` or `all` repositories. In either
case, Denali persists the exact repositories observed during verified setup. A later repository
created under an `all` installation is outside Denali's declared coverage until the customer
reconfigures the connection and Denali records a new verified boundary.

For validation, Denali creates a fresh installation access token restricted to one recorded
repository ID and to Metadata read, Contents read, and Actions read. One token is not reused to
claim multiple repositories. GitHub installation tokens are short-lived and remain in process
memory only; they are never written to the database, logs, validation evidence, or API response.

## Validation and evidence boundary

The first declared planes are:

- repository metadata: rebind numeric repository ID, node ID, and full name;
- source revision access: read the default Git ref using Contents permission, or explicitly
  record that an empty repository has no default branch; and
- GitHub Actions workflow inventory: call the read-only workflow-list entrypoint.

Repository identity is rebound before any plane is considered passed. Failure in one
repository or plane remains independent; it does not erase successful checks elsewhere and
does not become an empty-inventory claim.

A healthy GitHub connection proves only that the verified App installation and declared
repository-bound entrypoints worked at the recorded time. It does not prove source collection
ran, every branch was read, workflow runs were inspected, branch protection is safe, findings
are absent, or the repositories are secure. Resource-specific collection must emit its own
evidence and coverage records.

This slice does not read source blobs during connection validation, read Actions logs or
artifacts, receive webhooks, read secrets, dispatch workflows, modify repositories, or collect
prompt/response content. Branch-protection and pull-request posture are deferred because those
checks need additional repository Administration read permission and must be offered as a
separate explicit plane rather than silently widening this App.

## State, secret, and lifecycle handling

Installation state and OAuth state are high-entropy, connection- and tenant-bound capabilities.
Denali stores only their SHA-256 digests. The PKCE verifier is stored internally only between
the installation return and OAuth callback, is never serialized by the public repository
response, and is removed atomically when setup completes. Setup state expires within one hour.

The App client secret and PEM private key are operator secrets. The PEM is loaded from a
read-only file path and neither secret is stored in a customer connection. Production should
use an operator secret manager and short-lived delivery or a mounted secret file. Key rotation
is an operator responsibility.

Disabling a connection prevents validation and collection through it. Deleting Denali's
configuration requires a separate explicit action and does not uninstall the GitHub App;
customer administrators remove the installation in GitHub. Previously collected evidence
remains after disablement, deletion, permission removal, or App uninstall.

## Source comparison

Shasta's repository connector accepts a manually supplied personal access token and checks
branch protection, pull-request review requirements, status checks, and force-push settings.
Its useful ideas are repository selection and explicit posture checks. Denali does not copy
the credential model: it uses a GitHub App, temporary exact-repository installation tokens,
verified immutable repository boundaries, and no stored customer token. Shasta's posture
checks remain a later, separately permissioned plane.

## Deferred work

- Branch-protection and pull-request posture with explicit Administration read permission.
- Repository source collection and code-to-cloud correlation are defined separately in
  [ADR 0022](0022-github-source-collection.md); they do not broaden validation semantics.
- Reconfiguration reconciliation when a repository is removed, transferred, renamed, or an
  installation is uninstalled.
- GitHub Enterprise Server support; this slice is limited to `github.com`.
- Application-wide typography and browser-history fixes already accepted as separate UX work.
- Slack and Jira onboarding remain outside this slice.
