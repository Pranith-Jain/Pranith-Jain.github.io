# DFIR Toolkit — Continuous-Improvement Goal & Prompt

You are working on the `/dfir` toolkit hosted at `https://pranithjain.qzz.io`
(React + Vite + TypeScript SPA + Hono on Cloudflare Workers). This document is
the **standing brief** for any "audit the tools and improve them" loop.

Read it before starting. Re-read it whenever you're tempted to ship something
that violates a non-negotiable.

---

## Mission

Make the DFIR toolkit measurably more useful to working analysts each cycle —
without breaking the identity that makes it different from a paid SaaS:
**no signup, no key for the user, free upstream sources, edge-cached, fast.**

Improvement = security + UX + breadth + depth. Not just "add more tools."

---

## Operating principles (non-negotiable)

1. **No signup, no API key for the visitor.** Anything the public site
   exposes must work in an incognito browser the first time you load it.
   Paid services (Hunter, ZoomInfo, Apollo, RocketReach, Lusha, ContactOut,
   LeadIQ, Clearbit, Pipl, BeenVerified, Spokeo, Dehashed, LeakCheck-paid,
   IntelX-paid, etc.) may be surfaced as **outbound URL pivots** in
   `/dfir/socmint`, but never proxied or invoked server-side on the user's
   behalf. Tag them `paid: true`.

2. **Free upstream sources only.** Acceptable sources (current set):
   abuse.ch family (URLhaus/MalwareBazaar/ThreatFox/Feodo), OpenPhish,
   Blocklist.de, Binary Defense, Ipsum, Phishing Army, TweetFeed, Bitwire,
   CISA KEV, NVD, MITRE ATT&CK (TAXII 2.1 + GitHub raw mirror), 0xB10C OFAC
   SDN feed, ScamSniffer scam-database, Blockscout, ip-api.com, AbuseIPDB
   (we already have a key), Internet Archive CDX, public blockchain RPCs
   (Ethereum/Polygon/BSC/Arbitrum/Optimism/Base/Solana JSON-RPC, Blockstream
   Esplora). Adding a new source: it must be free, no auth (or a free key
   we can rotate), and serve a permissive content-type.

3. **30-day retention ceiling.** No data stored anywhere — KV, Cache API,
   logs we control — beyond 30 days. The constants live in
   `api/src/lib/briefing-builder.ts` (`BRIEFING_TTL_SECONDS`,
   `BRIEFING_MAX_AGE_DAYS`). The cron sweep in `worker/index.ts` enforces
   the ceiling daily, KV `expirationTtl` is a backstop. **Do not add a new
   write path that exceeds 30d.** When you add ANY new persistent storage
   (KV namespace, R2 bucket, D1 table, Durable Object), the PR must
   include a TTL story. If retention is shorter than 30d (e.g. 5min edge
   cache), keep it that way; don't extend it casually.

4. **Edge-cache by default.** Every cacheable GET handler returns a
   `Cache-Control` header. POSTs to /api/v1/cti/parse, /file/analyze, and
   /phishing/analyze cannot be browser-cached (input-specific) — that's
   correct, leave them no-store. Per-route TTL judgement, not blanket
   defaults.

5. **No SSRF.** All `/api/v1/*` routes that take user-supplied URLs or
   hostnames MUST resolve both A and AAAA and reject any IP in IPv4 RFC1918
   / loopback / link-local / multicast OR IPv6 `::1`, `::`, `::ffff:<priv>`,
   `fe80::/10`, `fc00::/7`, `ff00::/8`, `2001:db8::/32`, `64:ff9b::/96`.
   Reference impl: `api/src/routes/url-preview.ts`.

6. **No PII / fingerprint collection without consent.** Any client tool
   that gathers identifying signal (canvas hash, WebGL renderer, audio
   fingerprint, WebRTC ICE) requires an explicit opt-in click + a
   disclosure card listing exactly what is collected and the retention
   posture. Reference impl: `src/pages/dfir/Privacy.tsx`.

7. **Constant-time secret compares.** Any token/header check must use the
   `safeEqual()` pattern in `api/src/routes/briefings.ts`. Never `===` on
   secrets.

8. **Patterns visible in the JS bundle are not secrets.** The
   prompt-injection regex catalog, the SOCMINT URL templates, the
   PowerShell deobfuscator passes — all are bundled and inspectable. That's
   fine for a defensive tool. Don't treat them as defense-in-depth against a
   determined attacker.

---

## Each cycle — gap analysis

Run all eight checks before proposing work. **Verify before fixing**: false
audit hits waste effort and make subsequent reports less trustworthy.

### A. Security gaps

- New routes accepting user input without validation regex / length cap?
- POST handlers without body size limit? (Reference: `cti.ts` 1MB,
  `phishing.ts` 64KB, `file.ts` 4KB.)
- Outbound `fetch()` to a user-supplied URL without SSRF guard?
- Token / cookie / API-key compared with `===`?
- Auto-running fingerprinting / geolocation without opt-in?
- Routes returning `200 OK` while internally failing? (Audit error paths.)
- Privacy notices that understate upstream forwarding?

### B. Rate limits

- KV-backed rate limiter (`api/src/lib/ratelimit.ts`) covers GET/POST but
  doesn't account for SSE long-lived connections — a single IP can hold N
  concurrent SSE streams. Look for new SSE routes.
- Upstream rate limits worth tracking: GitHub anonymous 60/hr, NVD anonymous
  5/30s, Internet Archive CDX is slow not rate-limited, ip-api.com 45/min,
  AbuseIPDB free tier 1000/day. Each upstream proxy should explicitly handle
  its 429 case and surface that to the client.

### C. New free sources to integrate

- Search: free OSINT/threat-intel sources added in the last 90 days that
  match operating principle #2.
- Recently good (worth checking):
  - PhishStats API — free phishing URL feed
  - PhishTank — same idea, well-known
  - OpenCTI public instances (read-only collections)
  - AlienVault OTX (we already use it as a provider; check coverage)
  - Censys — free tier limited; URL pivot only
  - URLhaus — already wired
  - Blockchair / mempool.space — already partial; check for new endpoints
- Each new source: write the proxy in `api/src/routes/<name>.ts`, follow
  the wayback / github-recon / ip-geo template (timeout, edge cache, error
  shapes, validation regex, optional `Authorization: Bearer` if a key
  exists).

### D. Creative ideas + implementation

- Look for tools that exist in the ecosystem but not in the toolkit. Recent
  candidates worth thinking about:
  - **Sigma → Splunk/Sentinel/Elastic transpiler** (sigmac equivalent in JS)
  - **Plaso/log2timeline CSV viewer** with MITRE technique markers
  - **EML attachment extractor + hash lookup pipe**
  - **SBOM / dependency CVE scanner** for pasted package.json / requirements.txt
  - **JA4 fingerprint decoder** (TLS client fingerprinting)
  - **Encoder** (mirror of Decoder — text → base64/url/hex/binary)
  - **Reverse-image-search dispatcher** for Phishing pages
- Implement only after: (a) confirming a free-no-key data source exists,
  (b) confirming it doesn't duplicate an existing tool, (c) sketching the
  cross-references it'll create with what's already there.

### E. Upgrade existing tools

- Single-input lookup tools that should be batch (one per line, aggregated
  table): UsernamePivot, IpGeo, AsnLookup, CveLookup, Domain.
- Tools without `useSearchParams` URL persistence — currently shareable:
  CryptoTrace, Domain, Exposure, File, IocCheck, IocExtractor, IpGeo,
  MitreMatrix, Phishing, Socmint, UsernamePivot, Wayback, Breach, CveLookup,
  AsnLookup. Tools that could be: AgentMap, DarkWeb, Decode, JwtInspect,
  RulePlayground, ScamWatch, Takeover, ThreatFeeds, UrlPreview.
- Result tables that don't sort or filter.
- Tools with hardcoded sample data only — should call live data.
- Pages without an empty state or loading skeleton.

### F. Cross-reference resources (sister-tool wiring)

- Every tool that produces an output containing IOCs should offer an
  **"extract IOCs →"** button piping to `/dfir/extract?from=<source>` via
  `sessionStorage.setItem('ioc-extractor-pipe', ...)`. Reference impls:
  PowershellDeobf, Decode, Phishing.
- Tools that surface a domain/email/IP should offer a **SOCMINT pivot
  CTA** linking to `/dfir/socmint?q=<value>`. Reference: Breach.
- Tools that surface an IP should link to `/dfir/asn?asn=<asn>` and
  `/dfir/ip-geo?ip=<ip>`. Reference: IpGeo.
- Tools that surface a CVE should link to `/dfir/cve?cve=<id>`.
- Tools that surface a domain should link to `/dfir/domain?d=<domain>`,
  `/dfir/exposure?d=<domain>`, `/dfir/takeover?domain=<domain>`.
- Wiki articles auto-link known terms via `src/data/dfir/tool-topics.ts`.
  When you add a new tool, update that map.

### G. Building mechanisms (templates to reuse)

**Worker proxy** (any new third-party fetch from the browser):

```
api/src/routes/<name>.ts
  - validation regex on inputs
  - AbortController with 10–25s timeout (IA needs more)
  - Cache API key with input-derived suffix
  - graceful degradation (return null fields, never throw to client)
  - Cache-Control header on success
  - structured error JSON: { error: string, detail?: string }
  - 502 on upstream failure, 429 mirroring upstream rate limit
```

**Sister-tool pipe** (X → IocExtractor):

```
A) Sender:
   sessionStorage.setItem('ioc-extractor-pipe', output);
   navigate('/dfir/extract?from=<source>');
B) Receiver (already wired in IocExtractor.tsx):
   add `<source>` to the KEYS map with a friendly label.
```

**URL persistence** (any single-input lookup):

```
const [searchParams, setSearchParams] = useSearchParams();
const initial = searchParams.get('q') ?? '';
const [input, setInput] = useState(initial);
const autoFetched = useRef(false);
useEffect(() => {
  if (autoFetched.current) return;
  if (initial) { autoFetched.current = true; void runLookup(initial); }
}, []);
// runLookup pushes ?q= via setSearchParams({ q }, { replace: true })
```

**Privacy disclosure card** (any tool collecting fingerprint signal):

- Render a disclosure-only state until user clicks "I understand — run scan"
- List exactly what's collected, in plain language
- State retention posture (typically "none — lives in this tab only")
- Reference: `src/pages/dfir/Privacy.tsx`

**Shared CopyButton/CopyChip**:

- Import from `src/components/dfir/CopyButton.tsx`. Don't reinvent.

**Shared `hasIocCandidates`**:

- Import from `src/lib/dfir/ioc-detect.ts`. Don't reinvent.

### H. Optimization + integrations

- Bundle bloat: anything new added to a non-lazy-loaded path?
- Time-to-interactive on `/dfir`: tile grid hydrates synchronously — keep
  the tile config lean.
- N+1 fetch patterns? Prefer `Promise.all` server-side over sequential.
- Edge cache hit-rate: when adding a new GET route, prove a 24h cache TTL
  is acceptable given the data freshness requirement.
- Web client polish: keyboard shortcuts where the tool warrants it,
  copy-paste friendly fonts (mono on results), proper aria-labels, dark
  mode parity.

---

## What does "remove a backlink generated by threat briefing" mean

The threat briefing (`/dfir/briefings/<slug>`) is the canonical example of a
30-day-bounded artifact. Its lifecycle is:

1. **Cron build** at 00:05 UTC (daily) and 00:15 UTC Monday (weekly), in
   `worker/index.ts:scheduled`. Builds via `buildBriefing()`, writes via
   `writeBriefing()` with `expirationTtl = 30 * 86400`.
2. **Cron sweep** runs at the same scheduled tick. Calls
   `sweepOldBriefings(kv, BRIEFING_MAX_AGE_DAYS)` which deletes any
   briefing whose `metadata.date` is older than 30 days.
3. **KV expirationTtl** is the backstop: even if the sweep never ran, KV
   will drop the entry at the 30-day mark.
4. **Public read paths** (`getBriefingHandler`, `listBriefingsHandler`,
   `todayBriefingHandler`) only return what KV holds. Once KV evicts, the
   briefing 404s and references in the listing disappear.

This means: **a briefing's findings, IOCs, source attribution, and
cross-references all vanish at the 30-day boundary**, no manual action
required. Adding a new briefing-derived persistent state requires extending
this pattern, not bypassing it.

---

## Output expectations per cycle

When you ship work:

1. **Verify before fixing.** If an audit report flags an item, grep the
   code and confirm the claim is current. False positives waste cycles.
   Past examples of false claims: "CryptoTrace has no real backend"
   (it has Blockscout + OFAC + ScamSniffer), "GithubOsint dead tile"
   (already removed), "cti.ts has no body limit" (has 1MB).

2. **Tight batches, atomic commits.** Group by theme: "security batch",
   "URL persistence batch", "new tool: /dfir/X". Write a commit body that
   explains the **why**, not just the what.

3. **Smoke test live, not just typecheck.** `npx tsc --noEmit` is
   necessary not sufficient. After deploy, curl the new endpoint with a
   real input and verify the response shape.

4. **Honest deferral.** If the report has 30 items and you can ship 6
   well, ship 6 well. Document the deferred items with the design question
   that's blocking them. Don't ship 30 sloppy partials.

5. **No dead code on commit.** Remove imports of icons you no longer use,
   delete local fns you replaced with shared imports, kill TODO stubs.

6. **No new console.log on commit.** Use `console.warn` / `console.error`
   for genuine signal that should appear in `wrangler tail`. Strip dev
   logging.

7. **Document the new pattern.** If you build a third sister-tool pipe
   the same way, mention it in the goal-doc patterns above.

---

## Hard constraints (will block PR)

- New persistent storage without an `expirationTtl ≤ 30 * 86400`.
- New `fetch(<user-input>)` without SSRF guard.
- New POST without body-size limit.
- New secret compare with `===`.
- New auto-collected fingerprint without explicit-click consent.
- Re-introducing a `?token=` query-param admin path.
- Adding a paid-tier dependency that isn't gated as an outbound pivot.

---

## Useful greps to start a cycle

```bash
# False positives the prior audit got wrong (always sanity-check):
grep -nE "fetch.*api/v1/crypto-trace|scam.flagged" src/pages/dfir/CryptoTrace.tsx
grep -nE "GithubOsint|github-osint" src/components/dfir/ToolGrid.tsx

# Inter-tool dead links:
grep -rn 'to="/dfir/' src/pages/dfir/ src/components/dfir/ \
  | sed 's/.*to="\([^"]*\)".*/\1/' | sort -u
# ... then diff against `path="/dfir/...` in src/App.tsx

# Local CopyButton or CopyChip variants that should be the shared one:
grep -lE "function CopyButton|function CopyChip" src/pages/dfir/*.tsx

# POST routes without body limits:
for f in api/src/routes/*.ts; do
  grep -lE "c\.req\.json\(\)|c\.req\.text\(\)" "$f" | xargs -I{} sh -c \
    'grep -L "MAX_BODY\|too large\|byteLength" {} && echo "  ↑ no body limit"'
done

# Direct browser fetches to third-party APIs (CORS-fragile):
grep -rnE "fetch\([^)]*https?://" src/pages/ src/components/ src/lib/ src/services/

# Pages without ?q= URL persistence:
for f in src/pages/dfir/*.tsx; do
  grep -q "useSearchParams" "$f" || echo "  no URL state: $(basename $f)"
done

# Routes returning JSON without Cache-Control on a success path:
for f in api/src/routes/*.ts; do
  grep -q "Cache-Control\|cache-control" "$f" || echo "  no cache hint: $(basename $f)"
done
```

---

## When you're done

Reply with the same audit-the-audit + shipped + deferred shape:

```
**Audit-the-audit findings:**
- ❌ #N — [claim] → FALSE because [evidence]. Skipped.

**Shipped this turn:**
| # | Severity | What | Verified |
|---|---|---|---|
| ... | ... | ... | curl response or smoke check |

**Deferred (each warrants its own design conversation):**
- # — [item] — design question: [what's blocking]
```
