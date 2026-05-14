# Censys as IOC Provider — Design

**Date:** 2026-05-14
**Owner:** Pranith Jain
**Status:** Draft for review

## 1. Goal

Add Censys as a 22nd provider to the IOC Checker, surfacing host enrichment (open services, vulnerabilities, certificates, ASN/geo) for `ipv4` and `ipv6` indicators on the existing `/api/v1/ioc/check` SSE stream.

## 2. Scope

**In scope**

- New provider module `api/src/providers/censys.ts` that calls Censys v2 hosts API and maps the response to `ProviderResult`.
- Registration in `api/src/routes/ioc.ts` alongside the existing 21 providers.
- Type additions: `ProviderId`, `ProviderEnv`, `PROVIDER_SUPPORT` (backend), and the frontend mirror in `src/lib/dfir/types.ts`.
- `Env` additions: `CENSYS_API_ID` + `CENSYS_API_SECRET` in both `api/src/env.ts` and `worker/index.ts`.
- Verdict scoring matches the Shodan heuristic (vulns × 10 + open-port tiers) so the per-source verdict is comparable.
- UI subtitle bump: `IocCheck.tsx` currently advertises "24 threat intelligence sources" — bump to 25.

**Out of scope (deferred)**

- Censys certificate-by-hash lookup (`/api/v2/certificates/{sha256}`). The IOC Checker doesn't currently route SHA256 indicators to host-class providers; adding cert lookups is a separate feature.
- Wiring Censys into `phishing.ts`, `file.ts`, `domain.ts`, `exposure.ts`. The user picked IOC-only scope; the other routes already get Shodan signal.
- Censys-specific tag taxonomy (e.g. `iot`, `remote-access`). Use Censys's raw tags as-is.
- Censys Search API (full-text dorks). Hosts endpoint only.

## 3. API contract

**Endpoint:** `GET https://search.censys.io/api/v2/hosts/{ip}`

**Auth:** HTTP Basic, `Authorization: Basic <base64("API_ID:API_SECRET")>`.

**Response shape (relevant fields, v2):**

```jsonc
{
  "result": {
    "ip": "8.8.8.8",
    "services": [
      { "port": 53, "service_name": "DNS", "transport_protocol": "UDP" },
      { "port": 443, "service_name": "HTTP", "transport_protocol": "TCP" },
    ],
    "location": { "country": "United States", "country_code": "US", "city": "..." },
    "autonomous_system": { "asn": 15169, "name": "GOOGLE", "country_code": "US" },
    "operating_system": { "vendor": "...", "product": "..." },
    "dns": { "reverse_dns": { "names": ["dns.google"] } },
    "labels": ["remote-access", "iot"], // optional
  },
}
```

**Status codes the provider must handle:**

- `200` — host indexed; map to `ProviderResult`.
- `404` — host not indexed; return `status: 'ok'`, `verdict: 'clean'`, tag `censys-no-data`. Mirrors Shodan's 404 behaviour.
- `401` / `403` — bad credentials or revoked; return `status: 'ok'`, `verdict: 'unknown'`, tag `censys-no-access` so the rest of the pipeline doesn't poison its consensus with a permission failure.
- `429` — quota exhausted (250/month free tier). Return `status: 'ok'`, `verdict: 'unknown'`, tag `censys-quota`. Lets the UI render the source as "no answer this time" without scaring the user about a real error.
- Other `5xx`/network errors — `status: 'error'` with the message; this is the existing convention.

**Quota:** Censys free tier ≈ 250 host lookups / month. Mitigation: route-level `ProviderCache(c.env.KV_CACHE)` already wraps every provider call (`api/src/routes/ioc.ts:72`) and caches successful results. Repeat lookups within the cache TTL don't burn quota. No provider-level caching needed.

## 4. Verdict heuristic

Match Shodan's scoring exactly so cross-source verdict aggregation stays consistent:

```
vulnsCount = (result.vulnerabilities ?? []).length   // empty for most free-tier responses
openPorts  = (result.services ?? []).length

score   = min(100, vulnsCount * 10 + (openPorts > 100 ? 30 : openPorts > 20 ? 15 : 0))
verdict = score >= 70 ? 'malicious'
        : score >= 40 ? 'suspicious'
        : 'clean'
```

**Note:** Censys's free tier rarely returns the `vulnerabilities` array (that data is paid). On most lookups the verdict will be driven purely by open-port count, identical to Shodan's behaviour for the same reason. This is acceptable — the Censys signal is complementary geographic/AS data, not vuln data, and the UI shows the raw services list to the user regardless of verdict.

**Tags (capped to 7, dedup'd):**

- Up to 5 entries from `result.labels`
- `result.location.country_code` if present
- `result.autonomous_system.name` if present

## 5. Indicator support

```ts
censys: ['ipv4', 'ipv6'];
```

The v2 hosts endpoint is IP-only. Domains route to Shodan/VT/OTX; cert hashes are out of scope.

## 6. Files touched

**New (1)**

- `api/src/providers/censys.ts` — adapter, ~100 lines, mirrors `api/src/providers/shodan.ts` structure exactly.

**Edited (5)**

- `api/src/providers/types.ts`
  - `ProviderId` union: add `'censys'` (between `'shodan'` and `'otx'` for grouping).
  - `ProviderEnv` interface: add `CENSYS_API_ID: string` and `CENSYS_API_SECRET: string`.
  - `PROVIDER_SUPPORT` record: add `censys: ['ipv4', 'ipv6']`.

- `api/src/routes/ioc.ts`
  - Add `import { censys } from '../providers/censys';` next to the Shodan import.
  - Add `censys` to the `providers` array.
  - Add `CENSYS_API_ID: c.env.CENSYS_API_ID ?? ''` and `CENSYS_API_SECRET: c.env.CENSYS_API_SECRET ?? ''` to the env-pass block (mirroring the `SHODAN_API_KEY` pattern).

- `api/src/env.ts`
  - Add `CENSYS_API_ID: string;` and `CENSYS_API_SECRET: string;` to the `Env` interface.

- `worker/index.ts`
  - Add `CENSYS_API_ID?: string;` and `CENSYS_API_SECRET?: string;` to the `Env` interface (optional because the worker doesn't strictly require them at boot — only at request time).

- `src/lib/dfir/types.ts` (frontend mirror)
  - `ProviderId` union: add `'censys'`.

- `src/pages/dfir/IocCheck.tsx`
  - Change subtitle text "24 threat intelligence sources" → "25 threat intelligence sources".

**Not touched**

- `api/src/providers/__tests__/` — no existing provider tests in the repo; introducing a new test pattern is out of scope. Verification is by manual `wrangler dev` smoke test after deploy.
- `api/src/routes/phishing.ts` / `file.ts` / `domain.ts` / `exposure.ts` — these use the same env keys but don't currently fan out to Shodan-class providers in a way that benefits from Censys. Deferred.

## 7. Configuration & deployment

Two Cloudflare Worker secrets must be set against the production worker before the new provider returns useful data:

```bash
wrangler secret put CENSYS_API_ID
# paste the API ID from https://search.censys.io/account/api
wrangler secret put CENSYS_API_SECRET
# paste the API Secret
```

If either secret is unset, the provider will receive an empty string for the credentials, the Censys API will return 401, and the provider will gracefully report `censys-no-access`. The feature degrades cleanly rather than failing the deploy.

## 8. Error handling

All paths covered in §3. The provider catches any thrown error and returns `status: 'error'` per the `ProviderAdapter` contract — never propagates an exception that could break the SSE stream for other providers (`api/src/routes/ioc.ts:120` only persists `status === 'ok'` results, so error responses don't poison the cache).

## 9. Testing

- **Type check:** `npm run build` exercises the TypeScript compiler across both worker and api types — the ProviderId / Env additions must align.
- **Lint:** `npm run lint --max-warnings 0`.
- **DfirRoutes route test:** continues to pass unchanged (the IOC Checker route already renders without backend data).
- **Manual verification post-deploy:**
  1. Hit `https://pranithjain.qzz.io/api/v1/ioc/check?indicator=8.8.8.8&type=ipv4` (or via the IOC Checker UI).
  2. Confirm `censys` appears in the eligible-providers SSE meta event.
  3. Confirm the per-provider response includes a `source: 'censys'` entry with non-empty services/asn data.
  4. With secrets unset: confirm graceful `censys-no-access` rather than a 500.

## 10. Acceptance criteria

1. `npm run lint` and `npm run build` pass.
2. `GET /api/v1/ioc/check?indicator=<ip>&type=ipv4` includes a `source: 'censys'` event in the SSE stream.
3. With valid credentials, Censys data renders as a card in the IOC Checker UI.
4. With unset or invalid credentials, the provider returns `verdict: 'unknown'` with tag `censys-no-access`; no 5xx propagates to the user.
5. IocCheck subtitle reads "25 threat intelligence sources".
6. Existing 21 providers continue to work; no regression on the route's response shape.
