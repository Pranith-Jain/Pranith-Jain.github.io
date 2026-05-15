# pranithjain.qzz.io

Personal portfolio for **Pranith Jain** — security analyst, detection engineer, and cyber criminologist — bundled with a full DFIR toolkit and a live threat-intel platform. All hosted on Cloudflare Workers, edge-cached, free at the edge.

**Live:** [https://pranithjain.qzz.io](https://pranithjain.qzz.io) · [/dfir](https://pranithjain.qzz.io/dfir) · [/threatintel](https://pranithjain.qzz.io/threatintel)

---

## What this repo contains

Three surfaces in one deploy:

### 1. Portfolio (`/`, `/about`, `/skills`, `/experience`, `/projects`)

React + Vite + TypeScript portfolio with SSR prerendering. Hero, skills grid (14+ competency areas), timeline experience, featured articles, certifications, and a contact CTA. Dark/light theme, responsive, 100/100 Lighthouse.

### 2. DFIR Toolkit (`/dfir/*`)

60+ interactive security tools running entirely in the browser or via edge API calls. No signup, no API key required.

### 3. Threat Intel Platform (`/threatintel/*`)

Live streaming threat-intel surface — ransomware leak-site claims, CVE/KCV feed, IOC firehose, cross-source correlation, actor timelines, Telegram/Reddit/social firehoses, briefings, and writeups aggregation.

---

## DFIR Toolkit — tools at a glance

| Category                       | Tools                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Triage & IOCs**              | IOC & Hash Checker (streaming, 24 sources), Malware Scanner (client-side static analysis + hash dispatch to 11 engines), IOC Extractor (refang-aware), Decoder, Encoder, PowerShell Deobfuscator, Timestamp Converter, Hash Calculator                                                                                                                                                               |
| **Domain & Network**           | Domain Lookup (WHOIS/DNS/email auth/CT logs), Full Spectrum Domain, ASN Lookup, Exposure Scanner, Web Vulnerability Scanner, Subdomain Takeover, Certificate Search, Domain & IP Reputation (19 DNSBLs via DoH), URL Reputation (streaming IOC verdicts)                                                                                                                                             |
| **OSINT**                      | Username Pivot (Sherlock-lite, 50+ services), Wayback Machine Pivot, IP Geolocation (with AbuseIPDB + OpenStreetMap), SOCMINT Pivots, URL Preview (safe server-side fetch + screenshot), EXIF Parser (client-side), Reverse Image Search, Homograph Detector, Crypto Address Tracer, Google Dork Builder, Brand Impersonation Explorer, Image Fingerprint, Screenshot Intelligence (OCR + QR + EXIF) |
| **Email Security**             | Phishing Email Analyzer (header parse + auth check + URL extraction), EML Attachment Extractor, Email Defense / BEC Score (SPF/DKIM/DMARC/BIMI/MTA-STS/TLS-RPT spoofability scoring), Email Reputation (auth + 19 DNSBL blacklist checks)                                                                                                                                                            |
| **Vulnerabilities & Identity** | CVE Lookup (NVD + CVSS + EPSS + CISA KEV + combined patch-priority score), Breach Checker (Pwned password k-anonymity), JWT Inspector                                                                                                                                                                                                                                                                |
| **Detection Engineering**      | YARA/Sigma Playground, YARA Rule Manager, LOLBins/GTFOBins Catalog, Log Parser (WinEvent/Sysmon/syslog + MITRE tagging), STIX 2.1 Viewer (interactive graph)                                                                                                                                                                                                                                         |
| **Frameworks & Posture**       | Cyber Kill Chain, Diamond Model (auto-fill from IOC/actor), OWASP Top 10 (Web/API/LLM), NHI Inventory & Top 10, Tabletop/IR Exercise Generator, GRC Compliance & Maturity (NIST CSF/ISO/CIS/SOC2)                                                                                                                                                                                                    |
| **AI Security**                | Prompt Injection & Red-Team (28 patterns, 26-prompt library), MCP & Claude Code Auditor, AI Agent Attack-Surface Mapper, MITRE ATLAS                                                                                                                                                                                                                                                                 |
| **Data Security**              | Sensitive Data Detector (28 patterns, Luhn/IBAN/Verhoeff verified), Data Classification & Handling, Privacy & Data-Protection Hub (GDPR/CCPA/DPDP/HIPAA/PCI)                                                                                                                                                                                                                                         |

### IOC Providers (24 sources)

| Tier                      | Sources                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commercial (API key)      | VirusTotal, AbuseIPDB, Shodan, Censys, Netlas, OTX, URLScan, Hybrid Analysis                                                                                                               |
| abuse.ch (one shared key) | ThreatFox, URLhaus, MalwareBazaar                                                                                                                                                          |
| Public / no signup        | Spamhaus DROP/EDROP, Tor exit list, OpenPhish, PhishStats, CINS Army, CIRCL Hashlookup, Cloudflare/Google/Quad9/Bitwire DoH, Blocklist.de, Binary Defense, Ipsum, Phishing Army, TweetFeed |

### DNSBL Sources (19, no API key)

**IP blacklists (13):** Spamhaus ZEN/XBL/PBL, CBL (AbuseAT), PSBL, UCEPROTECT Level 1, SpamCop, Barracuda BRBL, SORBS DUHL/SPAM, Spam Eating Monkey FRESH, Hostkarma JunkEmailFilter, SPFBL.net

**Domain blacklists (6):** Spamhaus DBL, URIBL multi/black/grey, SURBL, Invaluement

---

## Threat Intel Platform — surfaces at a glance

| Surface                      | Description                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Dark Web Watch               | Aggregated leak-site, ransomware, breach activity from 15 RSS sources with keyword watchlist |
| Live Ransomware Activity     | Recent leak-site claims from Ransomlook with per-victim screenshots                          |
| Infostealer Live Tracker     | HudsonRock, demonforums ULP, stealer-log Telegram channels                                   |
| Threat Pulse                 | Fresh entities ranked by cross-source activity over 24h                                      |
| Cybersec Telegram Firehose   | Message stream from curated public Telegram channels                                         |
| Cybersec Reddit Firehose     | 16 infosec subreddits                                                                        |
| Cybersec Social Firehose     | 16 researchers on Bluesky + Mastodon                                                         |
| Live Breach Disclosures      | Have I Been Pwned feed with verification flags                                               |
| Onion Watch                  | .onion mirror inventory for ransomware leak sites                                            |
| Cyber Crime & Fraud          | DOJ indictments, crypto-crime tracing, breach reporting                                      |
| Tech & AI News               | 16-source feed for AI labs, cyber M&A, general tech                                          |
| Threat Map                   | Live geolocated choropleth across 50+ countries                                              |
| Intel Briefings              | Daily and weekly auto-generated digests (cron-built)                                         |
| Writeups Feed                | 18+ analyst blogs aggregated live                                                            |
| Threat Actors                | APT catalogue with TTPs and MITRE mapping                                                    |
| MITRE ATT&CK                 | Full matrix with per-technique deep-dives                                                    |
| CVE List                     | NVD feed + CISA KEV catalogue with severity                                                  |
| IOC Correlation              | Cross-source consensus scoring across 18 feeds                                               |
| Live IOC Stream              | Chronological firehose from 10 sources                                                       |
| Ransomware Activity Timeline | Per-actor leak-site cadence + MITRE profiles                                                 |
| Victim Re-leak Detection     | Victims claimed by 2+ ransomware groups                                                      |
| Feed Status                  | Health dashboard for all upstream feeds                                                      |
| Domain Monitor               | Typosquatting scanner with DNS resolution (inspired by haveibeensquatted.com)                |
| CVE Resources Catalog        | ~70 curated CVE sources                                                                      |
| SecOps Tools Catalog         | ~140 hand-picked tools across 14 categories                                                  |
| OSINT Framework              | 70+ curated OSINT tools                                                                      |
| Knowledge Base               | Long-form articles on Telegram OSINT, dark-web monitoring, MITRE workflows                   |

---

## Tech stack

| Layer      | Choice                                                              |
| ---------- | ------------------------------------------------------------------- |
| Frontend   | React 18 + Vite 6 + TypeScript + Tailwind CSS 3                     |
| Routing    | React Router v6 (lazy-loaded routes, 140+ route components)         |
| SSR        | 25 prerendered routes (portfolio pages + key DFIR/TI surfaces)      |
| Backend    | Cloudflare Workers + Hono                                           |
| Storage    | Cloudflare KV (briefings, rate-limit), Cache API (provider results) |
| Maps       | react-simple-maps with locally-bundled natural-earth atlas (190 KB) |
| Graphs     | @xyflow/react (lazy-loaded)                                         |
| Tests      | Vitest + Testing Library (181 tests across 21 files)                |
| Linting    | ESLint + Prettier + husky/lint-staged                               |
| Deployment | Cloudflare Workers (wrangler deploy)                                |

---

## Repository layout

```
.
├── src/                     # React app
│   ├── pages/
│   │   ├── dfir/*.tsx       # 60+ DFIR tool pages
│   │   ├── threatintel/*.tsx # 20+ threat intel pages
│   │   └── *.tsx            # Portfolio pages (Home, About, Skills, etc.)
│   ├── components/
│   │   ├── sections/        # Hero, Contact, Featured, Skills grid, etc.
│   │   ├── dfir/            # IocResultRow, ToolGrid, BlacklistBadge, etc.
│   │   └── threatintel/     # PlatformPulse, WhatsNewBanner, etc.
│   ├── lib/dfir/            # Client-side: scoring, detection, DLP, encoding, reputation
│   ├── data/                # content, threat-actors, wiki, RSS feeds, malware engines
│   ├── hooks/               # useFocusTrap, useTheme, useScrollProgress, etc.
│   └── test/                # Test setup and integration test files
├── api/src/                 # Cloudflare Worker (Hono) API
│   ├── routes/              # IOC, domain, file, phishing, threat-map, briefings, feeds proxy
│   ├── providers/           # 24 IOC provider integrations (~50-80 LOC each)
│   └── lib/                 # DNS, RDAP, CT logs, email-auth, SSRF guard, rate-limit, etc.
├── worker/index.ts          # Worker entry: dispatches to API, serves SPA, OG meta injection
├── public/                  # Static assets (_headers, sitemap.xml, robots.txt, world map)
├── scripts/                 # Prerender, wiki extract, OG image generation
├── wrangler.jsonc           # Cloudflare Workers config
├── vitest.config.ts
└── vite.config.ts
```

---

## Local dev

```bash
npm install
npm run dev          # Vite at http://localhost:5173
npm run dev:api      # Worker at http://localhost:8787
npm test             # Vitest (181 tests)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint (max-warnings 0)
```

## Deploy

```bash
npm run deploy       # npm run build && wrangler deploy
```

Requires `wrangler login` and a Cloudflare account with the `pranithjain.qzz.io` zone (or fork and update `wrangler.jsonc` with your own zone).

## Secrets

API keys (none required for public-list providers, toolkit works with zero keys):

```bash
npx wrangler secret put VT_API_KEY              # VirusTotal
npx wrangler secret put ABUSEIPDB_API_KEY
npx wrangler secret put SHODAN_API_KEY
npx wrangler secret put CENSYS_PAT
npx wrangler secret put NETLAS_API_KEY
npx wrangler secret put OTX_API_KEY
npx wrangler secret put URLSCAN_API_KEY
npx wrangler secret put HYBRID_ANALYSIS_API_KEY
npx wrangler secret put ABUSECH_AUTH_KEY        # one key → ThreatFox + URLhaus + MalwareBazaar
npx wrangler secret put BRIEFINGS_ADMIN_TOKEN   # admin endpoints for briefing management
```

## Cost / quotas

Engineered to fit the **Cloudflare Workers free tier**:

- Provider results cached to **Cache API** (not KV) — KV daily-write quota untouched
- IOC feeds proxy uses SSRF allow-list as primary defense (not KV-based rate limiting)
- World atlas bundled locally (190 KB) — no CDN/CSP issues
- 158 static assets, 760 KiB total, 174 KiB gzipped
- Worker startup: 18ms
- 25 prerendered routes for instant first paint

## Security

- CSP/HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy headers on all responses
- SSRF guard via DNS-level public-IP validation (`assertPublicHost` + `pinnedFetch`)
- Constant-time admin token comparison (`safeEqual`)
- No hardcoded secrets — all API keys via `wrangler secret`
- HTML attribute escaping in OG meta injection (fixed canonical origin prevents cache poisoning)
- `safeErrorMessage` abstraction prevents internal detail leakage
- Rate limiting on all API endpoints (KV-backed, 30 req/min per IP)

## Accessibility

- WCAG 2.2 AA compliant: skip-to-content, focus traps, proper ARIA roles, `role="alert"` on all errors, `scope` on all table headers
- `prefers-reduced-motion` support across all animations
- All interactive elements have visible focus indicators
- `aria-label` on all icon-only buttons and `target="_blank"` links
- Screen-reader-friendly heading hierarchy
- 44×44px minimum touch targets on mobile

## Testing

```bash
npm test                          # 181 tests
npm run test:coverage             # Coverage report
npx vitest run src/lib/dfir/      # Pure-logic tests (scoring, detection, encoding, DLP)
```

## Data sources

See `src/data/rssFeeds.ts` for the RSS catalog, `api/src/providers/*` for IOC providers, and `src/data/dfir/` for curated datasets (threat actors, malware engines, wiki articles). Threat-intel data refreshes hourly server-side; briefings rebuild via daily/weekly cron.

---

## Credit / contact

Built and maintained by **Pranith Jain**. Contact via the site's Contact section or the email link in the footer.

The toolkit is opinionated about which sources are worth pulling and how to weight them. PRs that add genuinely-distinctive sources or improve scoring math are welcome.
