import { injectScriptNonce } from './csp';
import { getOrInjectOg, injectOgMeta } from './og-rewriter';
import type { Env } from './env';

/**
 * Set of routes that have been prerendered to static HTML during the build
 * (see scripts/prerender.mjs). For these routes the Worker serves the
 * prerendered file directly so users see real content before React parses;
 * the SPA shell is reserved for fallback / unknown routes.
 *
 * Cloudflare Assets canonicalizes `*.html` paths by redirecting to the
 * extension-less form (e.g. /foo.html → 307 /foo). env.ASSETS.fetch()
 * returns the redirect verbatim and our code doesn't follow it, so we
 * have to ask for the canonical (extension-less) URL directly. The
 * file is still at __prerendered/<slug>.html on disk.
 *
 * Slug rule (must match scripts/prerender.mjs): '/' → 'home',
 * '/dfir/diamond' → 'dfir__diamond' (slashes replaced with double
 * underscore to avoid creating nested directories).
 */
const PRERENDERED_ROUTES = new Map<string, string>([
  // ── Portfolio ─────────────────────────────────────────────────
  ['/', '/__prerendered/home'],
  ['/about', '/__prerendered/about'],
  ['/skills', '/__prerendered/skills'],
  ['/experience', '/__prerendered/experience'],
  ['/projects', '/__prerendered/projects'],
  ['/daily-briefs', '/__prerendered/daily-briefs'],
  ['/blog', '/__prerendered/blog'],

  // ── Landings ──────────────────────────────────────────────────
  ['/dfir', '/__prerendered/dfir'],
  ['/threatintel', '/__prerendered/threatintel'],
  ['/radar', '/__prerendered/radar'],
  ['/threatintel/catalog', '/__prerendered/threatintel__catalog'],
  ['/threatintel/actors/hub', '/__prerendered/threatintel__actors__hub'],
  ['/threatintel/actors/attribution', '/__prerendered/threatintel__actors__attribution'],
  ['/threatintel/campaigns/active', '/__prerendered/threatintel__campaigns__active'],
  ['/threatintel/campaigns/lifecycle', '/__prerendered/threatintel__campaigns__lifecycle'],
  ['/threatintel/campaigns/generator', '/__prerendered/threatintel__campaigns__generator'],
  ['/threatintel/campaigns/cross', '/__prerendered/threatintel__campaigns__cross'],
  ['/threatintel/campaigns/reference', '/__prerendered/threatintel__campaigns__reference'],
  ['/threatintel/breach-hub', '/__prerendered/threatintel__breach-hub'],
  ['/threatintel/darkweb/watch', '/__prerendered/threatintel__darkweb__watch'],
  ['/threatintel/darkweb/markets', '/__prerendered/threatintel__darkweb__markets'],
  ['/threatintel/darkweb/deepdark', '/__prerendered/threatintel__darkweb__deepdark'],
  ['/threatintel/darkweb/crime', '/__prerendered/threatintel__darkweb__crime'],
  ['/threatintel/darkweb/bitcoin', '/__prerendered/threatintel__darkweb__bitcoin'],
  ['/threatintel/darkweb/infostealer', '/__prerendered/threatintel__darkweb__infostealer'],
  ['/threatintel/darkweb/leaks', '/__prerendered/threatintel__darkweb__leaks'],
  ['/threatintel/ransomware-hub', '/__prerendered/threatintel__ransomware-hub'],
  ['/threatintel/darkweb/recon', '/__prerendered/threatintel__darkweb__recon'],
  ['/threatintel/predictive/dashboard', '/__prerendered/threatintel__predictive__dashboard'],
  ['/threatintel/predictive/global-pulse', '/__prerendered/threatintel__predictive__global-pulse'],
  ['/threatintel/predictive/threat-pulse', '/__prerendered/threatintel__predictive__threat-pulse'],
  ['/threatintel/predictive/certstream', '/__prerendered/threatintel__predictive__certstream'],
  ['/threatintel/predictive/pir', '/__prerendered/threatintel__predictive__pir'],
  ['/threatintel/predictive/metrics', '/__prerendered/threatintel__predictive__metrics'],
  ['/threatintel/predictive/predictions', '/__prerendered/threatintel__predictive__predictions'],
  ['/threatintel/predictive/predictive', '/__prerendered/threatintel__predictive__predictive'],
  ['/threatintel/predictive/analyze', '/__prerendered/threatintel__predictive__analyze'],
  ['/threatintel/predictive/assessments', '/__prerendered/threatintel__predictive__assessments'],
  ['/threatintel/predictive/observe', '/__prerendered/threatintel__predictive__observe'],
  ['/threatintel/detections/detections', '/__prerendered/threatintel__detections__detections'],
  ['/threatintel/detections/disarm', '/__prerendered/threatintel__detections__disarm'],
  ['/threatintel/detections/yara', '/__prerendered/threatintel__detections__yara'],
  ['/threatintel/detections/signal', '/__prerendered/threatintel__detections__signal'],
  ['/threatintel/detection-wiki', '/__prerendered/threatintel__detection-wiki'],
  ['/threatintel/phishing/phish', '/__prerendered/threatintel__phishing__phish'],
  ['/threatintel/phishing/urls', '/__prerendered/threatintel__phishing__urls'],
  ['/threatintel/phishing/scam', '/__prerendered/threatintel__phishing__scam'],
  ['/threatintel/supply-chain', '/__prerendered/threatintel__supply-chain'],
  ['/threatintel/external/external', '/__prerendered/threatintel__external__external'],
  ['/threatintel/entity-graph', '/__prerendered/threatintel__entity-graph'],
  ['/threatintel/external/awesome', '/__prerendered/threatintel__external__awesome'],
  ['/threatintel/feeds/catalog', '/__prerendered/threatintel__feeds__catalog'],
  ['/threatintel/feeds/sources', '/__prerendered/threatintel__feeds__sources'],
  ['/threatintel/feeds/quality', '/__prerendered/threatintel__feeds__quality'],
  ['/threatintel/feeds/scheduler', '/__prerendered/threatintel__feeds__scheduler'],
  ['/threatintel/feeds/threatfeeds', '/__prerendered/threatintel__feeds__threatfeeds'],
  ['/threatintel/feeds/mythreatintel', '/__prerendered/threatintel__feeds__mythreatintel'],
  ['/threatintel/infra/cloud', '/__prerendered/threatintel__infra__cloud'],
  ['/threatintel/infra/infra', '/__prerendered/threatintel__infra__infra'],
  ['/threatintel/infra/webamon', '/__prerendered/threatintel__infra__webamon'],
  ['/threatintel/infra/domain', '/__prerendered/threatintel__infra__domain'],
  ['/threatintel/iocs/live', '/__prerendered/threatintel__iocs__live'],
  ['/threatintel/iocs/enrichment', '/__prerendered/threatintel__iocs__enrichment'],
  ['/threatintel/iocs/feeds', '/__prerendered/threatintel__iocs__feeds'],
  ['/threatintel/iocs/entity', '/__prerendered/threatintel__iocs__entity'],
  ['/threatintel/iocs/c2', '/__prerendered/threatintel__iocs__c2'],
  ['/threatintel/iocs/map', '/__prerendered/threatintel__iocs__map'],
  ['/threatintel/iocs/cross', '/__prerendered/threatintel__iocs__cross'],
  ['/threatintel/iocs/correlation', '/__prerendered/threatintel__iocs__correlation'],
  ['/threatintel/iocs/aggregated', '/__prerendered/threatintel__iocs__aggregated'],
  ['/threatintel/iocs/observable', '/__prerendered/threatintel__iocs__observable'],
  ['/threatintel/wiki/wiki', '/__prerendered/threatintel__wiki__wiki'],
  ['/threatintel/wiki/mitre', '/__prerendered/threatintel__wiki__mitre'],
  ['/threatintel/wiki/f3ead', '/__prerendered/threatintel__wiki__f3ead'],
  ['/threatintel/wiki/f2t2ea', '/__prerendered/threatintel__wiki__f2t2ea'],
  ['/threatintel/wiki/ooda', '/__prerendered/threatintel__wiki__ooda'],
  ['/threatintel/wiki/kill-chain-v2', '/__prerendered/threatintel__wiki__kill-chain-v2'],
  ['/threatintel/wiki/unified-kill-chain', '/__prerendered/threatintel__wiki__unified-kill-chain'],
  ['/threatintel/wiki/insider', '/__prerendered/threatintel__wiki__insider'],
  ['/threatintel/wiki/owasp', '/__prerendered/threatintel__wiki__owasp'],
  ['/threatintel/wiki/llm', '/__prerendered/threatintel__wiki__llm'],
  ['/threatintel/malware/iocs', '/__prerendered/threatintel__malware__iocs'],
  ['/threatintel/malware/vault', '/__prerendered/threatintel__malware__vault'],
  ['/threatintel/malware/sandbox', '/__prerendered/threatintel__malware__sandbox'],
  ['/threatintel/malware/malpedia', '/__prerendered/threatintel__malware__malpedia'],
  ['/threatintel/malware/maltrail', '/__prerendered/threatintel__malware__maltrail'],
  ['/threatintel/osint/framework', '/__prerendered/threatintel__osint__framework'],
  ['/threatintel/osint/cli', '/__prerendered/threatintel__osint__cli'],
  ['/threatintel/osint/map', '/__prerendered/threatintel__osint__map'],
  ['/threatintel/osint/certs', '/__prerendered/threatintel__osint__certs'],
  ['/threatintel/osint/toolbox', '/__prerendered/threatintel__osint__toolbox'],
  ['/threatintel/osint/secops', '/__prerendered/threatintel__osint__secops'],
  ['/threatintel/osint/directory', '/__prerendered/threatintel__osint__directory'],
  ['/threatintel/research-hub/research', '/__prerendered/threatintel__research-hub__research'],
  ['/threatintel/research-hub/reports', '/__prerendered/threatintel__research-hub__reports'],
  ['/threatintel/research-hub/ai', '/__prerendered/threatintel__research-hub__ai'],
  ['/threatintel/research-hub/agentic', '/__prerendered/threatintel__research-hub__agentic'],
  ['/threatintel/research-hub/writeups', '/__prerendered/threatintel__research-hub__writeups'],
  ['/threatintel/research-hub/signal', '/__prerendered/threatintel__research-hub__signal'],
  ['/threatintel/research-hub/redhunt', '/__prerendered/threatintel__research-hub__redhunt'],
  ['/threatintel/research-hub/redhunt-labs', '/__prerendered/threatintel__research-hub__redhunt-labs'],
  ['/threatintel/research-hub/volexity', '/__prerendered/threatintel__research-hub__volexity'],
  ['/threatintel/research-hub/post', '/__prerendered/threatintel__research-hub__post'],
  ['/threatintel/research-hub/attack-flow', '/__prerendered/threatintel__research-hub__attack-flow'],
  ['/threatintel/research-hub/knowledge', '/__prerendered/threatintel__research-hub__knowledge'],
  ['/threatintel/research-hub/ach', '/__prerendered/threatintel__research-hub__ach'],
  ['/threatintel/research-hub/library', '/__prerendered/threatintel__research-hub__library'],
  ['/threatintel/social/firehose', '/__prerendered/threatintel__social__firehose'],
  ['/threatintel/social/news', '/__prerendered/threatintel__social__news'],
  ['/threatintel/social/crypto-scam', '/__prerendered/threatintel__social__crypto-scam'],
  ['/threatintel/social/x-hub', '/__prerendered/threatintel__social__x-hub'],
  ['/threatintel/tools/copilot', '/__prerendered/threatintel__tools__copilot'],
  ['/threatintel/tools/mcp', '/__prerendered/threatintel__tools__mcp'],
  ['/threatintel/tools/misp', '/__prerendered/threatintel__tools__misp'],
  ['/threatintel/tools/stix-hub', '/__prerendered/threatintel__tools__stix-hub'],
  ['/threatintel/investigation-suite', '/__prerendered/threatintel__investigation-suite'],
  ['/threatintel/tools/tg-intel-search', '/__prerendered/threatintel__tools__tg-intel-search'],
  ['/threatintel/tools/socradar-tools', '/__prerendered/threatintel__tools__socradar-tools'],
  ['/threatintel/tools/settings', '/__prerendered/threatintel__tools__settings'],
  ['/threatintel/tools/directory', '/__prerendered/threatintel__tools__directory'],
  ['/threatintel/tools/darknet-intel', '/__prerendered/threatintel__tools__darknet-intel'],
  ['/threatintel/tools/unified-search', '/__prerendered/threatintel__tools__unified-search'],
  ['/threatintel/vera', '/__prerendered/threatintel__vera'],
  ['/threatintel/cves/cves', '/__prerendered/threatintel__cves__cves'],
  ['/threatintel/cves/advisories', '/__prerendered/threatintel__cves__advisories'],
  ['/threatintel/cves/resources', '/__prerendered/threatintel__cves__resources'],
  // ── DFIR: static catalogs & education ─────────────────────────
  ['/dfir/diamond', '/__prerendered/dfir__diamond'],
  ['/dfir/owasp', '/__prerendered/dfir__owasp'],
  ['/dfir/lolbins', '/__prerendered/dfir__lolbins'],
  ['/dfir/kill-chain', '/__prerendered/dfir__kill-chain'],
  ['/dfir/grc', '/__prerendered/dfir__grc'],
  ['/dfir/data-classification', '/__prerendered/dfir__data-classification'],
  ['/dfir/privacy-hub', '/__prerendered/dfir__privacy-hub'],

  // ── DFIR: utilities & decoders ────────────────────────────────
  ['/dfir/timestamp', '/__prerendered/dfir__timestamp'],
  ['/dfir/hash-calc', '/__prerendered/dfir__hash-calc'],
  ['/dfir/codec', '/__prerendered/dfir__codec'],
  ['/dfir/punycode', '/__prerendered/dfir__punycode'],
  ['/dfir/brand-impersonation', '/__prerendered/dfir__brand-impersonation'],

  // ── DFIR: image / media ───────────────────────────────────────
  ['/dfir/image-intel', '/__prerendered/dfir__image-intel'],
  ['/dfir/exif', '/__prerendered/dfir__exif'],

  // ── DFIR: file format analyzers ───────────────────────────────
  ['/dfir/plist-protobuf', '/__prerendered/dfir__plist-protobuf'],
  ['/dfir/pcap-triage', '/__prerendered/dfir__pcap-triage'],
  ['/dfir/registry-hive', '/__prerendered/dfir__registry-hive'],
  ['/dfir/evtx', '/__prerendered/dfir__evtx'],
  ['/dfir/sqlite', '/__prerendered/dfir__sqlite'],
  ['/dfir/ios-backup', '/__prerendered/dfir__ios-backup'],
  ['/dfir/apk-analyzer', '/__prerendered/dfir__apk-analyzer'],

  // ── DFIR: binary / log analyzers ──────────────────────────────
  ['/dfir/web-log', '/__prerendered/dfir__web-log'],
  ['/dfir/prefetch', '/__prerendered/dfir__prefetch'],
  ['/dfir/powershell-deobf', '/__prerendered/dfir__powershell-deobf'],

  // ── DFIR: detection & analysis ────────────────────────────────
  ['/dfir/rule-converter', '/__prerendered/dfir__rule-converter'],
  ['/dfir/prompt-injection', '/__prerendered/dfir__prompt-injection'],
  ['/dfir/pi-taxonomy', '/__prerendered/dfir__pi-taxonomy'],
  ['/dfir/mcp-audit', '/__prerendered/dfir__mcp-audit'],
  ['/dfir/cve-prioritizer', '/__prerendered/dfir__cve-prioritizer'],
  ['/dfir/fusion-exposure', '/__prerendered/dfir__fusion-exposure'],
  ['/dfir/risk-register', '/__prerendered/dfir__risk-register'],
  ['/dfir/attack-path', '/__prerendered/dfir__attack-path'],
  ['/dfir/grc-evidence', '/__prerendered/dfir__grc-evidence'],
  ['/dfir/vulnerability-ops', '/__prerendered/dfir__vulnerability-ops'],
  ['/dfir/ransomware-quant', '/__prerendered/dfir__ransomware-quant'],
  ['/dfir/patch-task-mgr', '/__prerendered/dfir__patch-task-mgr'],
  ['/dfir/soc-automation', '/__prerendered/dfir__soc-automation'],

  // ── DFIR: cloud security ──────────────────────────────────────
  ['/dfir/iam-hub', '/__prerendered/dfir__iam-hub'],
  ['/dfir/sg-analyzer', '/__prerendered/dfir__sg-analyzer'],
  ['/dfir/cloudtrail-triage', '/__prerendered/dfir__cloudtrail-triage'],
  ['/dfir/terraform-scan', '/__prerendered/dfir__terraform-scan'],

  // ── DFIR: API security ────────────────────────────────────────
  ['/dfir/openapi-audit', '/__prerendered/dfir__openapi-audit'],
  ['/dfir/secret-scan', '/__prerendered/dfir__secret-scan'],
  ['/dfir/medusa-scan', '/__prerendered/dfir__medusa-scan'],
  ['/dfir/graphql-audit', '/__prerendered/dfir__graphql-audit'],
  ['/dfir/osv-scan', '/__prerendered/dfir__osv-scan'],

  // ── DFIR: STIX ────────────────────────────────────────────────
  // ── DFIR: catalog + per-hub category landings (2026-06-17) ───
  // ── DFIR: catalog + per-hub category landings (2026-06-17) ───
  ['/dfir/catalog', '/__prerendered/dfir__catalog'],
  ['/dfir/threat-graph', '/__prerendered/dfir__threat-graph'],
  ['/dfir/ir-playbooks', '/__prerendered/dfir__ir-playbooks'],
  ['/dfir/stealer-parser', '/__prerendered/dfir__stealer-parser'],

  // ── DFIR: security frameworks ─────────────────────────────────
  ['/dfir/nhi', '/__prerendered/dfir__nhi'],
  ['/dfir/jwt', '/__prerendered/dfir__jwt'],
  ['/dfir/zero-trust-ai-agents', '/__prerendered/dfir__zero-trust-ai-agents'],

  // ── DFIR: dark web workbench ──────────────────────────────────
  ['/dfir/pgp-tool', '/__prerendered/dfir__pgp-tool'],

  // ── DFIR: investigator workbenches ────────────────────────────
  ['/dfir/domain-investigator', '/__prerendered/dfir__domain-investigator'],
  ['/dfir/ioc-investigate', '/__prerendered/dfir__ioc-investigate'],
  ['/dfir/username-investigator', '/__prerendered/dfir__username-investigator'],
  ['/dfir/yara-workbench', '/__prerendered/dfir__yara-workbench'],
  ['/dfir/stix-workbench', '/__prerendered/dfir__stix-workbench'],
  ['/dfir/malware-analyzer', '/__prerendered/dfir__malware-analyzer'],

  // ── DFIR: specialist tools ───────────────────────────────────
  ['/dfir/attack-navigator', '/__prerendered/dfir__attack-navigator'],
  ['/dfir/vuln-toolkit', '/__prerendered/dfir__vuln-toolkit'],
  ['/dfir/sec-headers-live', '/__prerendered/dfir__sec-headers-live'],
  ['/dfir/osint-mapper', '/__prerendered/dfir__osint-mapper'],
  ['/dfir/notebooks', '/__prerendered/dfir__notebooks'],

  // ── DFIR: triage & forensic tools ────────────────────────────
  ['/dfir/dnscope', '/__prerendered/dfir__dnscope'],
  ['/dfir/tracerules', '/__prerendered/dfir__tracerules'],
  ['/dfir/phone-hub', '/__prerendered/dfir__phone-hub'],
  ['/dfir/infostealer-intel', '/__prerendered/dfir__infostealer-intel'],

  // ── DFIR: AI agent tools ─────────────────────────────────────
  ['/dfir/agent-suite', '/__prerendered/dfir__agent-suite'],

  // ── DFIR: tools that fetch /api/v1/* on mount ─────────────────
  ['/dfir/phishing', '/__prerendered/dfir__phishing'],
  ['/dfir/whois-history', '/__prerendered/dfir__whois-history'],
  ['/dfir/passive-dns', '/__prerendered/dfir__passive-dns'],
  // /dfir/sql-workspace removed: the page (SqlWorkspace.tsx) has no route in
  // App.tsx, so this mapped to a prerender that was never generated — it was
  // served as the bare SPA shell, cached 24h as "prerendered".
  ['/dfir/open-directory', '/__prerendered/dfir__open-directory'],
  ['/dfir/exposure', '/__prerendered/dfir__exposure'],
  ['/dfir/exposed-host', '/__prerendered/dfir__exposed-host'],
  ['/dfir/cve', '/__prerendered/dfir__cve'],
  ['/dfir/cert-search', '/__prerendered/dfir__cert-search'],
  ['/dfir/asn', '/__prerendered/dfir__asn'],
  ['/dfir/breach', '/__prerendered/dfir__breach'],
  ['/dfir/url-preview', '/__prerendered/dfir__url-preview'],
  ['/dfir/subdomain-takeover', '/__prerendered/dfir__subdomain-takeover'],
  ['/dfir/extract', '/__prerendered/dfir__extract'],
  ['/dfir/google-dorks', '/__prerendered/dfir__google-dorks'],
  ['/dfir/linux-triage', '/__prerendered/dfir__linux-triage'],
  ['/dfir/email-defense', '/__prerendered/dfir__email-defense'],
  ['/dfir/dmarc-analyzer', '/__prerendered/dfir__dmarc-analyzer'],
  ['/dfir/dlp-scan', '/__prerendered/dfir__dlp-scan'],
  ['/dfir/wayback', '/__prerendered/dfir__wayback'],
  ['/dfir/log-parser', '/__prerendered/dfir__log-parser'],
  ['/dfir/socmint', '/__prerendered/dfir__socmint'],
  ['/dfir/eml', '/__prerendered/dfir__eml'],
  ['/dfir/email-rep', '/__prerendered/dfir__email-rep'],
  ['/dfir/email-osnit', '/__prerendered/dfir__email-osnit'],

  // ── ThreatIntel: static catalogs ──────────────────────────────
  ['/threatintel/most-wanted', '/__prerendered/threatintel__most-wanted'],
  ['/threatintel/apt-tracker', '/__prerendered/threatintel__apt-tracker'],
  ['/threatintel/extremists', '/__prerendered/threatintel__extremists'],
  ['/threatintel/predators', '/__prerendered/threatintel__predators'],
  // '/threatintel/briefings' removed from PRERENDERED_ROUTES: list is
  // data-driven (fetches /api/v1/briefings/list on mount). Prerendering
  // the empty initial state causes a React 18 hydration mismatch that
  // leaves the stale SSR'd list visible. Same root cause as the detail-
  // page fix above (DYNAMIC_ROUTE_FALLBACKS).

  // ── ThreatIntel: pages ────────────────────────────────────────
  ['/threatintel/about', '/__prerendered/threatintel__about'],
  ['/threatintel/mcp-search', '/__prerendered/threatintel__mcp-search'],
  ['/threatintel/live-center', '/__prerendered/threatintel__live-center'],
  ['/threatintel/telegram', '/__prerendered/threatintel__telegram'],
  ['/threatintel/source-health', '/__prerendered/threatintel__source-health'],
  ['/threatintel/soc-dashboard', '/__prerendered/threatintel__soc-dashboard'],

  // ── ThreatIntel: live-feed surfaces ───────────────────────────
  // '/threatintel/reddit' removed — redirect route, prerender is empty shell
  // '/threatintel/status' removed — redirect route, prerender is empty shell
  // '/threatintel/metrics' removed — redirect route, prerender is empty shell

  ['/threatintel/ransomware-live', '/__prerendered/threatintel__ransomware-live'],
  ['/threatintel/cyberpulse', '/__prerendered/threatintel__cyberpulse'],
  ['/threatintel/onion-watch', '/__prerendered/threatintel__onion-watch'],

  // ── Daily Briefs ────────────────────────────────────────────────
  ['/daily-briefs', '/__prerendered/daily-briefs'],

  // ── Phase 4 (2026-06-04): 43 real static routes that existed in App.tsx
  //    but had no entry here, so they were served as the bare SPA shell.
  //    See scripts/prerender.mjs for the matching ROUTES entries.

  // ── Portfolio (2) ────────────────────────────────────────────
  ['/admin', '/__prerendered/admin'],

  // ── DFIR: real pages (10) ────────────────────────────────────
  ['/dfir/asset-intel', '/__prerendered/dfir__asset-intel'],
  ['/dfir/blocklists', '/__prerendered/dfir__blocklists'],
  ['/dfir/ct-monitor', '/__prerendered/dfir__ct-monitor'],
  ['/dfir/file', '/__prerendered/dfir__file'],
  ['/dfir/host-graph', '/__prerendered/dfir__host-graph'],

  // ── Phase 5: New gap features ─────────────────────────────────
  ['/dfir/export-hub', '/__prerendered/dfir__export-hub'],
  ['/dfir/ai-suite', '/__prerendered/dfir__ai-suite'],
  ['/dfir/crypto-tracer', '/__prerendered/dfir__crypto-tracer'],
  ['/dfir/report-hub', '/__prerendered/dfir__report-hub'],
  ['/dfir/pivex', '/__prerendered/dfir__pivex'],
  ['/dfir/phishops', '/__prerendered/dfir__phishops'],
  ['/dfir/phishbook', '/__prerendered/dfir__phishbook'],
  ['/dfir/ai-threats', '/__prerendered/dfir__ai-threats'],
  ['/dfir/oss-feeds', '/__prerendered/dfir__oss-feeds'],

  // ── ThreatIntel: real pages, not redirects (28) ──────────────
  ['/threatintel/tools/stix-bundles', '/__prerendered/threatintel__tools__stix-bundles'],
  ['/threatintel/tools/actionable-iocs', '/__prerendered/threatintel__tools__actionable-iocs'],
  ['/threatintel/dashboard-hub', '/__prerendered/threatintel__dashboard-hub'],
  ['/dfir/copilot', '/__prerendered/dfir__copilot'],
  ['/dfir/orkl', '/__prerendered/dfir__orkl'],
  ['/dfir/wifi-investigation', '/__prerendered/dfir__wifi-investigation'],
  ['/dfir/traceix', '/__prerendered/dfir__traceix'],
  ['/dfir/nhi-scan', '/__prerendered/dfir__nhi-scan'],
  ['/dfir/whoxy', '/__prerendered/dfir__whoxy'],
  ['/dfir/winreg', '/__prerendered/dfir__winreg'],
  ['/dfir/sigbase', '/__prerendered/dfir__sigbase'],
  // ── Standalone SPA pages ──────────────────────────────────────
  ['/threatintel/external/cerast', '/__prerendered/threatintel__external__cerast'],
  ['/threatintel/external/threatmon', '/__prerendered/threatintel__external__threatmon'],
  // ── Previously shell-only static pages (SEO/CWV: crawlable first paint) ─
  ['/argus', '/__prerendered/argus'],
  ['/dfir/agent-history', '/__prerendered/dfir__agent-history'],
  ['/dfir/csrf-poc', '/__prerendered/dfir__csrf-poc'],
  ['/dfir/detection-chokepoints', '/__prerendered/dfir__detection-chokepoints'],
  ['/dfir/one-time-secret', '/__prerendered/dfir__one-time-secret'],
  ['/dfir/xss-payloads', '/__prerendered/dfir__xss-payloads'],
  ['/threatintel/alerts', '/__prerendered/threatintel__alerts'],
  ['/threatintel/apt-actors', '/__prerendered/threatintel__apt-actors'],
  ['/threatintel/aptmap', '/__prerendered/threatintel__aptmap'],
  ['/threatintel/estate', '/__prerendered/threatintel__estate'],
  ['/threatintel/infra/ai-honeypot', '/__prerendered/threatintel__infra__ai-honeypot'],
]);

/**
 * Dynamic route patterns that should fall back to a parent page's
 * prerendered HTML. The client-side React Router handles the dynamic
 * parameter (e.g. :slug), but the Worker still has to serve real HTML
 * (not the empty SPA shell) so the page chrome paints before hydration
 * and the URL the user sees matches the actual content.
 *
 * Each entry: [regex matching the dynamic path, prerendered parent to
 * serve]. Patterns are case-insensitive because some slugs contain
 * uppercase letters — notably the ISO-week label in weekly briefings
 * (`weekly-2026-W22` from isoYearWeek() in api/src/lib/briefing-builder.ts),
 * but also actor handles and other identifiers that may mix case.
 *
 * Regression note: this table was originally added to worker/index.ts
 * in commit 743be0a ("fix: handle dynamic routes with fallback to
 * parent prerendered pages") and was lost when commit f921102 split
 * the worker into modules. The original patterns used `[a-z0-9-]+`
 * which never matched the uppercase `W` in weekly slugs, so even with
 * the table restored, `weekly-2026-W22` would still have shell-served.
 * Patterns below use `/i` to cover that case.
 *
 * The slug here is intentionally permissive (any non-empty path
 * segment) so future dynamic routes added to App.tsx don't need a
 * worker change to render — just an entry in PRERENDERED_ROUTES for
 * the parent and a slug-aware React Router <Route>.
 */
const DYNAMIC_ROUTE_FALLBACKS: ReadonlyArray<[RegExp, string]> = [
  // ── ThreatIntel: category filter on the home (legacy) ─────────
  [/^\/threatintel\/c\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  // ── ThreatIntel: unknown sub-slugs (slug-aware routes) ─────────
  // Briefings detail pages intentionally do NOT fall back to the index
  // prerender: the index DOM (skeleton list, filter pills, aria-current on
  // Briefings) and the detail DOM (executive summary, findings, IOCs) are
  // completely different trees. React 18's hydration mismatch handler leaves
  // the SSR'd DOM in place and only logs a warning, so the user would see
  // the index skeleton forever. Serve the empty SPA shell instead — the
  // client hydrates clean and the detail component takes over.
  [/^\/threatintel\/wiki\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/actors\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/campaigns\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/research\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/infostealer\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/assessments\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  // ── Blog ───────────────────────────────────────────────────────
  [/^\/blog\/c\/[^/]+$/i, '/__prerendered/blog'],
  [/^\/blog\/t\/[^/]+$/i, '/__prerendered/blog'],
  [/^\/blog\/[^/]+$/i, '/__prerendered/blog'],
  // ── Projects ───────────────────────────────────────────────────
  [/^\/projects\/[^/]+$/i, '/__prerendered/projects'],
  // ── DFIR tools category ────────────────────────────────────────
  [/^\/dfir\/tools\/[^/]+$/i, '/__prerendered/dfir__catalog'],
  // ── ThreatIntel: hub tab routes (14) — fall back to catalog ──
  // The catalog at /threatintel/catalog is the single navigation surface;
  // unknown sub-slugs in any hub render the catalog so the user can
  // browse to the correct page.
  [/^\/threatintel\/iocs\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/cves\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/malware\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/feeds\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/social\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/phishing\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/infra\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/detections\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/research-hub\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/osint\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/tools\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/external\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/predictive\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
  [/^\/threatintel\/darkweb\/[^/]+$/i, '/__prerendered/threatintel__catalog'],
];

function resolveDynamicRoute(pathname: string): string | null {
  // Skip static assets (images, fonts, JS, CSS, etc.) — none of the
  // dynamic route patterns would match a file extension anyway, and
  // testing ~38 regexes per asset request adds needless CPU.
  if (pathname.includes('.')) return null;
  for (const [pattern, fallback] of DYNAMIC_ROUTE_FALLBACKS) {
    if (pattern.test(pathname)) {
      return fallback;
    }
  }
  return null;
}

export async function fetchPrerenderedOrShell(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  nonce: string
): Promise<Response> {
  // Try exact match first; fall back to a dynamic-route parent if the
  // exact path isn't a prerendered page.
  const prerenderedPath = PRERENDERED_ROUTES.get(url.pathname) ?? resolveDynamicRoute(url.pathname);
  if (!prerenderedPath) {
    const r = await getOrInjectOg(request, env, ctx, url);
    // Pass through non-HTML assets (images, fonts, WASM, JSON) as-is.
    // Calling r.text() on binary data would decode bytes as UTF-8 and
    // corrupt them — PNGs, WASM, and fonts contain non-UTF-8 byte
    // sequences that get replaced with U+FFFD.
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.toLowerCase().includes('text/html')) return r;
    const body = injectScriptNonce(await r.text(), nonce);
    const h = new Headers(r.headers);
    h.set('x-ssr-source', 'spa-shell');
    // SPA shell references content-hashed JS/CSS chunks that are safe
    // to cache immutably, but the shell HTML itself must refresh on
    // every deploy so users pick up new lazy chunks (e.g. a new
    // NotFound page, the React Router table). Use no-cache (not no-store)
    // to force revalidation on every load while still allowing the page
    // into the back/forward cache - no-store blocks bfcache restoration.
    h.set('cache-control', 'no-cache, must-revalidate');
    h.set('pragma', 'no-cache');
    return new Response(body, { status: r.status, statusText: r.statusText, headers: h });
  }
  const internal = new URL(request.url);
  internal.pathname = prerenderedPath;
  const prerenderRes = await env.ASSETS.fetch(new Request(internal.toString(), request));
  if (prerenderRes.status === 404) {
    const r = await getOrInjectOg(request, env, ctx, url);
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.toLowerCase().includes('text/html')) return r;
    const body = injectScriptNonce(await r.text(), nonce);
    const h = new Headers(r.headers);
    h.set('x-ssr-source', 'shell-fallback-404');
    // no-cache forces revalidation (fresh shell on every load) without
    // blocking back/forward cache restoration the way no-store does.
    h.set('cache-control', 'no-cache, must-revalidate');
    h.set('pragma', 'no-cache');
    return new Response(body, { status: r.status, statusText: r.statusText, headers: h });
  }
  const ogRewritten = await injectOgMeta(prerenderRes, url, env, ctx, nonce);
  const headers = new Headers(ogRewritten.headers);
  // A prerendered shell references the same content-hashed JS/CSS chunks as
  // the SPA shell, and those chunk filenames change (and the old ones are
  // deleted) on every deploy. Caching this HTML in the *browser* for a day
  // means a returning visitor serves a stale shell that imports a now-404'd
  // lazy chunk → the app crashes into the "Update available" boundary. So it
  // must revalidate on every load, exactly like the SPA-shell and 404 paths
  // above. The worker's own etag-keyed Cache API entry (see injectOgMeta)
  // is unaffected by this header, so server-side hit rate is preserved.
  headers.set('x-ssr-source', 'prerendered');
  // no-cache forces revalidation on every load (fresh shell, same as
  // before) while allowing bfcache - no-store would block back/forward
  // restoration for no freshness benefit.
  headers.set('cache-control', 'no-cache, must-revalidate');
  headers.set('pragma', 'no-cache');
  return new Response(ogRewritten.body, {
    status: ogRewritten.status,
    statusText: ogRewritten.statusText,
    headers,
  });
}
