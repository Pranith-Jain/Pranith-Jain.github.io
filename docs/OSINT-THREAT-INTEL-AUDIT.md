# OSINT & Threat Intelligence Projects Audit

> Curated list of 30 open-source projects for integration into the threat intel platform.
> All projects use MIT, Apache 2.0, or other free/open licenses.
> Researched: 2026-06-12

---

## Tier 1 — High Value, Easy to Replicate (MIT/Apache, Free APIs)

| #   | Project                                                  | Stars | License    | Language   | What to Build                                                                                                            | Free API?         |
| --- | -------------------------------------------------------- | ----- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| 1   | [Web-Check](https://github.com/lissy93/web-check)        | 33.5k | MIT        | TypeScript | All-in-one domain analysis (DNS, SSL, headers, tech stack, security headers, open ports, DNS records, WHOIS, reputation) | Yes (self-hosted) |
| 2   | [Sherlock](https://github.com/sherlock-project/sherlock) | 84.9k | MIT        | Python     | Username OSINT across 300+ social networks — find accounts by username                                                   | Yes (self-hosted) |
| 3   | [Maigret](https://github.com/soxoj/maigret)              | 32.8k | MIT        | Python     | Extended username OSINT — 3000+ sites, generates PDF dossiers, async                                                     | Yes (self-hosted) |
| 4   | [dnstwist](https://github.com/elceef/dnstwist)           | 5.7k  | Apache-2.0 | Python     | Domain homograph/phishing detection — finds lookalike domains impersonating a brand                                      | Yes (self-hosted) |
| 5   | [capa](https://github.com/mandiant/capa)                 | 6.0k  | Apache-2.0 | Python     | Malware capability identification — rule-based, identifies packers, C2, evasion techniques                               | Yes (self-hosted) |
| 6   | [JA4+](https://github.com/FoxIO-LLC/ja4)                 | 2.0k  | MIT        | Rust       | Network fingerprinting (TLS, HTTP, SSH, QUIC) — client/server fingerprinting                                             | Yes (self-hosted) |

## Tier 2 — Threat Maps & Visualization

| #   | Project                                                                                     | Stars | License    | Language   | What to Build                                                | Notes                                   |
| --- | ------------------------------------------------------------------------------------------- | ----- | ---------- | ---------- | ------------------------------------------------------------ | --------------------------------------- |
| 7   | [raven](https://github.com/qeeqbox/raven)                                                   | 228   | AGPL-3.0   | JavaScript | Pure-JS cyber threat map — animated attack arcs on world map | Most production-ready JS implementation |
| 8   | [geoip-attack-map](https://github.com/MatthewClarkMay/geoip-attack-map)                     | 369   | Apache-2.0 | Python     | Norse-style live attack map — Python backend + web frontend  | Classic design, easy to fork            |
| 9   | [NorseAttack-like](https://github.com/yhdjyyzk/NorseAttack-like)                            | 49    | MIT        | JavaScript | Lightweight attack arc animation                             | Minimal, embeddable                     |
| 10  | [apt-intelligence-dashboard](https://github.com/michaelelizarov/apt-intelligence-dashboard) | 5     | MIT        | JavaScript | 864+ APT groups with interactive world map + timeline        | TypeScript-friendly                     |
| 11  | [MISP Dashboard](https://github.com/MISP/misp-dashboard)                                    | 207   | AGPL-3.0   | JavaScript | Real-time threat intel with geolocation visualization        | Official MISP companion                 |

## Tier 3 — Free API Integrations

| #   | Source                                                  | Free Tier      | What It Adds                                 | Integration Point          |
| --- | ------------------------------------------------------- | -------------- | -------------------------------------------- | -------------------------- |
| 12  | [AbuseIPDB](https://www.abuseipdb.com)                  | 1000 req/day   | IP reputation score + abuse confidence       | Enriches `ioc-check`       |
| 13  | [GreyNoise Community](https://www.greynoise.io)         | Free community | Classify IPs as benign/malicious/unknown     | Enriches `ip-geo`          |
| 14  | [URLScan.io](https://urlscan.io)                        | 100 scans/day  | URL screenshots, DOM, network, verdicts      | Enriches `phishing`        |
| 15  | [Google Safe Browsing](https://safebrowsing.google.com) | 10K req/day    | URL reputation (malware, social engineering) | Enriches `url-rep`         |
| 16  | [ZoomEye](https://www.zoomeye.org)                      | 10K req/month  | Host/port search + web fingerprinting        | Enriches `exposure`        |
| 17  | [crt.sh](https://crt.sh)                                | Unlimited      | Certificate transparency subdomains          | Enriches `cert-search`     |
| 18  | [CertStream](https://www.certstream.calidog.io)         | Free streaming | Real-time CT log notifications               | Enriches `certstream`      |
| 19  | [OTX AlienVault](https://otx.alienvault.com)            | Unlimited      | 20M+ IOCs, pulses, threat actors             | Enriches `ioc-correlation` |
| 20  | [Malpedia](https://malpedia.caad.fraunhofer.de)         | Free API       | 1000+ malware families, YARA rules           | Enriches `malpedia`        |

## Tier 4 — Platforms Worth Self-Hosting

| #   | Project                                                 | Stars | License  | Language   | What It Adds                                                                         | Effort |
| --- | ------------------------------------------------------- | ----- | -------- | ---------- | ------------------------------------------------------------------------------------ | ------ |
| 21  | [IntelOwl](https://github.com/intelowlproject/IntelOwl) | 4.6k  | AGPL-3.0 | Python     | Aggregates 100+ analyzers (VT, AbuseIPDB, Shodan, etc.) — one API for all enrichment | Medium |
| 22  | [OpenCTI](https://github.com/OpenCTI-Platform/opencti)  | 9.5k  | AGPL-3.0 | TypeScript | Full CTI platform with STIX/TAXII, graph viz, 80+ connectors                         | High   |
| 23  | [SpiderFoot](https://github.com/smicallef/spiderfoot)   | 18.1k | MIT      | Python     | OSINT automation — 200+ modules, web UI, REST API                                    | Medium |
| 24  | [MISP](https://github.com/MISP/MISP)                    | 6.4k  | AGPL-3.0 | PHP        | Industry-standard IOC sharing — REST API, feeds, correlations                        | Medium |
| 25  | [Loki](https://github.com/Neo23x0/Loki)                 | 3.8k  | GPL-3.0  | Python     | IOC + YARA scanner for incident response                                             | Low    |

## Tier 5 — Curated Data Sources

| #   | Source                                                                 | Stars | License | What It Adds                                     |
| --- | ---------------------------------------------------------------------- | ----- | ------- | ------------------------------------------------ |
| 26  | [deepdarkCTI](https://github.com/fastfire/deepdarkCTI)                 | 6.9k  | MIT     | Curated dark web CTI source list                 |
| 27  | [signature-base](https://github.com/Neo23x0/signature-base)            | 3.0k  | MIT     | YARA rules + IOC signatures                      |
| 28  | [ThreatHunter-Playbook](https://github.com/OTRF/ThreatHunter-Playbook) | 4.6k  | MIT     | Detection logic mapped to MITRE ATT&CK           |
| 29  | [ransomwatch](https://github.com/joshhighet/ransomwatch)               | 1.5k  | MIT     | Ransomware group monitoring + leak site tracking |
| 30  | [Feodo Tracker](https://feodotracker.abuse.ch)                         | —     | CC0     | Botnet C2 IPs (Dridex, Emotet, TrickBot, QakBot) |

---

## Top 5 Best ROI Implementations

### 1. Web-Check Domain Analysis (33.5k stars, MIT)

- **What**: All-in-one domain intelligence — DNS, SSL, headers, tech stack, security, open ports
- **Why**: Highest-starred project, pure TypeScript, covers 20+ checks your `domain-rep` doesn't
- **Effort**: Low — wrap existing checks into a single dashboard view
- **Cost**: Free (self-hosted)

### 2. Sherlock/Maigret Username Expansion (84.9k+32.8k stars, MIT)

- **What**: Username OSINT across 3000+ social networks
- **Why**: Triple your current social network coverage, generate PDF dossiers
- **Effort**: Low — CLI tools, wrap in API endpoint
- **Cost**: Free (self-hosted)

### 3. AbuseIPDB + GreyNoise API (Free tiers)

- **What**: IP reputation enrichment for IOC analysis
- **Why**: Immediate enrichment for your existing `ioc-check` and `ip-geo` tools
- **Effort**: Low — API calls, add to existing enrichment pipeline
- **Cost**: Free (1000 req/day AbuseIPDB, free community GreyNoise)

### 4. raven Threat Map (228 stars, AGPL)

- **What**: Production-ready JavaScript cyber threat map with animated attack arcs
- **Why**: Replace or enhance your `threat-map` with a visually stunning, performant JS implementation
- **Effort**: Medium — embed JS component, connect to your live IOC feeds
- **Cost**: Free (self-hosted)

### 5. capa Malware Analysis (6.0k stars, Apache-2.0)

- **What**: Rule-based malware capability identification
- **Why**: Complements your existing `malware-scan` with semantic analysis (packers, C2, evasion)
- **Effort**: Medium — Python tool, wrap in Worker or bridge endpoint
- **Cost**: Free (self-hosted)

---

## Implementation Priority Matrix

| Priority | Project                     | Stars       | Effort | Impact | License    |
| -------- | --------------------------- | ----------- | ------ | ------ | ---------- |
| P0       | Web-Check                   | 33.5k       | Low    | High   | MIT        |
| P0       | Sherlock/Maigret            | 84.9k+32.8k | Low    | High   | MIT        |
| P0       | AbuseIPDB + GreyNoise       | —           | Low    | High   | Free API   |
| P1       | raven threat map            | 228         | Medium | High   | AGPL       |
| P1       | capa malware analysis       | 6.0k        | Medium | High   | Apache-2.0 |
| P1       | dnstwist phishing detection | 5.7k        | Low    | Medium | Apache-2.0 |
| P2       | JA4+ fingerprinting         | 2.0k        | Medium | Medium | MIT        |
| P2       | URLScan.io integration      | —           | Low    | Medium | Free API   |
| P2       | SpiderFoot OSINT            | 18.1k       | High   | High   | MIT        |
| P2       | IntelOwl aggregation        | 4.6k        | High   | High   | AGPL       |
