# DFIR-ThreatIntel MCP - tool catalog

**99 tools** | live at `https://pranithjain.qzz.io/api/mcp` (streamable HTTP).

## Quick start

1. Generate an API key at `/api/v1/admin/keys` (admin token required).
2. Drop one of the config snippets in this directory into your MCP client config:
   - **Claude Desktop**: `claude-desktop.json` -> `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).
   - **Cursor**: `cursor.json` -> `~/.cursor/mcp.json`.
   - **VS Code (Copilot)**: `vscode-mcp.json` -> `.vscode/mcp.json` in your workspace.
3. Replace `<your-api-key>` with a real key.
4. Restart your client. Tools appear as `mcp__dfir-threatintel__<tool_name>`.

## Tools by category

### si (32)

- `si_enrich_ip` - Enrich a single IPv4/IPv6 address using the platform's IPinfo / AbuseIPDB / Shodan / Shodan-InternetDB / VPNAPI providers. Returns the same shape as upstream security-investigator/enrich_ips.py. Use si_enrich_ip_batch for up to 25 IPs in one call.
- `si_enrich_ip_batch` - Enrich up to 25 IP addresses in one call. Returns an array of the same shape as si_enrich_ip. Order is preserved. IPs that fail validation are returned with a single "validator:failed" diagnostic and empty enrichment fields.
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

### other (9)

- `get_cert_in_advisories` - CERT-In (Indian Computer Emergency Response Team) advisories — vendor-reported vulnerabilities affecting Indian enterprises, with severity, CVEs, products affected, and the official CIAD-YYYY-NNNN ID. Filter by CVE, year, severity, or keyword.
- `get_cross_report_graph` - Cross-report knowledge-graph snapshot. Returns the top N most-referenced nodes (IOCs, actors, malware, CVEs, techniques, campaigns) across every ingested source, with the edges that connect them. Filter by node type and time window.
- `get_detections` - Get the latest detection rules feed — Sigma, YARA, and Snort rules mapped to threat actors, malware families, and MITRE ATT&CK techniques.
- `get_feed_status` - Get the health and freshness status of all 30+ threat intelligence feed sources. Shows last update time, error rates, and data volume.
- `get_ioc_lifecycle` - Get the lifecycle data for an IOC — when it first appeared, last seen, activity trend, and decay rate. Use this to understand if an indicator is still active or dormant.
- `get_threat_pulse` - Get a global threat overview — top active threat actors, trending malware families, most exploited CVEs, and geopolitical cyber events from the past week.
- `get_trending_iocs` - Get the most active IOCs in the last 24 hours. Returns indicators with highest observation counts and scores, useful for identifying emerging threats.
- `lookup_mitre` - Look up a MITRE ATT&CK technique by ID. Returns technique name, description, tactics, mitigations, and detection guidance.
- `trace_crypto_address` - Trace a cryptocurrency wallet address. Returns balance, transaction history, and associated entities from blockchain explorers.

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
- `get_live_iocs` - Get the latest live IOC feed — real-time indicators of compromise aggregated from 20+ sources including blocklists, tweet feeds, abuse.ch, and community submissions.
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

### cve (1)

- `lookup_cve` - Look up a CVE by ID. Returns description, CVSS score, EPSS probability, CISA KEV status, affected products, and references.

### exposure (1)

- `scan_website` - Scan a website for security issues — checks security headers, SSL certificate, technologies, and potential vulnerabilities.

## Machine-readable

Full manifest with per-tool metadata: `mcp-manifest.json` at the site root.
