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
  ['/behind-the-reports', '/__prerendered/behind-the-reports'],
  ['/sponsor', '/__prerendered/sponsor'],
  ['/blog', '/__prerendered/blog'],

  // ── Landings ──────────────────────────────────────────────────
  ['/dfir', '/__prerendered/dfir'],
  ['/threatintel', '/__prerendered/threatintel'],
  ['/radar', '/__prerendered/radar'],
  ['/threatintel/catalog', '/__prerendered/threatintel__catalog'],
  ['/threatintel/actors/directory', '/__prerendered/threatintel__actors__directory'],
  ['/threatintel/actors/timeline', '/__prerendered/threatintel__actors__timeline'],
  ['/threatintel/actors/dna', '/__prerendered/threatintel__actors__dna'],
  ['/threatintel/actors/usernames', '/__prerendered/threatintel__actors__usernames'],
  ['/threatintel/actors/attribution', '/__prerendered/threatintel__actors__attribution'],
  ['/threatintel/actors/catalog', '/__prerendered/threatintel__actors__catalog'],
  ['/threatintel/actors/kb', '/__prerendered/threatintel__actors__kb'],
  ['/threatintel/actors/graph', '/__prerendered/threatintel__actors__graph'],
  ['/threatintel/campaigns/active', '/__prerendered/threatintel__campaigns__active'],
  ['/threatintel/campaigns/lifecycle', '/__prerendered/threatintel__campaigns__lifecycle'],
  ['/threatintel/campaigns/generator', '/__prerendered/threatintel__campaigns__generator'],
  ['/threatintel/campaigns/cross', '/__prerendered/threatintel__campaigns__cross'],
  ['/threatintel/campaigns/reference', '/__prerendered/threatintel__campaigns__reference'],
  ['/threatintel/darkweb/watch', '/__prerendered/threatintel__darkweb__watch'],
  ['/threatintel/darkweb/markets', '/__prerendered/threatintel__darkweb__markets'],
  ['/threatintel/darkweb/forums', '/__prerendered/threatintel__darkweb__forums'],
  ['/threatintel/darkweb/deepdark', '/__prerendered/threatintel__darkweb__deepdark'],
  ['/threatintel/darkweb/crime', '/__prerendered/threatintel__darkweb__crime'],
  ['/threatintel/darkweb/bitcoin', '/__prerendered/threatintel__darkweb__bitcoin'],
  ['/threatintel/darkweb/infostealer', '/__prerendered/threatintel__darkweb__infostealer'],
  ['/threatintel/darkweb/leaks', '/__prerendered/threatintel__darkweb__leaks'],
  ['/threatintel/darkweb/disclosures', '/__prerendered/threatintel__darkweb__disclosures'],
  ['/threatintel/darkweb/ransom-report', '/__prerendered/threatintel__darkweb__ransom-report'],
  ['/threatintel/darkweb/ransom-activity', '/__prerendered/threatintel__darkweb__ransom-activity'],
  ['/threatintel/darkweb/ransom-map', '/__prerendered/threatintel__darkweb__ransom-map'],
  ['/threatintel/darkweb/ransomwhere', '/__prerendered/threatintel__darkweb__ransomwhere'],
  ['/threatintel/darkweb/recon', '/__prerendered/threatintel__darkweb__recon'],
  ['/threatintel/predictive/dashboard', '/__prerendered/threatintel__predictive__dashboard'],
  ['/threatintel/predictive/global-pulse', '/__prerendered/threatintel__predictive__global-pulse'],
  ['/threatintel/predictive/threat-pulse', '/__prerendered/threatintel__predictive__threat-pulse'],
  ['/threatintel/predictive/certstream', '/__prerendered/threatintel__predictive__certstream'],
  ['/threatintel/predictive/pir', '/__prerendered/threatintel__predictive__pir'],
  ['/threatintel/predictive/metrics', '/__prerendered/threatintel__predictive__metrics'],
  ['/threatintel/predictive/analytics', '/__prerendered/threatintel__predictive__analytics'],
  ['/threatintel/predictive/predictions', '/__prerendered/threatintel__predictive__predictions'],
  ['/threatintel/predictive/predictive', '/__prerendered/threatintel__predictive__predictive'],
  ['/threatintel/predictive/analyze', '/__prerendered/threatintel__predictive__analyze'],
  ['/threatintel/predictive/assessments', '/__prerendered/threatintel__predictive__assessments'],
  ['/threatintel/predictive/observe', '/__prerendered/threatintel__predictive__observe'],
  ['/threatintel/detections/detections', '/__prerendered/threatintel__detections__detections'],
  ['/threatintel/detections/disarm', '/__prerendered/threatintel__detections__disarm'],
  ['/threatintel/detections/yara', '/__prerendered/threatintel__detections__yara'],
  ['/threatintel/detections/signal', '/__prerendered/threatintel__detections__signal'],
  ['/threatintel/phishing/phish', '/__prerendered/threatintel__phishing__phish'],
  ['/threatintel/phishing/urls', '/__prerendered/threatintel__phishing__urls'],
  ['/threatintel/phishing/scam', '/__prerendered/threatintel__phishing__scam'],
  ['/threatintel/external/external', '/__prerendered/threatintel__external__external'],
  ['/threatintel/external/supply', '/__prerendered/threatintel__external__supply'],
  ['/threatintel/external/awesome', '/__prerendered/threatintel__external__awesome'],
  ['/threatintel/feeds/catalog', '/__prerendered/threatintel__feeds__catalog'],
  ['/threatintel/feeds/sources', '/__prerendered/threatintel__feeds__sources'],
  ['/threatintel/feeds/quality', '/__prerendered/threatintel__feeds__quality'],
  ['/threatintel/feeds/scheduler', '/__prerendered/threatintel__feeds__scheduler'],
  ['/threatintel/feeds/threatfeeds', '/__prerendered/threatintel__feeds__threatfeeds'],
  ['/threatintel/feeds/status', '/__prerendered/threatintel__feeds__status'],
  ['/threatintel/feeds/reliability', '/__prerendered/threatintel__feeds__reliability'],
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
  ['/threatintel/iocs/soc', '/__prerendered/threatintel__iocs__soc'],
  ['/threatintel/iocs/observable', '/__prerendered/threatintel__iocs__observable'],
  ['/threatintel/wiki/wiki', '/__prerendered/threatintel__wiki__wiki'],
  ['/threatintel/wiki/mitre', '/__prerendered/threatintel__wiki__mitre'],
  ['/threatintel/wiki/f3ead', '/__prerendered/threatintel__wiki__f3ead'],
  ['/threatintel/wiki/insider', '/__prerendered/threatintel__wiki__insider'],
  ['/threatintel/wiki/owasp', '/__prerendered/threatintel__wiki__owasp'],
  ['/threatintel/wiki/llm', '/__prerendered/threatintel__wiki__llm'],
  ['/threatintel/malware/iocs', '/__prerendered/threatintel__malware__iocs'],
  ['/threatintel/malware/vault', '/__prerendered/threatintel__malware__vault'],
  ['/threatintel/malware/sandbox', '/__prerendered/threatintel__malware__sandbox'],
  ['/threatintel/malware/packages', '/__prerendered/threatintel__malware__packages'],
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
  ['/threatintel/research-hub/campaign-gen', '/__prerendered/threatintel__research-hub__campaign-gen'],
  ['/threatintel/research-hub/knowledge', '/__prerendered/threatintel__research-hub__knowledge'],
  ['/threatintel/research-hub/ach', '/__prerendered/threatintel__research-hub__ach'],
  ['/threatintel/research-hub/library', '/__prerendered/threatintel__research-hub__library'],
  ['/threatintel/social/firehose', '/__prerendered/threatintel__social__firehose'],
  ['/threatintel/social/news', '/__prerendered/threatintel__social__news'],
  ['/threatintel/social/telegram-leaks', '/__prerendered/threatintel__social__telegram-leaks'],
  ['/threatintel/social/telegram-stats', '/__prerendered/threatintel__social__telegram-stats'],
  ['/threatintel/social/telegram-channels', '/__prerendered/threatintel__social__telegram-channels'],
  ['/threatintel/social/telegram-settings', '/__prerendered/threatintel__social__telegram-settings'],
  ['/threatintel/social/crypto-scam', '/__prerendered/threatintel__social__crypto-scam'],
  ['/threatintel/social/reddit', '/__prerendered/threatintel__social__reddit'],
  ['/threatintel/social/x-firehose', '/__prerendered/threatintel__social__x-firehose'],
  ['/threatintel/social/x-live', '/__prerendered/threatintel__social__x-live'],
  ['/threatintel/social/x-watch', '/__prerendered/threatintel__social__x-watch'],
  ['/threatintel/social/scraped-intel', '/__prerendered/threatintel__social__scraped-intel'],
  ['/threatintel/tools/copilot', '/__prerendered/threatintel__tools__copilot'],
  ['/threatintel/tools/mcp', '/__prerendered/threatintel__tools__mcp'],
  ['/threatintel/tools/misp', '/__prerendered/threatintel__tools__misp'],
  ['/threatintel/tools/stix', '/__prerendered/threatintel__tools__stix'],
  ['/threatintel/tools/graph', '/__prerendered/threatintel__tools__graph'],
  ['/threatintel/tools/investigations', '/__prerendered/threatintel__tools__investigations'],
  ['/threatintel/tools/watches', '/__prerendered/threatintel__tools__watches'],
  ['/threatintel/tools/workspaces', '/__prerendered/threatintel__tools__workspaces'],
  ['/threatintel/tools/tg-intel-search', '/__prerendered/threatintel__tools__tg-intel-search'],
  ['/threatintel/tools/socradar-tools', '/__prerendered/threatintel__tools__socradar-tools'],
  ['/threatintel/tools/settings', '/__prerendered/threatintel__tools__settings'],
  ['/threatintel/tools/directory', '/__prerendered/threatintel__tools__directory'],
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
  ['/dfir/tabletop', '/__prerendered/dfir__tabletop'],
  ['/dfir/grc', '/__prerendered/dfir__grc'],
  ['/dfir/data-classification', '/__prerendered/dfir__data-classification'],
  ['/dfir/privacy-hub', '/__prerendered/dfir__privacy-hub'],
  ['/dfir/personal-security', '/__prerendered/dfir__personal-security'],

  // ── DFIR: utilities & decoders ────────────────────────────────
  ['/dfir/timestamp', '/__prerendered/dfir__timestamp'],
  ['/dfir/hash-calc', '/__prerendered/dfir__hash-calc'],
  ['/dfir/decode', '/__prerendered/dfir__decode'],
  ['/dfir/encoder', '/__prerendered/dfir__encoder'],
  ['/dfir/punycode', '/__prerendered/dfir__punycode'],
  ['/dfir/dork-builder', '/__prerendered/dfir__dork-builder'],
  ['/dfir/brand-impersonation', '/__prerendered/dfir__brand-impersonation'],

  // ── DFIR: image / media ───────────────────────────────────────
  ['/dfir/image-fingerprint', '/__prerendered/dfir__image-fingerprint'],
  ['/dfir/reverse-image', '/__prerendered/dfir__reverse-image'],
  ['/dfir/exif', '/__prerendered/dfir__exif'],

  // ── DFIR: file format analyzers ───────────────────────────────
  ['/dfir/plist-protobuf', '/__prerendered/dfir__plist-protobuf'],
  ['/dfir/pcap-triage', '/__prerendered/dfir__pcap-triage'],
  ['/dfir/registry-hive', '/__prerendered/dfir__registry-hive'],
  ['/dfir/evtx', '/__prerendered/dfir__evtx'],
  ['/dfir/sqlite', '/__prerendered/dfir__sqlite'],
  ['/dfir/ios-backup', '/__prerendered/dfir__ios-backup'],
  ['/dfir/mobile-sqlite', '/__prerendered/dfir__mobile-sqlite'],
  ['/dfir/apk-analyzer', '/__prerendered/dfir__apk-analyzer'],

  // ── DFIR: binary / log analyzers ──────────────────────────────
  ['/dfir/pe', '/__prerendered/dfir__pe'],
  ['/dfir/web-log', '/__prerendered/dfir__web-log'],
  ['/dfir/prefetch', '/__prerendered/dfir__prefetch'],
  ['/dfir/powershell-deobf', '/__prerendered/dfir__powershell-deobf'],
  ['/dfir/screenshot-intel', '/__prerendered/dfir__screenshot-intel'],

  // ── DFIR: detection & analysis ────────────────────────────────
  ['/dfir/rule-converter', '/__prerendered/dfir__rule-converter'],
  ['/dfir/rule-playground', '/__prerendered/dfir__rule-playground'],
  ['/dfir/yara', '/__prerendered/dfir__yara'],
  ['/dfir/detection-lab', '/__prerendered/dfir__detection-lab'],
  ['/dfir/prompt-injection', '/__prerendered/dfir__prompt-injection'],
  ['/dfir/pi-taxonomy', '/__prerendered/dfir__pi-taxonomy'],
  ['/dfir/ironsight', '/__prerendered/dfir__ironsight'],
  ['/dfir/mcp-audit', '/__prerendered/dfir__mcp-audit'],
  ['/dfir/agent-map', '/__prerendered/dfir__agent-map'],
  ['/dfir/cve-prioritizer', '/__prerendered/dfir__cve-prioritizer'],

  // ── DFIR: cloud security ──────────────────────────────────────
  ['/dfir/iam-analyzer', '/__prerendered/dfir__iam-analyzer'],
  ['/dfir/gcp-iam', '/__prerendered/dfir__gcp-iam'],
  ['/dfir/azure-rbac', '/__prerendered/dfir__azure-rbac'],
  ['/dfir/sg-analyzer', '/__prerendered/dfir__sg-analyzer'],
  ['/dfir/cloudtrail-triage', '/__prerendered/dfir__cloudtrail-triage'],
  ['/dfir/k8s-rbac', '/__prerendered/dfir__k8s-rbac'],
  ['/dfir/terraform-scan', '/__prerendered/dfir__terraform-scan'],

  // ── DFIR: API security ────────────────────────────────────────
  ['/dfir/openapi-audit', '/__prerendered/dfir__openapi-audit'],
  ['/dfir/sec-headers', '/__prerendered/dfir__sec-headers'],
  ['/dfir/secret-scan', '/__prerendered/dfir__secret-scan'],
  ['/dfir/medusa-scan', '/__prerendered/dfir__medusa-scan'],
  ['/dfir/graphql-audit', '/__prerendered/dfir__graphql-audit'],
  ['/dfir/osv-scan', '/__prerendered/dfir__osv-scan'],
  ['/dfir/wordpress-sim', '/__prerendered/dfir__wordpress-sim'],

  // ── DFIR: STIX ────────────────────────────────────────────────
  ['/dfir/stix', '/__prerendered/dfir__stix'],
  ['/dfir/stix-builder', '/__prerendered/dfir__stix-builder'],
  // ── DFIR: catalog + per-hub category landings (2026-06-17) ───
  // ── DFIR: catalog + per-hub category landings (2026-06-17) ───
  ['/dfir/catalog', '/__prerendered/dfir__catalog'],
  ['/dfir/vs', '/__prerendered/dfir__vs'],
  ['/dfir/ai-rule-generator', '/__prerendered/dfir__ai-rule-generator'],
  ['/dfir/fp-lens', '/__prerendered/dfir__fp-lens'],
  ['/dfir/threat-graph', '/__prerendered/dfir__threat-graph'],
  ['/dfir/attack-chain', '/__prerendered/dfir__attack-chain'],
  ['/dfir/hunting-query-generator', '/__prerendered/dfir__hunting-query-generator'],
  ['/dfir/sandbox', '/__prerendered/dfir__sandbox'],
  ['/dfir/ir-playbooks', '/__prerendered/dfir__ir-playbooks'],
  ['/dfir/stealer-parser', '/__prerendered/dfir__stealer-parser'],
  ['/dfir/taxii', '/__prerendered/dfir__taxii'],
  ['/dfir/bloom', '/__prerendered/dfir__bloom'],

  // ── DFIR: security frameworks ─────────────────────────────────
  ['/dfir/nhi', '/__prerendered/dfir__nhi'],
  ['/dfir/jwt', '/__prerendered/dfir__jwt'],
  ['/dfir/privacy', '/__prerendered/dfir__privacy'],
  ['/dfir/zero-trust-ai-agents', '/__prerendered/dfir__zero-trust-ai-agents'],

  // ── DFIR: dark web workbench ──────────────────────────────────
  ['/dfir/pgp-tool', '/__prerendered/dfir__pgp-tool'],
  ['/dfir/tor-gateway', '/__prerendered/dfir__tor-gateway'],

  // ── DFIR: investigator workbenches ────────────────────────────
  ['/dfir/domain-investigator', '/__prerendered/dfir__domain-investigator'],
  ['/dfir/ioc-investigate', '/__prerendered/dfir__ioc-investigate'],
  ['/dfir/username-investigator', '/__prerendered/dfir__username-investigator'],
  ['/dfir/yara-workbench', '/__prerendered/dfir__yara-workbench'],
  ['/dfir/stix-workbench', '/__prerendered/dfir__stix-workbench'],
  ['/dfir/malware-analyzer', '/__prerendered/dfir__malware-analyzer'],

  // ── DFIR: specialist tools ───────────────────────────────────
  ['/dfir/attack-navigator', '/__prerendered/dfir__attack-navigator'],
  ['/dfir/mitre-matrix', '/__prerendered/dfir__mitre-matrix'],
  ['/dfir/vuln-toolkit', '/__prerendered/dfir__vuln-toolkit'],
  ['/dfir/sec-headers-live', '/__prerendered/dfir__sec-headers-live'],
  ['/dfir/email-deliverability', '/__prerendered/dfir__email-deliverability'],
  ['/dfir/ioc-lifecycle', '/__prerendered/dfir__ioc-lifecycle'],
  ['/dfir/osint-mapper', '/__prerendered/dfir__osint-mapper'],
  ['/dfir/multi-search', '/__prerendered/dfir__multi-search'],
  ['/dfir/notebooks', '/__prerendered/dfir__notebooks'],

  // ── DFIR: triage & forensic tools ────────────────────────────
  ['/dfir/dnscope', '/__prerendered/dfir__dnscope'],
  ['/dfir/regscope', '/__prerendered/dfir__regscope'],
  ['/dfir/tracer', '/__prerendered/dfir__tracer'],
  ['/dfir/tracerules', '/__prerendered/dfir__tracerules'],
  ['/dfir/phone-osint', '/__prerendered/dfir__phone-osint'],
  ['/dfir/phone-intel', '/__prerendered/dfir__phone-intel'],
  ['/dfir/weather-osint', '/__prerendered/dfir__weather-osint'],
  ['/dfir/infostealer-intel', '/__prerendered/dfir__infostealer-intel'],
  ['/dfir/rhysida-intrusion', '/__prerendered/dfir__rhysida-intrusion'],

  // ── DFIR: AI agent tools ─────────────────────────────────────
  ['/dfir/agent', '/__prerendered/dfir__agent'],
  ['/dfir/agent-enrich', '/__prerendered/dfir__agent-enrich'],
  ['/dfir/attmap-ai', '/__prerendered/dfir__attmap-ai'],
  ['/dfir/x-verdikt', '/__prerendered/dfir__x-verdikt'],

  // ── DFIR: tools that fetch /api/v1/* on mount ─────────────────
  ['/dfir/ioc-check', '/__prerendered/dfir__ioc-check'],
  ['/dfir/phishing', '/__prerendered/dfir__phishing'],
  ['/dfir/domain', '/__prerendered/dfir__domain'],
  ['/dfir/domain-rep', '/__prerendered/dfir__domain-rep'],
  ['/dfir/whois-history', '/__prerendered/dfir__whois-history'],
  ['/dfir/passive-dns', '/__prerendered/dfir__passive-dns'],
  // /dfir/sql-workspace removed: the page (SqlWorkspace.tsx) has no route in
  // App.tsx, so this mapped to a prerender that was never generated — it was
  // served as the bare SPA shell, cached 24h as "prerendered".
  ['/dfir/open-directory', '/__prerendered/dfir__open-directory'],
  ['/dfir/full-spectrum', '/__prerendered/dfir__full-spectrum'],
  ['/dfir/exposure', '/__prerendered/dfir__exposure'],
  ['/dfir/exposed-host', '/__prerendered/dfir__exposed-host'],
  ['/dfir/dashboard', '/__prerendered/dfir__dashboard'],
  ['/dfir/cve', '/__prerendered/dfir__cve'],
  ['/dfir/cert-search', '/__prerendered/dfir__cert-search'],
  ['/dfir/atlas', '/__prerendered/dfir__atlas'],
  ['/dfir/asn', '/__prerendered/dfir__asn'],
  ['/dfir/breach', '/__prerendered/dfir__breach'],
  ['/dfir/url-preview', '/__prerendered/dfir__url-preview'],
  ['/dfir/subdomain-takeover', '/__prerendered/dfir__subdomain-takeover'],
  ['/dfir/extract', '/__prerendered/dfir__extract'],
  ['/dfir/ioc-pivot', '/__prerendered/dfir__ioc-pivot'],
  ['/dfir/google-dorks', '/__prerendered/dfir__google-dorks'],
  ['/dfir/linux-triage', '/__prerendered/dfir__linux-triage'],
  ['/dfir/takeover', '/__prerendered/dfir__takeover'],
  ['/dfir/email-defense', '/__prerendered/dfir__email-defense'],
  ['/dfir/dmarc-analyzer', '/__prerendered/dfir__dmarc-analyzer'],
  ['/dfir/dlp-scan', '/__prerendered/dfir__dlp-scan'],
  ['/dfir/username', '/__prerendered/dfir__username'],
  ['/dfir/wayback', '/__prerendered/dfir__wayback'],
  ['/dfir/ip-geo', '/__prerendered/dfir__ip-geo'],
  ['/dfir/log-parser', '/__prerendered/dfir__log-parser'],
  ['/dfir/socmint', '/__prerendered/dfir__socmint'],
  ['/dfir/tools/about', '/__prerendered/dfir__tools__about'],
  ['/dfir/web-scan', '/__prerendered/dfir__web-scan'],
  ['/dfir/malware-scan', '/__prerendered/dfir__malware-scan'],
  ['/dfir/sample-scan', '/__prerendered/dfir__sample-scan'],
  ['/dfir/eml', '/__prerendered/dfir__eml'],
  ['/dfir/url-rep', '/__prerendered/dfir__url-rep'],
  ['/dfir/email-rep', '/__prerendered/dfir__email-rep'],
  ['/dfir/email-osnit', '/__prerendered/dfir__email-osnit'],
  ['/dfir/crypto-trace', '/__prerendered/dfir__crypto-trace'],

  // ── ThreatIntel: static catalogs ──────────────────────────────
  ['/threatintel/awesome-lists', '/__prerendered/threatintel__awesome-lists'],
  ['/threatintel/secops-tools', '/__prerendered/threatintel__secops-tools'],
  ['/threatintel/cve-resources', '/__prerendered/threatintel__cve-resources'],
  ['/threatintel/osint-framework', '/__prerendered/threatintel__osint-framework'],
  ['/threatintel/mitre', '/__prerendered/threatintel__mitre'],
  ['/threatintel/actor-kb', '/__prerendered/threatintel__actor-kb'],
  ['/threatintel/actor-dna', '/__prerendered/threatintel__actor-dna'],
  ['/threatintel/campaign-lifecycle', '/__prerendered/threatintel__campaign-lifecycle'],
  ['/threatintel/attribution', '/__prerendered/threatintel__attribution'],
  ['/threatintel/intelligence-gaps', '/__prerendered/threatintel__intelligence-gaps'],
  ['/threatintel/cross-campaign', '/__prerendered/threatintel__cross-campaign'],
  ['/threatintel/most-wanted', '/__prerendered/threatintel__most-wanted'],
  ['/threatintel/apt-tracker', '/__prerendered/threatintel__apt-tracker'],
  ['/threatintel/extremists', '/__prerendered/threatintel__extremists'],
  ['/threatintel/predators', '/__prerendered/threatintel__predators'],
  ['/threatintel/rules', '/__prerendered/threatintel__rules'],
  // '/threatintel/briefings' removed from PRERENDERED_ROUTES: list is
  // data-driven (fetches /api/v1/briefings/list on mount). Prerendering
  // the empty initial state causes a React 18 hydration mismatch that
  // leaves the stale SSR'd list visible. Same root cause as the detail-
  // page fix above (DYNAMIC_ROUTE_FALLBACKS).

  // ── ThreatIntel: pages ────────────────────────────────────────
  ['/threatintel/about', '/__prerendered/threatintel__about'],
  ['/threatintel/external-resources', '/__prerendered/threatintel__external-resources'],
  ['/threatintel/threatsignal', '/__prerendered/threatintel__threatsignal'],
  ['/threatintel/bitwire-blocklist', '/__prerendered/threatintel__bitwire-blocklist'],
  ['/threatintel/owasp-ai-landscape', '/__prerendered/threatintel__owasp-ai-landscape'],
  ['/threatintel/curated-toolbox', '/__prerendered/threatintel__curated-toolbox'],
  ['/threatintel/redhunt-labs', '/__prerendered/threatintel__redhunt-labs'],
  ['/threatintel/redhunt-insights', '/__prerendered/threatintel__redhunt-insights'],
  ['/threatintel/ai-report', '/__prerendered/threatintel__ai-report'],
  ['/threatintel/mcp-search', '/__prerendered/threatintel__mcp-search'],
  ['/threatintel/live-center', '/__prerendered/threatintel__live-center'],
  ['/threatintel/telegram', '/__prerendered/threatintel__telegram'],
  ['/threatintel/telegram-monitor', '/__prerendered/threatintel__telegram-monitor'],
  ['/threatintel/source-health', '/__prerendered/threatintel__source-health'],
  ['/threatintel/soc-dashboard', '/__prerendered/threatintel__soc-dashboard'],
  ['/threatintel/telegram-iocs', '/__prerendered/threatintel__telegram-iocs'],
  ['/threatintel/malware/supply-chain', '/__prerendered/threatintel__malware__supply-chain'],

  // ── ThreatIntel: live-feed surfaces ───────────────────────────
  ['/threatintel/pulse', '/__prerendered/threatintel__pulse'],
  ['/threatintel/ransomware-map', '/__prerendered/threatintel__ransomware-map'],
  ['/threatintel/ransomwhere', '/__prerendered/threatintel__ransomwhere'],
  ['/threatintel/certstream', '/__prerendered/threatintel__certstream'],
  ['/threatintel/campaign-generator', '/__prerendered/threatintel__campaign-generator'],
  ['/threatintel/malicious-packages', '/__prerendered/threatintel__malicious-packages'],
  ['/threatintel/x-watch', '/__prerendered/threatintel__x-watch'],
  ['/threatintel/x-live', '/__prerendered/threatintel__x-live'],
  ['/threatintel/mythreatintel', '/__prerendered/threatintel__mythreatintel'],
  ['/threatintel/cybersec', '/__prerendered/threatintel__cybersec'],
  ['/threatintel/breach', '/__prerendered/threatintel__breach'],
  ['/threatintel/reddit', '/__prerendered/threatintel__reddit'],
  ['/threatintel/x', '/__prerendered/threatintel__x'],
  ['/threatintel/status', '/__prerendered/threatintel__status'],
  ['/threatintel/metrics', '/__prerendered/threatintel__metrics'],
  ['/threatintel/soc-ransomware', '/__prerendered/threatintel__soc-ransomware'],
  ['/threatintel/soc-vulns', '/__prerendered/threatintel__soc-vulns'],
  ['/threatintel/soc-iocs', '/__prerendered/threatintel__soc-iocs'],
  ['/threatintel/correlation', '/__prerendered/threatintel__correlation'],
  ['/threatintel/actor-timeline', '/__prerendered/threatintel__actor-timeline'],
  ['/threatintel/re-leaks', '/__prerendered/threatintel__re-leaks'],
  ['/threatintel/c2-tracker', '/__prerendered/threatintel__c2-tracker'],
  ['/threatintel/signal', '/__prerendered/threatintel__signal'],
  ['/threatintel/research', '/__prerendered/threatintel__research'],
  ['/threatintel/cve-list', '/__prerendered/threatintel__cve-list'],

  ['/threatintel/threat-map', '/__prerendered/threatintel__threat-map'],
  ['/threatintel/facilities', '/__prerendered/threatintel__facilities'],
  ['/threatintel/deepdarkcti', '/__prerendered/threatintel__deepdarkcti'],
  ['/threatintel/ransomware-live', '/__prerendered/threatintel__ransomware-live'],
  ['/threatintel/cyberpulse', '/__prerendered/threatintel__cyberpulse'],
  ['/threatintel/infostealer', '/__prerendered/threatintel__infostealer'],
  ['/threatintel/feed-sources', '/__prerendered/threatintel__feed-sources'],
  ['/threatintel/settings', '/__prerendered/threatintel__settings'],
  ['/threatintel/negotiations', '/__prerendered/threatintel__negotiations'],
  ['/threatintel/maltrail', '/__prerendered/threatintel__maltrail'],
  ['/threatintel/malpedia', '/__prerendered/threatintel__malpedia'],
  ['/threatintel/breach-forums', '/__prerendered/threatintel__breach-forums'],
  ['/threatintel/domain-monitor', '/__prerendered/threatintel__domain-monitor'],
  ['/threatintel/scam-watch', '/__prerendered/threatintel__scam-watch'],
  ['/threatintel/tech-ai-news', '/__prerendered/threatintel__tech-ai-news'],
  ['/threatintel/onion-watch', '/__prerendered/threatintel__onion-watch'],
  ['/threatintel/telegram-watch', '/__prerendered/threatintel__telegram-watch'],
  ['/threatintel/telegram-settings', '/__prerendered/threatintel__telegram-settings'],
  ['/threatintel/misp-browser', '/__prerendered/threatintel__misp-browser'],
  ['/threatintel/search', '/__prerendered/threatintel__search'],
  ['/threatintel/ioc-enrichment', '/__prerendered/threatintel__ioc-enrichment'],
  ['/threatintel/copilot', '/__prerendered/threatintel__copilot'],
  ['/threatintel/copilot-chat', '/__prerendered/threatintel__copilot-chat'],
  ['/threatintel/observe', '/__prerendered/threatintel__observe'],
  ['/threatintel/watches', '/__prerendered/threatintel__watches'],
  ['/threatintel/workspaces', '/__prerendered/threatintel__workspaces'],
  ['/threatintel/threat-feeds', '/__prerendered/threatintel__threat-feeds'],
  ['/threatintel/writeups', '/__prerendered/threatintel__writeups'],
  ['/threatintel/cyber-crime', '/__prerendered/threatintel__cyber-crime'],
  ['/threatintel/ransomware-activity', '/__prerendered/threatintel__ransomware-activity'],
  ['/threatintel/live-iocs', '/__prerendered/threatintel__live-iocs'],
  ['/threatintel/assessments', '/__prerendered/threatintel__assessments'],
  ['/threatintel/feed-quality', '/__prerendered/threatintel__feed-quality'],

  // ── Phase 4 (2026-06-04): 43 real static routes that existed in App.tsx
  //    but had no entry here, so they were served as the bare SPA shell.
  //    See scripts/prerender.mjs for the matching ROUTES entries.

  // ── Portfolio (2) ────────────────────────────────────────────
  ['/admin', '/__prerendered/admin'],
  ['/copilot', '/__prerendered/copilot'],

  // ── DFIR: real pages (10) ────────────────────────────────────
  ['/dfir/abuse-rep', '/__prerendered/dfir__abuse-rep'],
  ['/dfir/asset-intel', '/__prerendered/dfir__asset-intel'],
  ['/dfir/blocklists', '/__prerendered/dfir__blocklists'],
  ['/dfir/ct-monitor', '/__prerendered/dfir__ct-monitor'],
  ['/dfir/file', '/__prerendered/dfir__file'],
  ['/dfir/host-graph', '/__prerendered/dfir__host-graph'],
  ['/dfir/identity-lookup', '/__prerendered/dfir__identity-lookup'],
  ['/dfir/report-parser', '/__prerendered/dfir__report-parser'],
  ['/dfir/report-composer', '/__prerendered/dfir__report-composer'],
  ['/dfir/report-analyzer', '/__prerendered/dfir__report-analyzer'],
  ['/dfir/threat-hunt', '/__prerendered/dfir__threat-hunt'],

  // ── Phase 5: New gap features ─────────────────────────────────
  ['/dfir/export-hub', '/__prerendered/dfir__export-hub'],
  ['/dfir/insight-ai', '/__prerendered/dfir__insight-ai'],
  ['/dfir/querycraft-ai', '/__prerendered/dfir__querycraft-ai'],
  ['/dfir/chrono-ai', '/__prerendered/dfir__chrono-ai'],
  ['/dfir/malbrief-ai', '/__prerendered/dfir__malbrief-ai'],
  ['/dfir/verdikt-ai', '/__prerendered/dfir__verdikt-ai'],
  ['/dfir/pivex', '/__prerendered/dfir__pivex'],
  ['/dfir/tracepulse', '/__prerendered/dfir__tracepulse'],
  ['/dfir/quicktrace', '/__prerendered/dfir__quicktrace'],
  ['/dfir/phishops', '/__prerendered/dfir__phishops'],
  ['/dfir/phishbook', '/__prerendered/dfir__phishbook'],

  // ── ThreatIntel: real pages, not redirects (28) ──────────────
  ['/threatintel/ach', '/__prerendered/threatintel__ach'],
  ['/threatintel/actor-usernames', '/__prerendered/threatintel__actor-usernames'],
  ['/threatintel/aggregated-feeds', '/__prerendered/threatintel__aggregated-feeds'],
  ['/threatintel/predictions', '/__prerendered/threatintel__predictions'],
  ['/threatintel/analyze', '/__prerendered/threatintel__analyze'],
  ['/threatintel/atlas', '/__prerendered/threatintel__atlas'],
  ['/threatintel/collection-slo', '/__prerendered/threatintel__collection-slo'],
  ['/threatintel/cross-correlate', '/__prerendered/threatintel__cross-correlate'],
  ['/threatintel/crypto-scams', '/__prerendered/threatintel__crypto-scams'],
  ['/threatintel/darkweb-tools', '/__prerendered/threatintel__darkweb-tools'],
  ['/threatintel/entity-resolution', '/__prerendered/threatintel__entity-resolution'],
  ['/threatintel/feed-catalog', '/__prerendered/threatintel__feed-catalog'],
  ['/threatintel/feed-scheduler', '/__prerendered/threatintel__feed-scheduler'],
  ['/threatintel/f3ead', '/__prerendered/threatintel__f3ead'],
  ['/threatintel/insider-threat-matrix', '/__prerendered/threatintel__insider-threat-matrix'],
  ['/threatintel/intel-dashboard', '/__prerendered/threatintel__intel-dashboard'],
  ['/threatintel/investigations', '/__prerendered/threatintel__investigations'],
  ['/threatintel/malware-iocs', '/__prerendered/threatintel__malware-iocs'],
  ['/threatintel/malware-vault', '/__prerendered/threatintel__malware-vault'],
  ['/threatintel/observable-db', '/__prerendered/threatintel__observable-db'],
  ['/threatintel/phishing-wordlists', '/__prerendered/threatintel__phishing-wordlists'],
  ['/threatintel/pir-dashboard', '/__prerendered/threatintel__pir-dashboard'],
  ['/threatintel/projectdiscovery', '/__prerendered/threatintel__projectdiscovery'],
  ['/threatintel/ransom-report', '/__prerendered/threatintel__ransom-report'],
  ['/threatintel/relationship-graph', '/__prerendered/threatintel__relationship-graph'],
  ['/threatintel/source-reliability', '/__prerendered/threatintel__source-reliability'],
  ['/threatintel/telegram-leaks', '/__prerendered/threatintel__telegram-leaks'],
  ['/threatintel/telegram-leaks/channels', '/__prerendered/threatintel__telegram-leaks__channels'],
  ['/threatintel/telegram-leaks/stats', '/__prerendered/threatintel__telegram-leaks__stats'],
  ['/threatintel/yara', '/__prerendered/threatintel__yara'],
  ['/threatintel/llm-threat-atlas', '/__prerendered/threatintel__llm-threat-atlas'],
  ['/threatintel/osint-map', '/__prerendered/threatintel__osint-map'],
  ['/threatintel/osint-cli-tools', '/__prerendered/threatintel__osint-cli-tools'],
  ['/threatintel/reports', '/__prerendered/threatintel__reports'],
  ['/threatintel/stix-bundles', '/__prerendered/threatintel__stix-bundles'],
  ['/threatintel/tools/stix-bundles', '/__prerendered/threatintel__tools__stix-bundles'],
  ['/threatintel/tools/actionable-iocs', '/__prerendered/threatintel__tools__actionable-iocs'],
  ['/threatintel/ioc-feeds', '/__prerendered/threatintel__ioc-feeds'],
  ['/threatintel/malware-sandbox', '/__prerendered/threatintel__malware-sandbox'],
  ['/threatintel/threat-actor-catalog', '/__prerendered/threatintel__threat-actor-catalog'],
  ['/threatintel/threat-landscape', '/__prerendered/threatintel__threat-landscape'],
  ['/threatintel/threat-actor-db', '/__prerendered/threatintel__threat-actor-db'],
  ['/threatintel/cti-dashboard', '/__prerendered/threatintel__cti-dashboard'],
  ['/threatintel/ti-dashboard', '/__prerendered/threatintel__ti-dashboard'],
  ['/dfir/copilot', '/__prerendered/dfir__copilot'],
  ['/dfir/orkl', '/__prerendered/dfir__orkl'],
  ['/dfir/wifi-investigation', '/__prerendered/dfir__wifi-investigation'],
  ['/dfir/traceix', '/__prerendered/dfir__traceix'],
  ['/dfir/winreg', '/__prerendered/dfir__winreg'],
  ['/dfir/fleet-map', '/__prerendered/dfir__fleet-map'],
  // ── Standalone SPA pages ──────────────────────────────────────
  ['/threatintel/external/cerast', '/__prerendered/threatintel__external__cerast'],
  ['/threatintel/external/threatmon', '/__prerendered/threatintel__external__threatmon'],
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
    // NotFound page, the React Router table). `max-age=0, must-revalidate`
    // makes the browser revalidate on every load; the asset layer's etag
    // returns 304 for unchanged shells (cheap) and 200 for new ones, so
    // a returning visitor never serves a stale shell that imports a
    // since-deleted chunk.
    h.set('cache-control', 'public, max-age=0, must-revalidate');
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
    // Same aggressive no-cache as the SPA shell — these are unknown
    // routes that render the wildcard NotFound component, which
    // itself changes on every deploy (e.g. "Did you mean"
    // suggestions, section grid). Users opening an old bookmark must
    // see the latest not-found experience, not a 24h-old version.
    h.set('cache-control', 'public, max-age=0, must-revalidate');
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
  headers.set('cache-control', 'public, max-age=0, must-revalidate');
  headers.set('x-ssr-source', 'prerendered');
  return new Response(ogRewritten.body, {
    status: ogRewritten.status,
    statusText: ogRewritten.statusText,
    headers,
  });
}
