# pranithjain.qzz.io

Portfolio of **Pranith Jain** — security analyst working threat intel, email defense, and security automation — bundled with a 60+ tool DFIR toolkit and a live, self-updating threat-intel platform. One Cloudflare Workers deploy, edge-cached, free at the edge, no signup, no API key required to use it.

**Live:** [pranithjain.qzz.io](https://pranithjain.qzz.io) · [/dfir](https://pranithjain.qzz.io/dfir) · [/threatintel](https://pranithjain.qzz.io/threatintel) · [/blog](https://pranithjain.qzz.io/blog)

---

## Three surfaces, one deploy

### 1. Portfolio (`/`, `/about`, `/skills`, `/experience`, `/projects`)

React + Vite + TypeScript with SSR prerendering. Hero, skills grid, timeline experience, certifications, featured work, contact CTA. Dark/light, responsive, accessible, fast first paint via prerendered routes.

### 2. DFIR Toolkit (`/dfir/*`)

60+ interactive analyst tools — triage, OSINT, email security, detection engineering, AI-security, data security — running client-side or via thin edge-API calls. Zero signup, zero keys to start.

### 3. Threat Intel Platform (`/threatintel/*`)

A live CTI surface that updates itself: ransomware leak-site + negotiation tracking, CVE/KEV feeds, a cross-source IOC firehose with consensus scoring, actor timelines, dark-web/forum intelligence, social/Telegram/Reddit firehoses, auto-generated briefings, and a fully autonomous case-study blog (discover → QA → publish) — all hourly-refreshed, all on the free tier.

---

## Threat Intel Platform — surfaces at a glance

| Surface                                               | What it does                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live Ransomware Activity                              | Recent leak-site claims merged across Ransomlook, ransomfeed.it, ransomwatch, ransomware.live, MyThreatIntel & Andrea Fortuna; per-victim screenshots, sector heuristics                       |
| Ransomware Negotiations                               | ransomware.live PRO negotiation chats across every group — demand vs. settled, discount %, status, full transcript drill-down (Casualtek/Ransomchats)                                          |
| Actor Activity Timeline                               | Per-actor leak-site cadence heatmap + MITRE ATT&CK group/TTP pivot; MyThreatIntel-enriched                                                                                                     |
| Victim Re-leak Trends                                 | Sector + operation-type breakdowns, group↔group re-claim pairs, and a re-leak timeline (not just raw victim rows)                                                                              |
| Infostealer Live Tracker                              | HudsonRock victim exposure, log-market threads, stealer-log Telegram directory, family-matched samples/IOCs, plus a **combo & forum intel** tab (metadata only — never the stolen data)        |
| Breach / Leak-Forum Tracker                           | deepdarkCTI criminal-forum + dark-market directory plus a curated venue list — names/status/OSINT-coverage links only                                                                          |
| CVE List                                              | NVD published-window + CISA KEV merge; MyThreatIntel **API-primary** (Telegram-scrape fallback) + cvefeed gap-fill, EPSS/KEV-aware                                                             |
| IOC Correlation                                       | Cross-source consensus scoring across many feeds (interactive)                                                                                                                                 |
| Live IOC Stream                                       | Chronological multi-source firehose                                                                                                                                                            |
| Threat Pulse                                          | Entities ranked by cross-source mentions over 24h                                                                                                                                              |
| Threat Intel Metrics                                  | 15 hand-rolled-SVG panels (ransomware/CVE/KEV/phishing/C2/breach/OSINT/dark-web) with live ▲/▼ deltas                                                                                          |
| Dark Web Watch                                        | Aggregated leak-site/breach/research RSS, keyword watchlist, per-source filtering                                                                                                              |
| Telegram / Reddit / Social firehoses                  | Curated public Telegram channels, infosec subreddits, Bluesky+Mastodon researchers                                                                                                             |
| Live Breach Disclosures                               | Have I Been Pwned feed with verification flags                                                                                                                                                 |
| Onion Watch                                           | .onion mirror inventory for ransomware leak sites                                                                                                                                              |
| Cyber Crime & Fraud                                   | Indictments, crypto-crime tracing, breach reporting                                                                                                                                            |
| Tech & AI News / Threat Feeds / Scam Watch            | Curated multi-section RSS aggregations                                                                                                                                                         |
| Intel Briefings                                       | Daily/weekly auto-generated digests (cron-built, D1-backed)                                                                                                                                    |
| Case-Study Blog (`/blog`)                             | Autonomous pipeline: discover (9 topics) → score/dedupe → AI generate (Groq primary, Workers-AI fallback) → anti-slop + deterministic content-QA gate → schedule → publish; admin-gated review |
| Writeups / Threat Actors / MITRE ATT&CK / deepdarkCTI | Analyst-blog aggregation, APT catalogue, full matrix, parsed dark-web index                                                                                                                    |
| Feed Status                                           | Health dashboard for every upstream + internal feed                                                                                                                                            |
| Catalogs                                              | CVE Resources (~70), SecOps Tools (~140), OSINT Framework (70+), long-form Knowledge Base                                                                                                      |

> The MyThreatIntel REST API (token-gated) is wired in as a primary source for live CVE, actor-timeline, negotiations, and metrics, with the public `t.me/s/mythreatintel` scrape as automatic fallback so nothing degrades when the token is unset. A public TAXII/MISP/STIX export previously existed and was **removed** — an externally-pollable feed is a free-tier budget risk.

---

## DFIR Toolkit — tools at a glance

| Category                  | Tools                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Triage & IOCs**         | IOC & Hash Checker (streaming, 24 sources), Malware Scanner (client-side static analysis + 11-engine hash dispatch), IOC Extractor (refang-aware), Decoder/Encoder, PowerShell Deobfuscator, Timestamp Converter, Hash Calculator                                   |
| **Domain & Network**      | Domain Lookup (WHOIS/DNS/email-auth/CT), Full Spectrum Domain, ASN Lookup, Exposure Scanner, Web Vuln Scanner, Subdomain Takeover, Certificate Search, Domain/IP & URL Reputation (19 DNSBLs via DoH)                                                               |
| **OSINT**                 | Username Pivot (50+ services), Wayback Pivot, IP Geo (+AbuseIPDB/OSM), SOCMINT Pivots, URL Preview (safe fetch + screenshot), EXIF, Reverse Image, Homograph Detector, Crypto Tracer, Dork Builder, Brand Impersonation, Image Fingerprint, Screenshot Intelligence |
| **Email Security**        | Phishing Email Analyzer, EML Attachment Extractor, Email Defense / BEC Score (SPF/DKIM/DMARC/BIMI/MTA-STS/TLS-RPT), Email Reputation (auth + 19 DNSBL)                                                                                                              |
| **Vulns & Identity**      | CVE Lookup (NVD + CVSS + EPSS + CISA KEV + patch-priority), Breach Checker (k-anonymity), JWT Inspector                                                                                                                                                             |
| **Detection Engineering** | YARA/Sigma Playground, YARA Rule Manager (+ ransomware.live attack→detection panels), LOLBins/GTFOBins, Log Parser (+MITRE tagging), STIX 2.1 Viewer                                                                                                                |
| **Frameworks & Posture**  | Kill Chain, Diamond Model (IOC/actor auto-fill), OWASP Top 10 (Web/API/LLM), NHI Inventory & Top 10, Tabletop generator, GRC maturity (NIST CSF/ISO/CIS/SOC2)                                                                                                       |
| **AI Security**           | Prompt Injection & Red-Team, MCP & Claude Code Auditor, AI Agent Attack-Surface Mapper, MITRE ATLAS                                                                                                                                                                 |
| **Data Security**         | Sensitive Data Detector (Luhn/IBAN/Verhoeff verified), Data Classification, Privacy Hub (GDPR/CCPA/DPDP/HIPAA/PCI)                                                                                                                                                  |

**IOC providers (24):** VirusTotal, AbuseIPDB, Shodan, Censys, Netlas, OTX, URLScan, Hybrid Analysis (keyed) · ThreatFox/URLhaus/MalwareBazaar (one abuse.ch key) · Spamhaus DROP, Tor exits, OpenPhish, PhishStats, CINS, CIRCL Hashlookup, multi-vendor DoH, Blocklist.de, Binary Defense, Ipsum, Phishing Army, TweetFeed (public, no signup).

---

## Tech stack

| Layer    | Choice                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------- |
| Frontend | React 18 + Vite + TypeScript + Tailwind                                                            |
| Routing  | React Router v6, lazy-loaded (150+ route components)                                               |
| SSR      | Prerendered routes for instant first paint                                                         |
| Backend  | Cloudflare Workers + Hono                                                                          |
| Storage  | Cloudflare KV (briefings, dedup, rate-limit), Cache API (provider/feed results), D1 (briefings DB) |
| AI       | Groq free tier (primary) → Workers AI Llama chain (fallback) for the case-study engine             |
| Tests    | Vitest — extensive client + worker suites (worker suite alone 100+ tests)                          |
| Quality  | ESLint + Prettier + husky/lint-staged; `tsc --noEmit` gate                                         |
| Deploy   | `wrangler deploy`                                                                                  |

---

## Local dev

```bash
npm install
npm run dev          # Vite — http://localhost:5173
npm run dev:api      # Worker — http://localhost:8787
npm test             # Vitest
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint (max-warnings 0)
npm run deploy       # build + wrangler deploy
```

Requires `wrangler login` and the `pranithjain.qzz.io` zone (or fork and point `wrangler.jsonc` at your own).

## Secrets

The toolkit works with **zero** keys. These unlock extra providers / the CTI engine:

```bash
# IOC providers (optional)
npx wrangler secret put VT_API_KEY ABUSEIPDB_API_KEY SHODAN_API_KEY \
  CENSYS_PAT NETLAS_API_KEY OTX_API_KEY URLSCAN_API_KEY HYBRID_ANALYSIS_API_KEY
npx wrangler secret put ABUSECH_AUTH_KEY        # ThreatFox + URLhaus + MalwareBazaar

# Threat-intel / content engine
npx wrangler secret put RANSOMWARELIVE_API_KEY  # ransomware.live PRO (negotiations, yara, cyberattacks)
npx wrangler secret put MYTHREATINTEL_API_TOKEN # MyThreatIntel REST API (CVE/actor/victim primary; TG-scrape fallback)
npx wrangler secret put GROQ_API_KEY            # case-study generation primary model (Workers AI fallback)
npx wrangler secret put ADMIN_TOKEN             # case-study + briefing admin endpoints (X-Admin-Token)
```

Every secret is optional and fails safe: the relevant feature degrades or falls back rather than breaking the deploy.

## Cost / quotas

Engineered for the **Cloudflare Workers free tier**:

- Provider/feed results cached to the **Cache API** (not KV) — KV write quota stays free
- Discovery dedup folded into a single KV blob (1 read/run, not ~100)
- No externally-pollable export API (removed by design)
- Short, self-expiring cache TTLs so publishes/deletes reflect in minutes without invalidation bookkeeping
- World atlas bundled locally; lean asset bundle; fast worker startup

## Security & accessibility

- CSP/HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy on all responses
- SSRF guard via DNS-level public-IP validation (`assertPublicHost` + `pinnedFetch`)
- Constant-time token comparison; no hardcoded secrets (all via `wrangler secret`)
- Rate limiting on API endpoints; defensive-only handling of breach/stealer/forum data (metadata, never stolen content)
- WCAG 2.2 AA: skip-to-content, focus traps, ARIA roles, `role="alert"` on errors, reduced-motion support, 44px touch targets

## Repository layout

```
src/                    React app — pages/{dfir,threatintel}, components, lib/dfir, data, hooks
api/src/                Cloudflare Worker (Hono) — routes/, providers/ (24 IOC), lib/, case-study/ (CTI engine)
api/src/case-study/     Autonomous blog: discovery/ · generation/ (ai-client, prompts, post-process QA) · publishing/
worker/index.ts         Worker entry: API dispatch, SPA serve, cron (discover/plan/publish/briefings)
public/ · scripts/      Static assets · prerender / wiki-extract / OG-image
docs/                   Design specs, onboarding, PROFILE_README draft
```

---

## Contact

Built and maintained by **Pranith Jain** — Security Analyst (Threat Intel · Email Defense · Security Automation).
[pranithjain.qzz.io](https://pranithjain.qzz.io) · [LinkedIn](https://www.linkedin.com/in/pranithjain) · [GitHub](https://github.com/Pranith-Jain)

PRs that add genuinely distinctive sources or improve scoring/detection math are welcome.
