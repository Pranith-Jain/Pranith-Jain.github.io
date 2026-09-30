# Decision: Deferred audit calls — register enumeration, same-origin gate, hydration

**Date:** 2026-09-30
**Status:** Accepted
**Owner:** Pranith
**Driver:** Full-repo audit backlog — three items explicitly deferred to the repo owner,
resolved here after the 2026-09-30 audit pass.

---

## 1. Open registration enumerates emails — ACCEPT with controls

**Context.** `POST /api/v1/auth/register` returns an honest `409 "Email already
registered"` (`api/src/routes/auth.ts` → `createUser`), which lets anyone probe which
emails have accounts.

**Options considered.**

| Option                   | Verdict                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Generic error message    | Doesn't help — the status code alone enumerates, and without email flows a generic response only obscures UX. |
| Turnstile                | Not possible today: there is **no frontend consumer** of register, so nowhere to host the widget.             |
| Disable registration     | Conflicts with active auth development (`user-auth.ts` is being hardened sprint-over-sprint).                 |
| **Accept with controls** | **Chosen.**                                                                                                   |

**Controls in place.** `AI_STRICT` 10/min/IP on `/api/v1/auth/register`
("bot-farm throttle", `api/src/lib/ratelimit.ts`); session cookie is
`HttpOnly; Secure; SameSite=Strict`; login failures are already uniform
(`Invalid email or password` for both unknown-email and wrong-password); DB errors
throw (500, no message leak) — the only `409` body is the duplicate-email string;
`createUser` writes an `email_verifications` row today, but **no verify-email /
forgot-password routes are implemented yet**, so there is no email flow to abuse.

**Revisit trigger.** When a login UI + email verification ship, add Turnstile on
register and rely on verification emails (not status codes) for account existence —
that is the first point where enumeration can be killed without breaking UX.

## 2. `isSameOrigin` is forgeable — KEEP as documented convenience gate

**Context.** `authenticate('external-only')` (global `/api/v1/*`) lets same-origin
browsers call without an API key; `isSameOrigin` trusts `Sec-Fetch-Site` (a forbidden
header in browsers) and falls back to Origin/Referer. Any non-browser client can forge
all three → effectively "be an anonymous site visitor" without a key.

**Audit (2026-09-30).** Every state-changing route under `/api/v1/*` was triaged:

- **csrfGuard** runs on `/api/v1/*` (`api/src/index.ts:766`) — cross-origin browser
  mutations get `403 csrf_rejected`.
- Ownership-gated: `ioc-watchlist` (`callerOwnerId`/`ownerCheck`).
- Admin/session-gated: `orgs`, `leaderboard`, `case-study-admin`, `ai-escape` review,
  `procedures` review, `ti-asm` (role check).
- Rate-limited + caps: `velociraptor`, `sample-submission`, `ti-dashboard/build`,
  `ti/*`, `auth/register` — and as of this pass `/api/v1/estate` and
  `/api/v1/tool-chains` were added to `AI_STRICT_PREFIXES` (the audit's only gap:
  two unthrottled mutation prefixes).
- Intentional public single-tenant writes: `estate` = a shared whiteboard consumed by
  the public `/threatintel/estate` page (plain `fetch`, by design).

**Decision.** Keys gate **API consumers and quota**, not confidentiality — every read
is served to anonymous visitors anyway, so a forged header grants nothing beyond what
any browser gets. The forge is accepted and stays documented at
`isSameOrigin` (`api/src/lib/auth.ts`). Real protection remains the API-key/admin
gate on anything sensitive.

**Revisit trigger.** If a mutation endpoint is ever added whose only protection is
`external-only`, that is a bug — mutations must carry their own admin/session/ownership
gate or sit in `AI_STRICT`.

## 3. `hydrateRoot` vs `createRoot` — KEEP `createRoot`

**Context.** The prerender (scripts/prerender.mjs) renders with React, but
`vite.config.ts` aliases `react-dom` → `preact/compat` for the client bundle
(`saves ~120KB of parse work`). Preact's hydration does not recognise React's
Suspense comment markers; `hydrateRoot` previously produced a "double page" —
prerendered DOM preserved alongside a fresh client render.

**Decision.** Keep `createRoot(...).render(...)` exactly as documented in
`src/main.tsx`. Prerendered HTML serves bots and first paint; the client tree
replaces it on mount. No change.

## Related evidence (code, not this doc)

The data-catalogs eager-graph A/B (491.8→450.7KB raw eager total, −41KB) lives in the
`manualChunks` NOTE in `vite.config.ts`; the guard that keeps it honest is the
`EAGER_TOTAL` gate in `scripts/check-budgets.mjs` (per-file budgets missed the
preloaded-companion-chunk churn that let the split hide eager payload).
