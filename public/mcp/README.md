# DFIR-ThreatIntel MCP - tool catalog

**149 tools** | live at `https://pranithjain.qzz.io/api/mcp` (streamable HTTP).

## Quick start

1. Generate an API key at `/api/v1/admin/keys` (admin token required).
2. Drop one of the config snippets in this directory into your MCP client config:
   - **Claude Desktop**: `claude-desktop.json` -> `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).
   - **Cursor**: `cursor.json` -> `~/.cursor/mcp.json`.
   - **VS Code (Copilot)**: `vscode-mcp.json` -> `.vscode/mcp.json` in your workspace.
3. Replace `<your-api-key>` with a real key.
4. Restart your client. Tools appear as `mcp__dfir-threatintel__<tool_name>`.

## Tools by category

### other (52)

- `btc_abuse_check` - Check a Bitcoin address for abuse/scam reports on ChainAbuse. Returns report count, categories (phishing, ransomware, scam, etc.), descriptions, and associated scam types. Useful for tracing illicit crypto transactions.
- `cyber_news` - Aggregate cybersecurity news from 11 RSS feeds across 5 tiers (Advisory, Exploit, Research, Vendor, Community). Supports tier filtering and keyword search. Sources: CISA, Rapid7, Packet Storm, BleepingComputer, Hacker News, GitHub Security, ZDI, Reddit netsec/exploitdev/bugbounty.
- `email_check_registration` - Check which platforms an email address is registered on using site-specific APIs (not just HTTP status codes). Returns rich profile metadata when available. Inspired by kaifcodec/user-scanner (MIT, 2.4k stars). Checks 20+ platforms: GitHub, GitLab, Instagram, TikTok, Etsy, Spotify, Steam, and more.
- `email_list_registration_platforms` - List all platforms available for email registration checking. Returns platform IDs, names, and categories.
- `get_cert_in_advisories` - CERT-In (Indian Computer Emergency Response Team) advisories — vendor-reported vulnerabilities affecting Indian enterprises, with severity, CVEs, products affected, and the official CIAD-YYYY-NNNN ID. Filter by CVE, year, severity, or keyword.
- `get_cross_report_graph` - Cross-report knowledge-graph snapshot. Returns the top N most-referenced nodes (IOCs, actors, malware, CVEs, techniques, campaigns) across every ingested source, with the edges that connect them. Filter by node type and time window.
- `get_detections` - Get the latest detection rules feed — Sigma, YARA, and Snort rules mapped to threat actors, malware families, and MITRE ATT&CK techniques.
- `get_feed_status` - Get the health and freshness status of all 30+ threat intelligence feed sources. Shows last update time, error rates, and data volume.
- `get_ioc_lifecycle` - Get the lifecycle data for an IOC — when it first appeared, last seen, activity trend, and decay rate. Use this to understand if an indicator is still active or dormant.
- `get_threat_pulse` - Get a global threat overview — top active threat actors, trending malware families, most exploited CVEs, and geopolitical cyber events from the past week.
- `get_trending_iocs` - Get the most active IOCs in the last 24 hours. Returns indicators with highest observation counts and scores, useful for identifying emerging threats.
- `lookup_cisa_kev` - Search the CISA Known Exploited Vulnerabilities (KEV) catalog. Filter by CVE ID, vendor, product, keyword, recency (days), or ransomware-only. Returns matching KEV entries with date_added, due_date, and ransomware status. The full catalog has 1,200+ actively-exploited vulnerabilities.
- `lookup_mitre` - Look up a MITRE ATT&CK technique by ID. Returns technique name, description, tactics, mitigations, and detection guidance.
- `onion_lookup` - Look up metadata for a .onion address via the CIRCL AIL Project. Returns first/last seen dates, status, tags, PGP keys, certificates, open ports, page title, and associated Bitcoin addresses. No API key required.
- `phone_osint` - Investigate a phone number — E.164 parsing, carrier/line-type detection, country lookup, messaging platform checks (WhatsApp/Telegram), breach exposure, and Google dorks. Returns structured JSON with parsed phone details, lookup URLs, and security flags.
- `poc_scan` - Search GitHub for public exploit/PoC repositories for a CVE. Returns repo URLs, star counts, language, age, and whether the repo has actual code. Bypasses GitHub 1000-result limit via monthly pagination.
- `reverse_image_search` - Generate reverse image search URLs across 8+ engines (Google Lens, Yandex, TinEye, Bing, Baidu, SauceNAO, IQDB, KarmaDecay). Validates image reachability and returns categorized deep links for manual investigation.
- `soc_cve_report` - Generate a SOC CVE intelligence report. Takes a list of up to 50 CVE IDs and bundles CVE lookup + PoC scan + health check into a downloadable CSV or Markdown report. Returns executive summary, CVSS/EPSS/KEV details, PoC repos, and pipeline health.
- `tg_boolean_search` - Search Telegram leak messages with boolean AND/OR/NOT operators and field qualifiers. Fields: text, channel.title, channel.username, severity, leak_type. Supports wildcards (prefix\*) and exact phrases ("quoted").
- `tg_saved_search_create` - Save a Telegram boolean search query for one-click reuse.
- `tg_saved_search_delete` - Delete a saved Telegram search query.
- `tg_saved_searches_list` - List saved Telegram boolean search queries.
- `tg_timeline` - Get Telegram message volume timeline data (messages per day) with severity breakdown. Useful for visualizing activity spikes.
- `ti_brief_sector` - Return a sector-specific threat brief (Financial, Healthcare, or Government) from the threat-intel vertical. Each brief includes an executive summary, top N sector-relevant threats with risk assessments and recommended actions.
- `ti_get_cve` - Return the full CVE body with CVSS vector, CWE IDs, references, and (where populated) BSI description and LLM summary/recommended action. Use ti_list_cves first to discover CVE IDs.
- `ti_get_ioc` - Return the full IOC family body with indicators, MITRE techniques, context, and (where populated) LLM summary. Use ti_list_iocs first to discover family slugs.
- `ti_list_cves` - List CVEs from the threat-intel vertical (NVD + CISA KEV). CVEs are enriched with priority scoring (CVSS + KEV + recency). Filter by severity, KEV-only, vendor, recency, or keyword.
- `ti_list_iocs` - List IOC families (ransomware, malware, APT groups, C2 frameworks, stealers, phishing kits) from the threat-intel vertical, sourced from Daily-Hunt references and tracked by this Worker.
- `ti_list_kev` - Return the full CISA Known Exploited Vulnerabilities (KEV) snapshot — actively exploited CVEs with required actions and due dates. Each entry includes vendor, product, short description, required action, and due date.
- `ti_stats` - Return cache + manifest stats for the Threat Intel data: index loaded, KEV loaded, body-cache sizes and hit ratios. Useful for diagnosing cold-start latency.
- `tor_exit_check` - Check if a specific IP address is a known Tor exit node. Returns boolean and the queried IP.
- `tor_exit_details` - Get detailed Tor exit node information including fingerprints, published timestamps, and exit addresses. More comprehensive than the bulk exit list.
- `tor_exit_nodes` - Get current Tor exit node IP addresses from the official Tor Project bulk exit list. Useful for identifying if traffic originates from the Tor network.
- `tor_fetch_onion` - Fetch raw HTML from a .onion URL via tor2web gateway. Returns page HTML and status code. Note: uses public tor2web proxies, not a local Tor SOCKS5 daemon — for true Tor anonymity, use tor locally.
- `tor_scrape_onion` - Fetch and parse a .onion site via tor2web gateway. Returns structured data: title, links, body text, status code. Useful for extracting content from dark web sites.
- `tor_search_onion` - Search for .onion sites using the Ahmia.fi search engine. Returns matching pages with title, URL, and description. Note: Ahmia selectively indexes .onion sites; not all dark web content is discoverable.
- `tor_status` - Check the dark web access gateway status. Uses public tor2web gateways to reach .onion sites (no local Tor daemon required). Returns available gateways and method info.
- `trace_crypto_address` - Trace a cryptocurrency wallet address. Returns balance, transaction history, and associated entities from blockchain explorers.
- `username_generate_patterns` - Generate username variations for typosquatting detection and OSINT. Returns common patterns: leetspeak, double letters, prefix/suffix variations, dot/underscore/hyphen separators, number suffixes.
- `username_scrape_profiles` - Scrape profile metadata (display name, bio, avatar, follower counts) from platforms where the username is found. Returns rich profile data, not just found/not-found.
- `wifi_investigation` - Investigate a wireless network by BSSID (MAC address) or SSID (network name). Returns OUI vendor lookup, MAC bit analysis (privacy/multicast), default SSID detection, WiGLE.net links, and security flags for rogue AP detection.
- `ws_add_connection` - Define a relationship between two subjects in a workspace.
- `ws_add_finding` - Log a finding with source, trust score, and confidence in a workspace.
- `ws_add_subject` - Register a subject (entity) in a workspace investigation.
- `ws_create` - Create a new investigation workspace for AEAD lifecycle tracking.
- `ws_export_stix` - Export workspace indicators as STIX 2.1 bundle or flat IOC list.
- `ws_exposure` - Calculate composite exposure score (0-100) for a target based on IOC reputation, breach exposure, infrastructure, attack surface, and threat intel.
- `ws_get` - Get a workspace with all subjects, connections, findings, and timeline.
- `ws_list` - List investigation workspaces. Each workspace is a full AEAD-lifecycle case with subjects, connections, findings, and timeline.
- `ws_render_graph` - Render an ASCII box-drawing relationship graph, timeline, or risk heatmap from workspace data.
- `ws_workflow_advance` - Advance a workspace to the next AEAD phase (Acquire→Enrich→Assess→Deliver→Complete).
- `ws_workflow_summary` - Get workspace summary: phase progress, findings breakdown, recommended commands.

### si (37)

- `si_enrich_agent` - Enrich a single IOC (IP/hash/domain/URL) using the Threat Intel Enrichment Agent. Runs a multi-step autonomous investigation across 30+ providers (VirusTotal, AbuseIPDB, Shodan, PhantomCandle, Malpedia, etc.), extracts MITRE ATT&CK TTPs, and returns a structured threat assessment with per-provider diagnostics. For deep analysis, set \'deep: true\' to run the full multi-step chain with report generation (takes 10-30s).
- `si_enrich_ip` - Enrich a single IPv4/IPv6 address using the platform's IPinfo / AbuseIPDB / Shodan / Shodan-InternetDB / VPNAPI providers. Returns the same shape as upstream security-investigator/enrich_ips.py. Use si_enrich_ip_batch for up to 25 IPs in one call.
- `si_enrich_ip_batch` - Enrich up to 25 IP addresses in one call. Returns an array of the same shape as si_enrich_ip. Order is preserved. IPs that fail validation are returned with a single "validator:failed" diagnostic and empty enrichment fields.
- `si_enrich_ip_stix` - Enrich an IP address and return the results as a STIX 2.1 bundle. Combines si_enrich_ip (IPinfo/AbuseIPDB/Shodan/VPNAPI) with STIX 2.1 indicator, vulnerability, and relationship objects. The bundle is importable into OpenCTI, MISP, or any TAXII 2.1 consumer. Returns both the enrichment data and the STIX bundle.
- `si_enrich_ip_stix_batch` - Enrich up to 10 IP addresses and return all results in a single STIX 2.1 bundle. Each IP produces indicator + optional ASN + vulnerability objects. The combined bundle is importable into OpenCTI/MISP. Returns per-IP enrichment data plus the merged STIX bundle.
- `si_get_automation` - Return a scheduled-workflow definition (Copilot App / GitHub Actions) for running the skills unattended. Three automations ship: daily-threat-pulse, daily-mcp-auth-health-check, weekly-threat-intel-campaign.
- `si_get_doc` - Return the full markdown body of a single knowledge-base doc. Get slugs from si_list_docs.
- `si_get_query` - Return the full markdown body of a single KQL query (Defender XDR / Sentinel hunting query, IoC correlation, or campaign playbook). Use si_list_queries first to discover slugs.
- `si_get_ref` - Return a reference dataset by name. Get names from si_list_ref. Common: mitre-attck-enterprise (MITRE ATT&CK enterprise matrix, ~32 KB), known-kql-tables (M365 Defender table inventory, ~17 KB), m365-platform-coverage (coverage map, ~16 KB), ingestion-qN (Sentinel ingestion-scan query result schemas).
- `si_get_routing_prompt` - Return the upstream .github/copilot-instructions.md verbatim — the universal skill-detection / routing prompt. Clients should load this once at session start to learn how to map natural language to the right si\_\* tool. ~91 KB.
- `si_get_script` - Return the raw body of a PowerShell script or detection-manifest. Use si_list_scripts to discover filenames. The PowerShell scripts target Microsoft Defender XDR / Sentinel / M365 — they are NOT executable in the Worker; copy them to a PowerShell 7+ session locally to run.
- `si_get_skill` - Return the full SKILL.md body (markdown) for a single security investigation skill. Use si_list_skills first to discover slugs.
- `si_hypos_generate` - HYPOS: hypothesis engine for threat hunting. Given a free-text anomaly description and optional IOCs / environment, return ranked hypotheses with kill-chain phase, MITRE techniques, what-to-look-for signals, sample KQL, and matched SI skills.
- `si_kql_to_ah_url` - Encode a KQL query into a Defender XDR Advanced Hunting deep link. Mirrors upstream kql_to_ah_url.py: UTF-16LE → GZip → Base64url. Optionally append &tid=<tenant_id> for cross-tenant linking. Returns the URL.
- `si_list_docs` - List the 10 deep-dive knowledge-base docs from the upstream repo (Sentinel Exposure Graph guide, signinlog anomalies KQL cookbook, identity protection, honeypot investigation, ingestion cost best practices, etc). Each is a long-form markdown guide.
- `si_list_queries` - List the KQL queries shipped in this Worker (Defender XDR / Sentinel hunt library replicated from SCStelz/security-investigator, MIT). Filter by domain (cloud / email / endpoint / identity / incidents / network / threat-intelligence) or free-text keyword.
- `si_list_ref` - List the reference datasets available via si_get_ref: MITRE ATT&CK enterprise catalog, known KQL tables for the M365 platform, M365 platform coverage matrix, and the 11 Sentinel ingestion-scan query schemas.
- `si_list_scripts` - List the 5 PowerShell / detection-manifest assets that ship in the SI bundle: Deploy-CustomDetections.ps1 (batch-deploy Defender XDR rules), Invoke-MitreScan.ps1 (full MITRE coverage scanner), Invoke-IngestionScan.ps1 (Sentinel ingestion health), example-detection-manifest.json (input template), sentinel-ingestion-drilldown.md (companion guide).
- `si_list_skills` - List the security investigation skills shipped in this Worker (replicated from SCStelz/security-investigator, MIT). Each skill is a guided KQL+playbook workflow. Filter by category or free-text keyword.
- `si_osm_check` - Check whether a package, container image, repository, URL, domain, IP, or crypto wallet is flagged as malicious in the OpenSourceMalware community threat database. Covers supply-chain threats (npm, PyPI, Maven, NuGet, etc.), container registries (Docker Hub, GHCR, Quay), and attacker infrastructure (domains, IPs, wallets).
- `si_osm_latest` - Retrieve the 100 most recent verified threat reports from OpenSourceMalware for any supported ecosystem (npm, pypi, crates, nuget, maven, go, packagist, rubygems, vscode, openvsx, brew, skills) or asset type (repository, domain, wallet, ip, url, container).
- `si_parse_email_headers` - MAILSCOPE: parse raw email headers, extract the Received hop chain, compute SPF/DKIM/DMARC verdicts, and flag spoofing/impersonation patterns. Returns a 0-100 risk score.
- `si_parse_text` - PARSE-X: extract IOCs, file paths, registry keys, processes, DLLs, CVEs, MITRE techniques, hashes, emails, ports, MACs, and ASNs from raw text. Handles defang (hxxp, [.], (dot)) and Cyrillic/Greek homographs.
- `si_promptvault_categories` - PROMPTVAULT: list the valid prompt categories.
- `si_promptvault_create` - PROMPTVAULT: add a new prompt to the vault. Returns the created entry.
- `si_promptvault_get` - PROMPTVAULT: fetch a single prompt by slug. Auto-increments the download counter.
- `si_promptvault_list` - PROMPTVAULT: list community AI prompts for SOC analysts, detection engineers, and threat hunters. Filter by category, tag, or text search.
- `si_promptvault_rate` - PROMPTVAULT: rate a prompt 1-5 stars. Returns the updated entry with new rating count and average.
- `si_render_png` - Render an SVG dashboard and rasterise it to PNG (base64-encoded in the JSON response). Same manifest + data shape as si_render_svg, but the output is a portable bitmap you can embed in markdown, email, or social previews. Uses the bundled @resvg/resvg-wasm + Hanken Grotesk TTF.
- `si_render_svg` - Render an SVG dashboard from a manifest + data. Returns a self-contained <svg> string with inline styles, no external dependencies. Use si_render_svg_dashboard(slug) to get the canonical manifest for a skill, then pass its body as manifestYaml here. Supports all 14 widget types: title-banner, kpi-card, delta-kpi-card, score-card, donut-chart, stacked-bar-chart, horizontal-bar-chart, line-chart, waterfall-chart, sparkline, progress-bar, table-widget, recommendation-cards, assessment-banner, coverage-matrix. Unknown types render as a dashed warning panel.
- `si_render_svg_dashboard` - Return the SVG widget manifest (YAML) for a skill that ships one (14 of 25 skills do). The manifest declares canvas, palette, and a list of widget instances to render. Pair with si_get_skill({slug: "svg-dashboard"}) for the component-library reference. Returns {hasManifest:false,...} if the skill has no SVG manifest.
- `si_shiftlog_close` - SHIFTLOG: close a shift entry (sets ended_at to now, or to a provided ISO timestamp).
- `si_shiftlog_create` - SHIFTLOG: start a new SOC shift handover entry. Returns the created entry including its id (sl\_...).
- `si_shiftlog_get` - SHIFTLOG: fetch a single shift handover entry by id (sl\_...).
- `si_shiftlog_list` - SHIFTLOG: list recent shift handover entries. Filter by author, shift, or openOnly (excludes closed shifts).
- `si_shiftlog_update` - SHIFTLOG: patch a shift entry (notes, open cases, IOCs, escalations, endedAt).
- `si_stats` - Return cache + manifest stats for the Security Investigator data: index loaded, body-cache sizes and hit ratios. Useful for diagnosing cold-start latency.

### domain (9)

- `get_domain_certs` - Get recent certificates for a domain from Certificate Transparency logs. Shows new subdomains, certificate details, and any alerts.
- `get_domain_history` - Get the WHOIS history for a domain. Returns all historical registration snapshots, ownership changes, registrar changes, and nameserver changes over time. Essential for tracking domain ownership transfers and identifying infrastructure reuse by threat actors.
- `lookup_asn` - ASN intelligence lookup. Returns AS name, country, network ranges, RIR registration, and BGP peer info.
- `lookup_domain` - Domain intelligence lookup. Returns DNS records (A, AAAA, MX, NS, TXT, SOA), WHOIS/RDAP registration data, CT log (certificate transparency) entries, SPF/DKIM/DMARC email authentication analysis, and threat intel hits from blocklists and IOC feeds.
- `lookup_ip_geo` - Get IP geolocation, ASN, company, and privacy detection (VPN/proxy/tor/hosting). Uses IPinfo and Spur.us for anonymization detection.
- `pivot_domain` - Pivot across domains by shared registrant attributes. Find other domains owned by the same entity by matching registrant email, organization, nameservers, or registrar. Critical for mapping attacker infrastructure — if a malicious domain shares its registrant email with 50 other domains, those are likely all owned by the same threat actor.
- `search_registrant` - Search for all domains registered by a specific email address or organization name. Returns domains, registration dates, and snapshot counts. Useful for finding all infrastructure operated by a known threat actor.
- `watch_domain_ct` - Add a domain to Certificate Transparency monitoring. Alerts on new subdomains, suspicious patterns, wildcard certs, and more. Uses crt.sh for unlimited free CT log queries.
- `wayback_lookup` - Check the Wayback Machine (archive.org) for historical snapshots of a URL. Useful for tracking website changes or recovering deleted content.

### hudson (9)

- `hr_account` - Check Hudson Rock Cavalier API account status, permissions, and quota. Use to verify the API key is valid.
- `hr_assets_discovery` - Discover all compromised URLs for a domain (attack surface mapping). Returns URLs where credentials were stolen, occurrence counts, and compromise types.
- `hr_domain_overview` - Get domain compromise overview statistics from Hudson Rock — compromised employee/user counts, last compromise dates, and upload timelines. Useful for risk posture assessment.
- `hr_infection_analysis` - AI-powered infection source analysis for a specific stealer log. Returns the likely infection URL, confidence score, timeline of suspicious activity, and analyst summary. Works best with Lumma stealers.
- `hr_search_domain` - Search for domain-wide infostealer compromises via Hudson Rock Cavalier API. Returns compromised employees, users, and third-party exposures with stealer families and infection dates.
- `hr_search_email` - Search for compromised credentials by email address via Hudson Rock Cavalier API. Returns infostealer infections, stealer families, compromised URLs, and credential types (employee/user/third-party).
- `hr_search_ip` - Search for compromises by IP address or CIDR range via Hudson Rock Cavalier API. Useful for IR when you have a suspicious IP.
- `hr_search_username` - Search for compromised credentials by username via Hudson Rock Cavalier API.
- `hr_third_party_risk` - Assess third-party / supply-chain risk for a domain. Returns employee URLs, third-party service URLs, and user URLs where credentials were compromised — indicating supply chain exposure.

### intel (7)

- `get_blocklists` - Get pre-generated firewall blocklists in pfSense, iptables, and Suricata formats. Derived from aggregated threat intel feeds.
- `get_live_iocs` - Get the most recent live IOCs aggregated from 12+ providers (URLhaus, ThreatFox, AlienVault OTX, SANS ISC, etc). Items are normalized, allowlist-filtered (RFC 5737, vendor docs), and confidence-scored. Supports filtering by IOC kind.
- `get_ransomware_activity` - Get recent ransomware activity — latest victims, group activity, and leak-site posts from ransomware.live and other trackers.
- `get_relationships` - Get the relationship graph for an IOC — shows connections to threat actors, malware families, campaigns, CVEs, and other indicators.
- `get_supply_chain_attacks` - Software supply-chain compromise incidents (npm/PyPI/container/AI-agent ecosystems) from supplychainattack.org — title, status, severity, ecosystems, attack vectors, blast radius, remediation, package IOCs, and GHSA sources. Filter by ecosystem/status/severity.
- `get_today_briefing` - Get today's threat intelligence briefing. A curated digest of the latest CVEs, ransomware activity, data breaches, and emerging threats from the past 24 hours.
- `list_briefings` - List recent threat intelligence briefings (daily and weekly). Returns slug, date, type, and summary for each.

### ioc (6)

- `check_ioc` - Check reputation of an IP address, domain, URL, or file hash (MD5/SHA1/SHA256) across 30+ threat intelligence providers. Returns composite score, admiralty grade, and per-provider verdicts.
- `correlate_iocs` - Search correlated IOCs. Find relationships between indicators — shared infrastructure, overlapping campaigns, and linked threat actors.
- `ioc_watchlist_add` - Add an IOC to the watchlist for proactive alerting. Supported types: ip, domain, url, hash, cve, email. Alerts fire when the IOC appears in feeds.
- `ioc_watchlist_alerts` - List recent alerts from the IOC watchlist.
- `ioc_watchlist_list` - List all watched IOCs. Optionally filter by type.
- `ioc_watchlist_stats` - Get watchlist dashboard stats: total watches, alerts by type, webhook delivery rate.

### notebook (6)

- `notebook_add_entry` - Add a note, IOC, finding, timeline event, or artifact to a notebook.
- `notebook_create` - Create a new investigation notebook.
- `notebook_delete` - Delete a notebook and all its entries.
- `notebook_get` - Get a notebook with all its entries.
- `notebook_list` - List investigation notebooks. Each notebook is a persistent investigation session with notes, IOCs, findings, and timeline entries stored in D1.
- `notebook_update` - Update a notebook title, description, status, or severity.

### analysis (5)

- `analyze_report` - Unified per-report analyzer. Runs summary + IOC extraction (with allowlist + confidence) + MITRE ATT&CK TTP mapping + 5W context + CVE extraction + image-OCR + STIX 2.1 bundle in a single round-trip. Accepts text, URL, or both; optionally takes image URLs to OCR.
- `extract_fivew` - Extract the classic 5W grid (who/what/when/where/why) from a free-text report. Single LLM call; returns structured JSON with a per-grid confidence score.
- `extract_iocs_from_image` - Fetch an image and run Workers AI vision over it to extract IOCs that are only visible in screenshots (IPs, domains, URLs, hashes, CVEs, emails). Returns the OCR text + the per-IOC confidence band.
- `extract_ttps` - Extract MITRE ATT&CK techniques from a free-text threat report. Returns technique IDs, tactic labels, confidence (high/medium/low), and the supporting evidence string. Combines a deterministic keyword scanner with an LLM pass and merges the results.
- `parse_threat_report` - Parse a threat intelligence report or article to extract structured data: IOCs (IPs, domains, URLs, hashes), threat actors, malware families, MITRE ATT&CK techniques, CVEs, targeted sectors, and an executive summary. Use this when analyzing threat reports, blog posts, or incident write-ups.

### search (4)

- `search_malpedia` - Search Malpedia for malware families or threat actors. Returns matching entries with descriptions and references.
- `search_malware` - Search for malware families. Returns family info, YARA rules, samples, and references from Malpedia.
- `search_triage` - Search Recorded Future Triage sandbox for malware samples by family, tag, hash, URL, or domain. Returns analysis results, behavioral reports, and extracted configs.
- `unified_search` - Cross-source search across all threat intelligence feeds. Search by keyword, IOC, actor name, malware family, or CVE to find matching entries across briefings, live feeds, ransomware data, and more.

### cve (3)

- `cve_health` - Check the health of CVE data pipelines. Validates NVD API, EPSS API, CISA KEV, GitHub API rate limit, KV intel cache (EPSS coverage, KEV count, field completeness), and Exploit-DB mirror availability. Returns overall status (healthy/degraded/unhealthy) with per-check details.
- `cve_poc_map` - Get the cached CVE-to-GitHub-repo mapping. Pass ?id=CVE-XXXX-XXXXX for a single CVE, or ?year=YYYY for a year-scoped index of all mapped CVEs. Results are KV-cached for 24h.
- `lookup_cve` - Look up a CVE by ID. Returns description, CVSS score, EPSS probability, CISA KEV status, affected products, and references.

### pdns (3)

- `passive_dns_overlap` - Find IPs shared between multiple domains (infrastructure overlap detection). Useful for mapping shared malicious hosting.
- `passive_dns_query` - Query passive DNS for a domain or IP. Returns historical DNS resolutions, infrastructure migrations, and fast-flux detection. Sources: VirusTotal, URLscan, crt.sh, CIRCL.
- `passive_dns_reverse` - Reverse passive DNS lookup: find all domains that historically resolved to a given IP. Reads from accumulated D1 cache.

### phishing (2)

- `analyze_phishing_email` - Analyze raw email source for phishing indicators. Parses headers, checks SPF/DKIM/DMARC, extracts URLs, and computes a risk score with flags.
- `analyze_phishing_url` - Analyze a URL for phishing indicators. Checks against PhishTank, OpenPhish, URLhaus, and performs visual similarity analysis.

### detection (2)

- `generate_yara_rule` - Generate a YARA detection rule using AI. Provide a description of what to detect, and optionally known strings, malware family name, and target file type. Returns a syntactically valid YARA rule with metadata.
- `validate_yara_rule` - Validate a YARA rule syntax. Checks for balanced braces, required sections, and proper string definitions.

### breach (1)

- `check_breach` - Check if an email address or domain has been exposed in known data breaches. Returns breach names, dates, and exposed data types.

### actor (1)

- `enrich_actor` - Get a threat actor profile. Returns aliases, country attribution, MITRE ATT&CK techniques, known campaigns, and associated malware families.

### osint (1)

- `google_dorks` - Generate and execute Google dork queries for a domain. Useful for finding exposed files, login pages, and sensitive information.

### exposure (1)

- `scan_website` - Scan a website for security issues — checks security headers, SSL certificate, technologies, and potential vulnerabilities.

## Machine-readable

Full manifest with per-tool metadata: `mcp-manifest.json` at the site root.
