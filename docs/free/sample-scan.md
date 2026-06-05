# Free "lite 0x12" sample scanner — architecture

A drop-hash or drop-file → multi-engine reputation verdict + one-click
public-sandbox deep links. **Free**, no API secrets required, runs on
Cloudflare Workers Free (10 ms CPU / invocation, 100k req/day).

`0x12darksandbox.net` is a paid dynamic-malware-analysis sandbox
(Windows VM + Elastic EDR + Sysmon ETW + Kleenscan, 3–7 min scan,
credits per submission). This endpoint is the **free** analogue: it
covers the same triage surface (provider fan-out, family / signature
extraction, public detonation links) without self-hosting or paying.

> 📖 **Routes**: `GET|POST /api/v1/sample/scan` (Worker) →
> `src/pages/dfir/SampleScan.tsx` (UI). The frontend page hashes the
> file in-browser and posts only the SHA-256.

## Why this design

| Constraint                                              | Implication                                                      | Decision                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Cloudflare Workers **Free plan caps CPU at 10 ms**      | V8 SHA-256 of a 32 MB file takes ~30 ms — can't hash server-side | Frontend hashes with `analyseFile`; Worker receives the hex            |
| **Cloudflare Containers are Paid-only** ($5/mo minimum) | No Linux container → no clamscan / yara / capa                   | Hash fan-out to free public reputation APIs only                       |
| Existing portfolio already wires **10+ hash providers** | Reuse the adapters instead of new ones                           | Provider list = subset of the ioc-controller set                       |
| Existing CAPE bridge is **dormant** (admin-gated)       | Don't tie lite-0x12 to a setup hint                              | `samples: true` in `/api/v1/features`; no `*_BRIDGE_URL` secret needed |
| Most free public sandboxes are **web-UI only**          | Can't programmatically submit / poll                             | One-click deep links, not API calls                                    |

## Architecture

```
React (/dfir/sample-scan)
   │  drag-drop file → crypto.subtle.digest('SHA-256')   ← client-side
   │  POST { hash: '<sha256-hex>' }
   ▼
Cloudflare Worker  POST /api/v1/sample/scan
   │  10 free public hash lookup APIs (see below)
   │  composite score + signature/family aggregation
   ▼
SSE stream:  meta → result×N → done{public_sandboxes, families, signatures}
   │  terminal done event embeds 12 deep links
   ▼
React renders: verdict chip, score bar, family tags, signature tags,
               grid of 12 "detonate in" buttons → opens in new tab
```

## Free provider fan-out (10)

| Provider                 | Auth                                             | What it returns                 | Notes                                                          |
| ------------------------ | ------------------------------------------------ | ------------------------------- | -------------------------------------------------------------- |
| VirusTotal               | public, 4 req/min/IP                             | last-analysis stats, tags       | Falls back to 401-clean if no `VT_API_KEY`                     |
| Hybrid Analysis          | public key (free)                                | Falcon sandbox verdict + family | Requires `HYBRID_ANALYSIS_API_KEY`; degraded to clean if unset |
| OTX (AlienVault)         | none                                             | pulse count, malware families   | Free, no key                                                   |
| ThreatFox (abuse.ch)     | optional `ABUSECH_AUTH_KEY`                      | IOC confirmation                | Free, no key                                                   |
| MalwareBazaar (abuse.ch) | optional `ABUSECH_AUTH_KEY`                      | sample record + YARA tags       | Free, no key                                                   |
| Malshare                 | optional `MALSHARE_API_KEY`                      | hash→sample lookup              | Free, no key                                                   |
| Hashlookup (circl.lu)    | none                                             | known-software correlation      | Free, no key                                                   |
| YARAify (abuse.ch)       | optional `ABUSECH_AUTH_KEY`                      | YARA + ClamAV matches           | Free, no key                                                   |
| Kaspersky TIP            | optional `KASPERSKY_API_KEY`                     | verdict + zone                  | Free, no key (community tier)                                  |
| CAPE (self-hosted)       | optional `CAPE_BRIDGE_URL` + `CAPE_BRIDGE_TOKEN` | task report                     | Skipped if bridge unconfigured                                 |

All providers stream into the same `compositeScore('hash', …)` from
`api/src/lib/scoring.ts` used by `/api/v1/ioc/check`, so a verdict
means the same thing across the app.

## Free public-sandbox deep links (12)

These are **URL templates**, not API calls. The user opens the page
in a new tab; the sandbox handles the rest.

| Engine                | URL                                                            | Free?            | Key for full results? |
| --------------------- | -------------------------------------------------------------- | ---------------- | --------------------- |
| VirusTotal            | `virustotal.com/gui/file/<hash>`                               | ✓ (4/min)        | —                     |
| MalwareBazaar         | `bazaar.abuse.ch/sample/<sha256>/`                             | ✓                | —                     |
| Triage                | `tria.ge/s?q=<hash>`                                           | ✓ community tier | key for 200/day       |
| Hybrid Analysis       | `hybrid-analysis.com/search?query=<hash>`                      | ✓                | key for full API      |
| CAPE Sandbox (public) | `cape.sandbox.capev2.com/api/v1/tasks/search/sha256/<sha256>/` | ✓                | —                     |
| ANY.RUN               | `app.any.run/submissions/?search=<hash>`                       | ✓ community tier | key for full results  |
| Joe Sandbox           | `joesandbox.com/search?q=<hash>`                               | ✓ basic          | —                     |
| Intezer Analyze       | `analyze.intezer.com/files/<hash>`                             | ✓                | key for full results  |
| YARAify               | `yaraify-api.abuse.ch/sample/<hash>`                           | ✓                | key for full API      |
| ThreatFox             | `threatfox.abuse.ch/browse?search=hash%3A<hash>`               | ✓                | —                     |
| InQuest Labs          | `labs.inquest.net/dfi/sha256/<sha256>`                         | ✓                | —                     |
| OTX                   | `otx.alienvault.com/indicator/file/<hash>`                     | ✓                | —                     |

## What this endpoint is **not**

- ❌ **Not a Windows VM.** No detonation. The hash fan-out surfaces
  prior detonation reports from public sandboxes; it doesn't _run_
  your sample. For actual dynamic analysis, stand up [CAPE
  (self-hosted KVM + Windows guest)](../self-hosted/cape-bridge.md)
  or submit to Triage / ANY.RUN directly.
- ❌ **Not capa / olevba / yara.** No offline static rules. The
  frontend `analyseFile` does magic-byte + entropy + ASCII-string
  heuristics; richer rule-based static analysis is out of scope on
  Workers Free.
- ❌ **Not a substitute for 0x12darksandbox.net** in the strict
  sense. 0x12darksandbox runs your sample in a fresh Windows VM
  with Elastic EDR + Sysmon ETW for 3–7 minutes and reports
  behaviour, network IOCs, and runtime YARA hits. The lite
  version is "what does the threat-intel community already know
  about this hash, and where can I detonate it for free?".

## Adding more providers

The provider list is the single source of truth in
`api/src/routes/sample-scan.ts` (`HASH_PROVIDERS` constant) — add
the new `ProviderId` there and the corresponding adapter import
from `api/src/providers/`. The composite score, signature
aggregation, and SSE plumbing handle the rest automatically.

To add a new public-sandbox deep link, add an entry to
`api/src/lib/sample-scan.ts` (`PUBLIC_SANDBOXES`). Engines that
need a free community key should set `requiresKey: true` so the
UI labels them.

## Limits (Workers Free plan)

- **10 ms CPU / invocation.** The handler is intentionally simple
  (no multipart parsing, no server-side hashing, no recursive
  directory walks) and uses the same SSE chunked fan-out as
  `/api/v1/ioc/check` so a single scan typically completes in
  ~1s wall clock with all 10 providers.
- **100k requests / day.** Each user action = 1 request; cached
  results are held in `KV_CACHE` for a few minutes per the
  existing `ProviderCache` policy.
- **SSE concurrent cap.** Configured via
  `api/src/lib/sse-concurrency.ts` (`SSE_MAX_CONCURRENT`). Over
  the cap → 429 with `retry-after: 5`.

## See also

- `/dfir/malware-scan` — the older hash-only page; still
  available, slightly less polished UI.
- `/dfir/cape-sandbox` — the self-hosted CAPE bridge for
  operators who _do_ want a Windows VM.
- `/dfir/ioc-check` — for **non-hash** indicators (IP, domain,
  URL, email).
- `api/src/controllers/ioc-controller.ts` — the chunked
  fan-out / circuit-breaker / composite-score pattern that
  this endpoint mirrors.
- `api/src/lib/scoring.ts` — `compositeScore('hash', results)`.
- `api/src/lib/sample-scan.ts` — `PUBLIC_SANDBOXES` and
  `publicSandboxesFor(hash, type)`.
