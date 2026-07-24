# DFIR-ThreatIntel MCP - tool catalog

**254 tools** | live at `https://pranithjain.qzz.io/api/mcp` (streamable HTTP).

## Quick start

1. Generate an API key at `/api/v1/admin/keys` (admin token required).
2. Drop one of the config snippets in this directory into your MCP client config:
   - **Claude Desktop**: `claude-desktop.json` -> `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).
   - **Cursor**: `cursor.json` -> `~/.cursor/mcp.json`.
   - **VS Code (Copilot)**: `vscode-mcp.json` -> `.vscode/mcp.json` in your workspace.
3. Replace `<your-api-key>` with a real key.
4. Restart your client. Tools appear as `mcp__dfir-threatintel__<tool_name>`.

## Tools by category

### other (156)

- `ai_threats_get` - Return the full entry body for an AI-capable threat actor — includes full brief, aliases, raw TTP markdown, reported/activity dates, and MITRE technique IDs. Use ai_threats_list first to discover slugs.
- `ai_threats_list` - List AI-capable threat actors from the Cybershujin tracker (79 entries, MIT). Each entry documents real-world confirmed use of AI/LLMs by threat actors. Filter by table (main/deepfake), category, TTP, or keyword.
- `ai_threats_stats` - Return cache + manifest stats for the AI Threat Actors data: total entries, index load state, body-cache hit ratios.
- `btc_abuse_check` - Check a Bitcoin address for abuse/scam reports on ChainAbuse. Returns report count, categories (phishing, ransomware, scam, etc.), descriptions, and associated scam types. Useful for tracing illicit crypto transactions.
- `bw_get_breach` - Return the full body of a single breach/leak claim by slug. Includes description, source URL, activity sector, and references. Use bw_list_breaches first to discover slugs.
- `bw_list_breaches` - List live breach/leak/ransomware claims from free public trackers. Filter by threat actor group, category (ransomware, data_breach, combo_list, source_code, credential_leak), severity, country, days back, or free-text keyword.
- `bw_list_groups` - List threat actor groups tracked in the Breach Watch database with their breach counts and top category. Filter by keyword or minimum count.
- `bw_stats` - Return cache + manifest stats for the Breach Watch data: breach counts, group counts, categories, and LRU body-cache hit/miss ratios.
- `campaigns_get` - Return the full details of a single threat campaign entry by slug, including writeup links, TTPs, targets, and geography. Use campaigns_list first to discover slugs.
- `campaigns_list` - List currently active threat campaigns from the curated tracker. Filter by status (active, dormant, concluded), category (ransomware, apt, malware, phishing, c2, supply-chain, cyber-espionage, hacktivism, other), or keyword.
- `campaigns_stats` - Return cache + manifest stats for the Active Campaigns tracker: total campaigns, active vs dormant/concluded breakdown, categories, and index cache status.
- `cerast_domain_search` - Search Cerast Intelligence for exposed paths and misconfigurations on observed domains. Returns domain, path, category, impact level, OpenPageRank score, version, and first-seen date. Useful for discovering staging/dev environments, exposed admin panels, and misconfigured endpoints.
- `cyber_news` - Aggregate cybersecurity news from 11 RSS feeds across 5 tiers (Advisory, Exploit, Research, Vendor, Community). Supports tier filtering and keyword search. Sources: CISA, Rapid7, Packet Storm, BleepingComputer, Hacker News, GitHub Security, ZDI, Reddit netsec/exploitdev/bugbounty.
- `db_get_brief` - Return the full daily intelligence brief for a given type and date. Includes executive summary, key findings, events/incidents, and structured data. Use db_list_briefs to discover available dates.
- `db_list_briefs` - List available daily intelligence briefs by type (cyber, deepfake, disaster). Returns dates and metadata. Use db_get_brief to retrieve the full brief body.
- `db_stats` - Return cache + manifest stats for the Daily Briefs data: index loaded, body-cache sizes and hit ratios. Useful for diagnosing cold-start latency.
- `dehash_lookup` - Look up a cryptographic hash (md5/sha1/sha256/sha384/sha512) against Dehash.lt to find its plaintext value. Useful for cracking password hashes or identifying known hash values. No API key required.
- `depx_check` - Check if a specific package is known-malicious. Queries the OpenSSF Malicious Packages database and OSV. Returns verdict (clean/malicious/unknown) with advisory details. Inspired by projectdiscovery/depx.
- `depx_feed` - Feed of recently disclosed malicious packages from the OpenSSF Malicious Packages database. Returns packages disclosed within the time window, with ecosystem breakdown and disclosure age. Inspired by projectdiscovery/depx.
- `depx_stats` - Supply-chain intelligence statistics — ecosystem breakdown, recent advisory counts, and disclosure trends from the OpenSSF Malicious Packages database.
- `dn_abuseipdb_blacklist` - Get AbuseIPDB blacklist of the most reported malicious IP addresses. Requires ABUSEIPDB_API_KEY.
- `dn_abuseipdb_check` - Check an IP address on AbuseIPDB for abuse reports: confidence score, ISP, country, report count, categories. Requires ABUSEIPDB_API_KEY.
- `dn_abuseipdb_check_block` - Check an entire CIDR network block for abuse reports on AbuseIPDB. Requires ABUSEIPDB_API_KEY.
- `dn_abuseipdb_reports` - Get individual abuse reports for an IP from AbuseIPDB with detailed comments and categories. Requires ABUSEIPDB_API_KEY.
- `dn_bazaar_hash` - Look up a malware sample in MalwareBazaar by MD5, SHA1, or SHA256 hash. Returns tags, signature, file type, first/last seen. Free, no key.
- `dn_bazaar_recent` - Get the most recently submitted malware samples from MalwareBazaar (last 100). Free, no key.
- `dn_bazaar_tag` - Search MalwareBazaar by tag or YARA signature name. Free, no key.
- `dn_greynoise_check` - Quick check: is this IP a known scanner or known benign service? Returns classification only (benign/malicious/unknown). Free, no key.
- `dn_greynoise_ip` - Look up an IP on GreyNoise Community: classification (benign/malicious/unknown), internet scanner detection, ASN, country. Free, no API key required.
- `dn_hibp_breach` - Get details of a specific data breach by name from HIBP: description, data classes, pwn count, breach date. Free, no key.
- `dn_hibp_data_classes` - List all data classes (types of compromised data) known to HIBP: emails, passwords, credit cards, SSNs, etc. Free, no key.
- `dn_hibp_latest` - Get the most recently added data breaches from HIBP. Free, no key.
- `dn_hibp_password` - Check if a password has appeared in known breaches using HIBP k-anonymity (only SHA-1 prefix sent). Returns breach count. Free, no key.
- `dn_hybrid_feed` - Get the latest malware detonation feed from Hybrid Analysis: recently analyzed samples with verdicts and threat scores. Requires HYBRID_ANALYSIS_API_KEY.
- `dn_hybrid_search` - Search Hybrid Analysis sandbox by file hash: verdict, AV detection rate, MITRE ATT&CK techniques, network indicators. Requires HYBRID_ANALYSIS_API_KEY.
- `dn_intelx_phonebook` - IntelligenceX Phonebook — find emails, domains, and URLs associated with a search term. Requires INTELX_API_KEY (paid).
- `dn_intelx_phonebook_results` - Retrieve IntelligenceX Phonebook search results by search_id. Requires INTELX_API_KEY.
- `dn_intelx_search` - Search IntelligenceX for leaked data, dark web content, paste sites, and breach archives. Requires INTELX_API_KEY (paid).
- `dn_intelx_search_results` - Retrieve results for an IntelligenceX search by search_id (from dn_intelx_search). Requires INTELX_API_KEY.
- `dn_otx_cve` - Look up threat intelligence for a CVE on AlienVault OTX: related pulses, indicators, and exploitation activity. Free, no key.
- `dn_otx_domain` - Look up threat intelligence for a domain on AlienVault OTX: pulse info, WHOIS, reputation, associated malware. Free, no key.
- `dn_otx_hash` - Look up threat intelligence for a file hash (MD5, SHA1, SHA256) on AlienVault OTX. Free, no key.
- `dn_otx_ip` - Look up threat intelligence for an IP address on AlienVault OTX: pulse info, reputation, country, ASN, associated malware. Free, no key.
- `dn_pulsedive_explore` - Explore linked indicators using Pulsedive advanced queries. Returns related IOCs with risk levels. Free, no key.
- `dn_pulsedive_indicator` - Look up an indicator (IP, domain, URL, or hash) on Pulsedive: risk level, threats, feeds, and linked indicators. Free, no key required.
- `dn_pulsedive_search` - Search Pulsedive indicators by value. Returns matching indicators with risk levels. Free, no key.
- `dn_ransomlook_groups` - List all ransomware groups tracked by RansomLook (582+). Free, no key.
- `dn_ransomlook_recent` - Fetch the most recent ransomware posts and victim claims from RansomLook. Free, no key.
- `dn_ransomware_country` - Get ransomware victims filtered by ISO 3166-1 alpha-2 country code from ransomware.live. Free, no key.
- `dn_ransomware_group` - Get a detailed profile for a specific ransomware group from ransomware.live: description, aliases, tools, TTPs, CVEs. Free, no key.
- `dn_ransomware_search` - Search ransomware victims by keyword (company name, domain, etc.) across ransomware.live. Free, no key.
- `dn_ransomware_sector` - Get ransomware victims filtered by sector/industry from ransomware.live. Free, no key.
- `dn_ransomware_victims` - Get all victims claimed by a specific ransomware group from ransomware.live. Free, no key.
- `dn_sources` - List all available darknet intel data sources with configuration status, API key status, tool counts, and free/paid indicators.
- `dn_threatfox_iocs` - Get recent IOCs from ThreatFox reported in the last N days. Free, no key.
- `dn_threatfox_malware` - Search ThreatFox IOCs by malware family using Malpedia naming. Free, no key.
- `dn_threatfox_search` - Search ThreatFox IOCs by IP, domain, hash, or URL. Free, no key.
- `dn_threatfox_tag` - Search ThreatFox IOCs by tag (e.g. Cobalt Strike, Emotet, AgentTesla). Free, no key.
- `dn_urlhaus_lookup` - Look up a URL or host in URLhaus for malware distribution. Free, no key.
- `dn_urlhaus_tag` - Search URLhaus entries by tag. Free, no key.
- `dn_vulners_exploit` - Search specifically for exploits (ExploitDB entries) on Vulners. Returns exploit code references and details. Free.
- `dn_vulners_id` - Look up a vulnerability by ID (CVE, EDB, GHSA) on Vulners. Returns CVSS, description, affected products, and exploit availability. Free, no key.
- `dn_vulners_search` - Search the Vulners vulnerability database using Lucene queries. Returns matching CVEs/exploits with CVSS scores. Free.
- `email_check_registration` - Check which platforms an email address is registered on using site-specific APIs (not just HTTP status codes). Returns rich profile metadata when available. Inspired by kaifcodec/user-scanner (MIT, 2.4k stars). Checks 20+ platforms: GitHub, GitLab, Instagram, TikTok, Etsy, Spotify, Steam, and more.
- `email_list_registration_platforms` - List all platforms available for email registration checking. Returns platform IDs, names, and categories.
- `etda_get_actor` - Return the full actor body for a single APT threat actor from the ETDA Threat Group Cards vertical. Includes names (with vendor sources), aliases, country, sponsor, motivation, description, sectors, tools, operations, counter operations, MITRE ATT&CK link, and information references. Use etda_list_actors first to discover slugs.
- `etda_get_aptmap_data` - Return a specific APTmap malware analysis data file by filename. These are frequency-distribution statistics from 29GB of PE malware samples attributed to APT groups. Use etda_list_aptmap_data first to discover available files.
- `etda_list_actors` - List APT threat actors from the ETDA Threat Group Cards vertical. 504 actors (416 APT, 54 other, 34 unknown). Filter by category, country, MITRE ATT&CK reference, or keyword. Each entry includes aliases, country, sponsor, motivation, observed period, and counts of tools/operations.
- `etda_list_aptmap_data` - List all available APTmap malware analysis data files from the AndreaCristaldi/APTmap repo. These contain frequency-distribution statistics from 29GB of PE malware samples attributed to APT groups. Includes certificates, exports, functions, hashes, imports, resources, sections, strings, xrefs, file types, and file sizes.
- `etda_list_sectors` - List all observed target sectors across the ETDA actor database. Returns the count of actors that target each sector.
- `etda_stats` - Return cache + manifest stats for the APT Actors data: index loaded, APTmap loaded, body-cache sizes and hit ratios. Useful for diagnosing cold-start latency.
- `fbi_wanted_list` - List current FBI wanted persons with pagination. No API key required.
- `fbi_wanted_search` - Search the FBI Wanted database for wanted persons by name. Returns titles, descriptions, reward amounts, and field offices. No API key required.
- `fullhunt_domain` - Discover attack surface for a domain via FullHunt: open ports, technologies, subdomains, ASN, cloud provider, and WHOIS data. Requires FULLHUNT_API_KEY secret (free at fullhunt.io).
- `fullhunt_subdomains` - Enumerate subdomains for a domain via FullHunt. Returns discovered subdomain names. Requires FULLHUNT_API_KEY secret.
- `get_cert_in_advisories` - CERT-In (Indian Computer Emergency Response Team) advisories — vendor-reported vulnerabilities affecting Indian enterprises, with severity, CVEs, products affected, and the official CIAD-YYYY-NNNN ID. Filter by CVE, year, severity, or keyword.
- `get_cross_report_graph` - Cross-report knowledge-graph snapshot. Returns the top N most-referenced nodes (IOCs, actors, malware, CVEs, techniques, campaigns) across every ingested source, with the edges that connect them. Filter by node type and time window.
- `get_detections` - Get the latest detection rules feed — Sigma, YARA, and Snort rules mapped to threat actors, malware families, and MITRE ATT&CK techniques.
- `get_feed_status` - Get the health and freshness status of all 30+ threat intelligence feed sources. Shows last update time, error rates, and data volume.
- `get_ioc_lifecycle` - Get the lifecycle data for an IOC — when it first appeared, last seen, activity trend, and decay rate. Use this to understand if an indicator is still active or dormant.
- `get_threat_pulse` - Get a global threat overview — top active threat actors, trending malware families, most exploited CVEs, and geopolitical cyber events from the past week.
- `get_trending_iocs` - Get the most active IOCs in the last 24 hours. Returns indicators with highest observation counts and scores, useful for identifying emerging threats.
- `interpol_notice_detail` - Get details of a specific INTERPOL Red Notice by entity ID. Returns full charge info, arrest warrant details, and physical description. No API key required.
- `interpol_search` - Search INTERPOL Red Notices for wanted persons by name, forename, or nationality. Returns entity IDs, charges, and issuing countries. No API key required.
- `lookup_cisa_kev` - Search the CISA Known Exploited Vulnerabilities (KEV) catalog. Filter by CVE ID, vendor, product, keyword, recency (days), or ransomware-only. Returns matching KEV entries with date_added, due_date, and ransomware status. The full catalog has 1,200+ actively-exploited vulnerabilities.
- `lookup_mitre` - Look up a MITRE ATT&CK technique by ID. Returns technique name, description, tactics, mitigations, and detection guidance.
- `mozilla_tls_scan` - Scan a domain's TLS/SSL configuration using the Mozilla TLS Observatory. Returns grade (A+ through F), protocols, cipher suites, and detected vulnerabilities. No API key required.
- `onion_lookup` - Look up metadata for a .onion address via the CIRCL AIL Project. Returns first/last seen dates, status, tags, PGP keys, certificates, open ports, page title, and associated Bitcoin addresses. No API key required.
- `opensanctions_entity` - Get detailed entity information from OpenSanctions by ID. Returns full properties, associated datasets, topics, and schema. Use after opensanctions_search to explore a specific match.
- `opensanctions_search` - Search OpenSanctions for entities (individuals, companies, vessels) flagged in sanctions lists, PEP (politically exposed persons) databases, and crime watchlists. No API key required — public rate-limited API.
- `opensanctions_stats` - Get OpenSanctions dataset statistics: total entities, datasets, countries covered, and schema counts. No API key required.
- `osint_get_portal` - Return the full details of a single OSINT portal entry by slug. Use osint_list_portals first to discover slugs.
- `osint_list_portals` - List OSINT portals and resources from the curated directory. Filter by category (threat-intel, paste-monitoring, dark-web, reputation, certificate, dns, domain, ip, hash, email, username, social-media, phone, crypto, breach, whois, forensics, misc), keyword, or free/paid status.
- `osint_stats` - Return cache + manifest stats for the OSINT Portal Directory: total portals, indexed categories, and index cache status.
- `oss_feeds_get_category` - Return all feeds in a specific category with full URLs. Use oss_feeds_list first to discover category names.
- `oss_feeds_list` - List open-source threat intel feeds from the curated catalog (145+ feeds, BSD-3-Clause). Filter by vendor, category, status, or keyword. Each entry shows vendor, description, category, and feed status.
- `oss_feeds_stats` - Return cache + manifest stats for the OSS Feed Registry: total feeds, category breakdown, status breakdown, cache state.
- `phone_osint` - Investigate a phone number — E.164 parsing, carrier/line-type detection, country lookup, messaging platform checks (WhatsApp/Telegram), breach exposure, and Google dorks. Returns structured JSON with parsed phone details, lookup URLs, and security flags.
- `poc_scan` - Search GitHub for public exploit/PoC repositories for a CVE. Returns repo URLs, star counts, language, age, and whether the repo has actual code. Bypasses GitHub 1000-result limit via monthly pagination.
- `reports_get` - Return the full details of a single report entry by slug. Use reports_list first to discover slugs.
- `reports_list` - List reports and reading resources from the curated library. Filter by category (annual-threat-report, reference, framework, standard, learning, whitepaper, research), keyword, year, or publisher.
- `reports_stats` - Return cache + manifest stats for the Reports & Reading Library: total entries, categories, and index cache status.
- `reverse_image_search` - Generate reverse image search URLs across 8+ engines (Google Lens, Yandex, TinEye, Bing, Baidu, SauceNAO, IQDB, KarmaDecay). Validates image reachability and returns categorized deep links for manual investigation.
- `soc_cve_report` - Generate a SOC CVE intelligence report. Takes a list of up to 50 CVE IDs and bundles CVE lookup + PoC scan + health check into a downloadable CSV or Markdown report. Returns executive summary, CVSS/EPSS/KEV details, PoC repos, and pipeline health.
- `stix_query_bundles` - Query the STIX 2.1 intelligence bundle store with PostgREST-style filters. Returns threat intelligence bundles matching your criteria. Use stix_translate first to convert natural language to structured filter parameters. Supports filters: source_type (eq.osint/eq.darknet), threat_actors (cs.{APT29}), malware_names, sectors, countries_target, vulnerabilities, date ranges (stix_published_at=gte.), and more. Supports select, order, limit, offset.
- `stix_query_iocs` - Query the threat intelligence IOC store with PostgREST-style filters. Returns indicators of compromise with their type, validity period, and source bundle reference. Supports filtering by ioc_type (eq.ipv4, eq.domain, eq.hash_sha256), date ranges, and source. Also supports per-type active IOC queries via ioc_type filter. Use seq_id for incremental sync.
- `stix_translate` - Translate a natural language threat intelligence question into structured STIX 2.1 query parameters. Given plain English, returns the classified intent, extracted entities, and filter parameters to use with stix_query_bundles. Supports actors, malware, CVEs, sectors, countries, campaigns, time ranges, and strategic queries.
- `tg_boolean_search` - Search Telegram leak messages with boolean AND/OR/NOT operators and field qualifiers. Fields: text, channel.title, channel.username, severity, leak_type. Supports wildcards (prefix*) and exact phrases ("quoted").
- `tg_saved_search_create` - Save a Telegram boolean search query for one-click reuse.
- `tg_saved_search_delete` - Delete a saved Telegram search query.
- `tg_saved_searches_list` - List saved Telegram boolean search queries.
- `tg_timeline` - Get Telegram message volume timeline data (messages per day) with severity breakdown. Useful for visualizing activity spikes.
- `threatmon_infostealer_search` - Search ThreatMon IntelHub for compromised credentials and infected devices linked to a domain via real stealer malware logs. Returns compromised URLs, IPs, usernames, dates, and employee/user classification. Data sourced from ~2.18B compromised users and ~10.47B leaked credentials.
- `ti_brief_sector` - Return a sector-specific threat brief (Financial, Healthcare, or Government) from the threat-intel vertical. Each brief includes an executive summary, top N sector-relevant threats with risk assessments and recommended actions.
- `ti_export_stix` - Export IOC family indicators as a STIX 2.1 bundle. Reads the IOC family body from the threat-intel manifest, converts each indicator to a STIX indicator object with pattern, and wraps in a bundle with TLP marking. Importable into OpenCTI, MISP, or any TAXII 2.1 consumer.
- `ti_get_cve` - Return the full CVE body with CVSS vector, CWE IDs, references, and (where populated) BSI description and LLM summary/recommended action. Use ti_list_cves first to discover CVE IDs.
- `ti_get_ioc` - Return the full IOC family body with indicators, MITRE techniques, context, and (where populated) LLM summary. Use ti_list_iocs first to discover family slugs.
- `ti_list_cves` - List CVEs from the threat-intel vertical (NVD + CISA KEV). CVEs are enriched with priority scoring (CVSS + KEV + recency). Filter by severity, KEV-only, vendor, recency, or keyword.
- `ti_list_iocs` - List IOC families (ransomware, malware, APT groups, C2 frameworks, stealers, phishing kits) from the threat-intel vertical, sourced from Daily-Hunt references and tracked by this Worker.
- `ti_list_kev` - Return the full CISA Known Exploited Vulnerabilities (KEV) snapshot — actively exploited CVEs with required actions and due dates. Each entry includes vendor, product, short description, required action, and due date.
- `ti_search_malwarebazaar` - Search MalwareBazaar (abuse.ch) for malware samples by tag or signature. Returns SHA-256, MD5, file name, type, malware family signature, tags, and timestamps. Tries tag search first, falls back to signature. Free API — no key required.
- `ti_search_otx` - Search AlienVault OTX for threat pulses matching a query. Returns pulse metadata (name, tags, TLP, malware families, MITRE ATT&CK IDs) and indicators for the top 5 pulses. Requires OTX_API_KEY (free at otx.alienvault.com).
- `ti_search_ransomware_live` - Search ransomware.live for ransomware group profiles. Returns group description, .onion leak-site URLs, recent victims (with country/sector), MITRE ATT&CK TTPs, and known tools. Free public API — no key required.
- `ti_search_threatfox` - Search ThreatFox (abuse.ch) for IOCs matching a search term. Returns IOC type, value, malware family, confidence, timestamps, and reporter. Free API — no key required. Useful for looking up specific IPs, domains, URLs, or hashes against ThreatCrowd's crowdsourced IOC database.
- `ti_stats` - Return cache + manifest stats for the Threat Intel data: index loaded, KEV loaded, body-cache sizes and hit ratios. Useful for diagnosing cold-start latency.
- `tools_get` - Get the full profile for a specific security tool by slug.
- `tools_list` - List security tools from the curated Tools Directory. Filter by category (recon, exploitation, post-exploitation, defense, detection, forensics, osint, c2, phishing, crypto, mobile, cloud, network, reverse-engineering, web, misc), keyword, or offensive/defensive scope.
- `tor_exit_check` - Check if a specific IP address is a known Tor exit node. Returns boolean and the queried IP.
- `tor_exit_details` - Get detailed Tor exit node information including fingerprints, published timestamps, and exit addresses. More comprehensive than the bulk exit list.
- `tor_exit_nodes` - Get current Tor exit node IP addresses from the official Tor Project bulk exit list. Useful for identifying if traffic originates from the Tor network.
- `tor_fetch_onion` - Fetch raw HTML from a .onion URL via tor2web gateway. Returns page HTML and status code. Note: uses public tor2web proxies, not a local Tor SOCKS5 daemon — for true Tor anonymity, use tor locally.
- `tor_scrape_onion` - Fetch and parse a .onion site via tor2web gateway. Returns structured data: title, links, body text, status code. Useful for extracting content from dark web sites.
- `tor_search_onion` - Search for .onion sites using the Ahmia.fi search engine. Returns matching pages with title, URL, and description. Note: Ahmia selectively indexes .onion sites; not all dark web content is discoverable.
- `tor_status` - Check the dark web access gateway status. Uses public tor2web gateways to reach .onion sites (no local Tor daemon required). Returns available gateways and method info.
- `trace_crypto_address` - Trace a cryptocurrency wallet address. Returns balance, transaction history, and associated entities from blockchain explorers.
- `traceix_lookup` - Look up a SHA-256 file hash against traceix.com (PCEF) for antivirus/reputation results. Returns per-engine verdicts (Safe/Malicious/Unknown/Failed). Powered by Perkins Fund AI. Requires TRACEIX_API_KEY secret.
- `username_generate_patterns` - Generate username variations for typosquatting detection and OSINT. Returns common patterns: leetspeak, double letters, prefix/suffix variations, dot/underscore/hyphen separators, number suffixes.
- `username_scrape_profiles` - Scrape profile metadata (display name, bio, avatar, follower counts) from platforms where the username is found. Returns rich profile data, not just found/not-found.
- `virushee_check` - Check a file hash (MD5/SHA1/SHA256) against the Virushee multi-engine AV database. Returns detection ratio and per-engine results. No API key required.
- `whoxy_reverse_whois` - Reverse WHOIS lookup via whoxy.com — find all domains associated with an email, owner name, company, or keyword. Searches 705M+ WHOIS records. Returns domain names, registrant info, and dates. Requires WHOXY_API_KEY secret.
- `wifi_investigation` - Investigate a wireless network by BSSID (MAC address) or SSID (network name). Returns OUI vendor lookup, MAC bit analysis (privacy/multicast), default SSID detection, WiGLE.net links, and security flags for rogue AP detection.
- `winreg_get_artifact` - Return the full body of a single Windows Registry forensic artifact by slug. Includes registry keys, description, forensic value, parsers, and MITRE mapping. Use winreg_list_artifacts first to discover slugs.
- `winreg_list_artifacts` - List Windows Registry forensic artifacts from the WinReg DFIR reference. Filter by category, hive, MITRE technique, or free-text keyword.
- `winreg_list_categories` - List the Windows Registry artifact categories in the WinReg DFIR reference. Returns category keys, names, descriptions, and artifact counts.
- `winreg_stats` - Return cache + manifest stats for the WinReg DFIR data: artifact counts, hive types, MITRE technique coverage, and LRU body-cache hit/miss ratios.
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

### si (39)

- `si_copilot_ask` - Ask a threat intelligence question with role-aware context. Choose your analyst persona to get answers framed for your role. Roles: ciso (strategic risk), detection (TTPs/rules), ir (IOCs/triage), cti (context/attribution). Covers any threat intel question — actors, malware, campaigns, CVEs, sectors, IOCs, trends.
- `si_copilot_roles` - List the available analyst personas for the role-aware copilot. Each role frames threat intelligence differently: ciso (risk posture, strategic, executive view), detection (TTPs, detection rules, hunting), ir (IOCs, containment, triage), cti (contextual analysis, attribution, trends).
- `si_enrich_agent` - Enrich a single IOC (IP/hash/domain/URL) using the Threat Intel Enrichment Agent. Runs a multi-step autonomous investigation across 30+ providers (VirusTotal, AbuseIPDB, Shodan, PhantomCandle, Malpedia, etc.), extracts MITRE ATT&CK TTPs, and returns a structured threat assessment with per-provider diagnostics. For deep analysis, set 'deep: true' to run the full multi-step chain with report generation (takes 10-30s).
- `si_enrich_ip` - Enrich a single IPv4/IPv6 address using the platform's IPinfo / AbuseIPDB / Shodan / Shodan-InternetDB / VPNAPI providers. Returns the same shape as upstream security-investigator/enrich_ips.py. Use si_enrich_ip_batch for up to 25 IPs in one call.
- `si_enrich_ip_batch` - Enrich up to 25 IP addresses in one call. Returns an array of the same shape as si_enrich_ip. Order is preserved. IPs that fail validation are returned with a single "validator:failed" diagnostic and empty enrichment fields.
- `si_enrich_ip_stix` - Enrich an IP address and return the results as a STIX 2.1 bundle. Combines si_enrich_ip (IPinfo/AbuseIPDB/Shodan/VPNAPI) with STIX 2.1 indicator, vulnerability, and relationship objects. The bundle is importable into OpenCTI, MISP, or any TAXII 2.1 consumer. Returns both the enrichment data and the STIX bundle.
- `si_enrich_ip_stix_batch` - Enrich up to 10 IP addresses and return all results in a single STIX 2.1 bundle. Each IP produces indicator + optional ASN + vulnerability objects. The combined bundle is importable into OpenCTI/MISP. Returns per-IP enrichment data plus the merged STIX bundle.
- `si_get_automation` - Return a scheduled-workflow definition (Copilot App / GitHub Actions) for running the skills unattended. Three automations ship: daily-threat-pulse, daily-mcp-auth-health-check, weekly-threat-intel-campaign.
- `si_get_doc` - Return the full markdown body of a single knowledge-base doc. Get slugs from si_list_docs.
- `si_get_query` - Return the full markdown body of a single KQL query (Defender XDR / Sentinel hunting query, IoC correlation, or campaign playbook). Use si_list_queries first to discover slugs.
- `si_get_ref` - Return a reference dataset by name. Get names from si_list_ref. Common: mitre-attck-enterprise (MITRE ATT&CK enterprise matrix, ~32 KB), known-kql-tables (M365 Defender table inventory, ~17 KB), m365-platform-coverage (coverage map, ~16 KB), ingestion-qN (Sentinel ingestion-scan query result schemas).
- `si_get_routing_prompt` - Return the upstream .github/copilot-instructions.md verbatim — the universal skill-detection / routing prompt. Clients should load this once at session start to learn how to map natural language to the right si_* tool. ~91 KB.
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
- `si_shiftlog_create` - SHIFTLOG: start a new SOC shift handover entry. Returns the created entry including its id (sl_...).
- `si_shiftlog_get` - SHIFTLOG: fetch a single shift handover entry by id (sl_...).
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
- `get_today_briefing` - Get today's threat intelligence briefing. A curated digest of the latest CVEs, ransomware activity, data breaches, and emerging threats from the past 24 hours. When format=markdown returns a TI Mindmap HUB-style rich formatted report.
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

- `analyze_report` - Unified per-report analyzer. Runs summary + IOC extraction (with allowlist + confidence) + MITRE ATT&CK TTP mapping + 5W context + CVE extraction + image-OCR + STIX 2.1 bundle in a single round-trip. Accepts text, URL, or both; optionally takes image URLs to OCR. When format=markdown returns a TI Mindmap HUB-style rich formatted markdown report.
- `extract_fivew` - Extract the classic 5W grid (who/what/when/where/why) from a free-text report. Single LLM call; returns structured JSON with a per-grid confidence score.
- `extract_iocs_from_image` - Fetch an image and run Workers AI vision over it to extract IOCs that are only visible in screenshots (IPs, domains, URLs, hashes, CVEs, emails). Returns the OCR text + the per-IOC confidence band.
- `extract_ttps` - Extract MITRE ATT&CK techniques from a free-text threat report. Returns technique IDs, tactic labels, confidence (high/medium/low), and the supporting evidence string. Combines a deterministic keyword scanner with an LLM pass and merges the results.
- `parse_threat_report` - Parse a threat intelligence report or article to extract structured data: IOCs (IPs, domains, URLs, hashes), threat actors, malware families, MITRE ATT&CK techniques, CVEs, targeted sectors, and an executive summary. Use this when analyzing threat reports, blog posts, or incident write-ups.

### cve (3)

- `cve_health` - Check the health of CVE data pipelines. Validates NVD API, EPSS API, CISA KEV, GitHub API rate limit, KV intel cache (EPSS coverage, KEV count, field completeness), and Exploit-DB mirror availability. Returns overall status (healthy/degraded/unhealthy) with per-check details.
- `cve_poc_map` - Get the cached CVE-to-GitHub-repo mapping. Pass ?id=CVE-XXXX-XXXXX for a single CVE, or ?year=YYYY for a year-scoped index of all mapped CVEs. Results are KV-cached for 24h.
- `lookup_cve` - Look up a CVE by ID. Returns description, CVSS score, EPSS probability, CISA KEV status, affected products, and references.

### pdns (3)

- `passive_dns_overlap` - Find IPs shared between multiple domains (infrastructure overlap detection). Useful for mapping shared malicious hosting.
- `passive_dns_query` - Query passive DNS for a domain or IP. Returns historical DNS resolutions, infrastructure migrations, and fast-flux detection. Sources: VirusTotal, URLscan, crt.sh, CIRCL.
- `passive_dns_reverse` - Reverse passive DNS lookup: find all domains that historically resolved to a given IP. Reads from accumulated D1 cache.

### search (3)

- `search_malpedia` - Search Malpedia for malware families or threat actors. Returns matching entries with descriptions and references.
- `search_triage` - Search Recorded Future Triage sandbox for malware samples by family, tag, hash, URL, or domain. Returns analysis results, behavioral reports, and extracted configs.
- `unified_search` - Cross-source search across all threat intelligence feeds. Search by keyword, IOC, actor name, malware family, or CVE to find matching entries across briefings, live feeds, ransomware data, and more.

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
