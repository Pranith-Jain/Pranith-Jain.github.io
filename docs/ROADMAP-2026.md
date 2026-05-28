# 2026 Platform Roadmap

**Owner:** Pranith Jain
**Budget:** Cloudflare free tier (1k KV writes/day, 100k req/day, 5 cron triggers)
**Theme:** Maximum coverage within free-tier constraints — no monetization, all passion.

---

## Tier 1: Zero New Infra, Pure Code

Effort: ~1–4h each. No new Cloudflare services needed.

### ✅ ActorKb On-Demand JSON *(Done — 2026-05-27)*
- Moved 476KB `ACTOR_KB` data from bundled module to `public/data/actor-kb.json`
- ActorKb page chunk dropped from ~420KB → 22KB
- 433KB JSON loads as cached static asset

### ☐ Prerender Expansion *(Next)*
- Add remaining static routes to `scripts/prerender.mjs` ROUTES array
- All routes already prerender chrome + loading state; expanding adds instant FCP everywhere
- Effort: 0.5h

### ☐ STIX 2.1 Export Everywhere
- Add "Download as STIX" button to IOC check results, correlation, detection rules
- `stix-build.ts` already written — just needs UI wiring
- Effort: 2h

### ☐ Automated IoC Blocklist Generator
- New endpoint: `/api/v1/blocklists/pfsense`, `/iptables`, `/suricata`
- Reads from live IOC cache in KV; regenerated on read with 5-min cache
- No cron needed — pure fetch + format
- Effort: 3h

### ☐ Phishing Kit Fingerprinting
- Client-side: when user submits phishing URL, fetch page content, hash HTML/CSS structure (structure fingerprint, not exact match)
- Store fingerprints in KV with first-seen date; check new submissions against existing
- All hashing in-browser → only fingerprints hit the API
- Effort: 4h

### ☐ Cross-Source Unified Search
- Single endpoint that fans out to in-process feed aggregators (ransomware-recent, live-iocs, c2-tracker, detections) and merges by entity type
- Already 90% there — Threat Pulse does this for 4 sources; extend to all 10
- Effort: 4h

---

## Tier 2: Merge Into Existing Hourly Cron

No new cron slot needed — merges into the existing `0 * * * *` handler.

### ☐ Threat Actor Timeline Journal
- In the hourly cron, after feed-warm step: take today's ransomware claims + actor-timeline data → Workers AI generates a 3-paragraph brief per active group → store in D1
- Serve at `/api/v1/actor-journal` or embed in existing actor-timeline page
- Effort: 3h

### ☐ Alert Engine
- Storage: KV with key `watch::{user-hash}::{entity}` → alert config
- Hourly cron: check watched entities against new data, dispatch webhook/email
- 240 writes/day for 10 watches hourly updated — well within 1k/day limit
- Effort: 8h

### ☐ Personal Threat Dashboard
- "Your domain / email / brand" page with KV-stored watchlist
- Hourly cron (same alert engine pass) runs domain reputation, breach checks, TLS expiry
- Stored results served at `/threatintel/my-dashboard`
- Effort: 6h

---

## Tier 3: Client-Side Only, No Server Changes

### ☐ OSINT Automation Workbench
- Browser-side DAG runner: user chains tools ("find subdomains → check takeover → scan headers → report")
- Compose steps as JS functions calling the 84 existing API endpoints
- No new server infra
- Effort: 6h

### ☐ AI Investigation Copilot
- Chat UI that calls the campaign generator LLM pipeline with agentic context gathering
- Pattern: user asks "latest on LockBit" → server-side fetches ransomware-recent + actor-timeline + negotiations + writeups → Workers AI → narrative
- Fits in 10ms CPU because LLM call is the only heavy step
- Effort: 8h

---

## Tier 4: Durable Objects (Still Within Free Tier)

### ☐ WebSocket for Real-Time Feeds
- Durable Object per feed type (certstream, x-live, telegram)
- DO.fetch() upgrades to WS; each DO polls at 5s intervals and pushes to connected clients
- DO free = 1M requests/month — fine for personal use
- Real win: CertStream pushes certs as they arrive instead of polling crt.sh every 15s
- Effort: 10h

---

## Not Worth It

| Idea | Why |
|---|---|
| Dark web monitoring (.onion crawl) | Workers can't reach Tor natively. Existing sources (deepdarkCTI, Ransomlook) already index .onion surfaces. |
| CTI data marketplace | Commercial by nature. |
| KV cache sweep / TTL tuning | Already using reasonable TTLs; cron warm mitigates cold starts. |

---

## Proposed Schedule

```
Week 1:  Prerender expansion                         (0.5h)
Week 2:  STIX export everywhere + IoC blocklists      (5h)
Week 3:  Phishing kit fingerprinting                   (4h)
Week 4:  Cross-source search                           (4h)
Week 5:  Alert engine (into hourly cron)               (8h)
Week 6:  Personal threat dashboard                     (6h)
Week 7:  AI investigation copilot                      (8h)
Week 8:  OSINT automation workbench + WebSocket feeds  (16h)
```

---

## Potential New Free Sources (If Time Permits)

| Source | What It Adds | Integration |
|---|---|---|
| LeakIX | Open ports, exposed services, leaked credentials | 1 provider adapter |
| Pulsedive | IOC enrichment + threat actor context | 1 provider adapter |
| InQuest Labs | IOC enrichment + threat reports | 1 provider adapter |
| SecurityTrails | DNS history, subdomain enumeration, WHOIS | 1 provider adapter |
| HackerTarget | DNS, port scan, reverse IP | 1 provider adapter |
| DNSDumpster | Subdomain discovery, DNS map (no key) | 1 provider adapter |
| BinaryEdge | Ports, services, vulnerabilities | 1 provider adapter |
| ONYPHE | Darknet, pastebin, exposed services | 1 provider adapter |
| Triage | Malware analysis sandbox | 1 provider adapter |
| Maltiverse | Threat intelligence aggregation | 1 provider adapter |
| Criminal IP | Port/domain/IP correlation | 1 provider adapter |
| IntelX | Pastebin, breach data (free tier limited) | 1 provider adapter |
| Fox-IT RSS | Dutch CERT threat intel | RSS feed addition |
| JPCERT/CC RSS | APAC threat intel | RSS feed addition |
| Cloudflare Radar | Internet traffic trends, ASN ranking | 1 provider adapter |
