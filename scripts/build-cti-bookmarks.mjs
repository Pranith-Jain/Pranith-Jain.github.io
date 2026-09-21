#!/usr/bin/env node
// Builds public/data/cti-bookmarks/index.json from the upstream
// Chick3nHawk01/Open_Source-CTI-Tooling cti-bookmarks.html (Netscape bookmark export).
// Replicates the si / threat-intel / osint pattern: slim index read at runtime
// through env.ASSETS — no public internet hop.
//
// Usage: node scripts/build-cti-bookmarks.mjs [--source <file-or-url>]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'data', 'cti-bookmarks');
const UPSTREAM_URL =
  'https://raw.githubusercontent.com/Chick3nHawk01/Open_Source-CTI-Tooling/main/cti-bookmarks.html';
const UPSTREAM_REPO = 'github.com/Chick3nHawk01/Open_Source-CTI-Tooling';

const LEVELS = new Set(['Operational', 'Tactical', 'Strategic', 'Tools']);
const SKIP_FOLDERS = new Set(['Bookmarks Bar', 'Bookmarks bar', 'Cyber Threat Intelligence']);

// Hostnames with a live integration in this platform (provider, MCP tool, or
// dedicated route/page). Everything else ships as a curated reference link.
// Kept as a curated map so the vertical doubles as the gap tracker.
const LIVE_HOSTS = new Map(
  [
    ['attack.mitre.org', 'mitre-attack'],
    ['d3fend.mitre.org', 'd3fend'],
    ['car.mitre.org', 'car'],
    ['capec.mitre.org', 'capec'],
    ['engage.mitre.org', 'engage'],
    ['mitre-attack.github.io', 'attack-navigator'],
    ['malpedia.caad.fkie.fraunhofer.de', 'malpedia'],
    ['apt.etda.or.th', 'etda-actors'],
    ['aptmap.netlify.app', 'aptmap'],
    ['ransomware.live', 'ransomware-live'],
    ['ransomlook.io', 'ransomlook'],
    ['ransomwhe.re', 'ransomwhere'],
    ['ransomwatch.telemetry.ltd', 'ransomwatch'],
    ['ransom.wiki', 'ransomwatch'],
    ['abuse.ch', 'abuse-ch'],
    ['threatfox.abuse.ch', 'threatfox'],
    ['urlhaus.abuse.ch', 'urlhaus'],
    ['feodotracker.abuse.ch', 'feodo'],
    ['sslbl.abuse.ch', 'sslbl'],
    ['hunting.abuse.ch', 'abuse-ch'],
    ['bazaar.abuse.ch', 'malwarebazaar'],
    ['misp-project.org', 'misp'],
    ['otx.alienvault.com', 'otx'],
    ['exchange.xforce.ibmcloud.com', 'reference'], // EOL 2026, paid-only API — archive link
    ['rules.emergingthreats.net', 'emerging-threats'],
    ['iplists.firehol.org', 'oss-feeds'],
    ['cinsarmy.com', 'cinsarmy'],
    ['labs.inquest.net', 'inquest'],
    ['botvrij.eu', 'botvrij'],
    ['check.torproject.org', 'tor'],
    ['opendata.rapid7.com', 'rapid7'],
    ['isc.sans.edu', 'dshield'],
    ['bleepingcomputer.com', 'cyber-news'],
    ['therecord.media', 'cyber-news'],
    ['thehackernews.com', 'cyber-news'],
    ['krebsonsecurity.com', 'cyber-news'],
    ['sigmahq.io', 'sigma'],
    ['github.com', 'github'],
    ['research.splunk.com', 'splunk'],
    ['tdm.socprime.com', 'socprime'],
    ['atomicredteam.io', 'atomic-red-team'],
    ['suricata.io', 'suricata'],
    ['lolbas-project.github.io', 'lolbas'],
    ['gtfobins.github.io', 'gtfobins'],
    ['loldrivers.io', 'loldrivers'],
    ['loobins.io', 'loobins'],
    ['lots-project.com', 'lots'],
    ['hijacklibs.net', 'hijacklibs'],
    ['malapi.io', 'malapi'],
    ['filesec.io', 'filesec'],
    ['wtfbins.wtf', 'wtfbins'],
    ['virustotal.com', 'virustotal'],
    ['urlscan.io', 'urlscan'],
    ['abuseipdb.com', 'abuseipdb'],
    ['ipvoid.com', 'apivoid'], // no own API — covered by APIVoid IP reputation
    ['urlvoid.com', 'apivoid'], // beta API moved to APIVoid domain reputation
    ['viz.greynoise.io', 'greynoise'],
    ['pulsedive.com', 'pulsedive'],
    ['opentip.kaspersky.com', 'kaspersky'],
    ['threatminer.org', 'threatminer'],
    ['criminalip.io', 'criminalip'],
    ['talosintelligence.com', 'talos'],
    ['check.spamhaus.org', 'spamhaus'],
    ['scamadviser.com', 'scamadviser'],
    ['ipqualityscore.com', 'ipqs'],
    ['radar.cloudflare.com', 'cloudflare-radar'],
    ['unfurl.link', 'unfurl'],
    ['ipinfo.io', 'ipinfo'],
    ['bgp.he.net', 'asn'],
    ['bgp.tools', 'asn'],
    ['securitytrails.com', 'securitytrails'],
    ['passivedns.mnemonic.no', 'passive-dns'],
    ['validin.com', 'validin'],
    ['explore.silentpush.com', 'silentpush'],
    ['dnsdumpster.com', 'dnsdumpster'],
    ['search.dnslytics.com', 'dnslytics'],
    ['viewdns.info', 'viewdns'],
    ['robtex.com', 'robtex'],
    ['whois.domaintools.com', 'domaintools'],
    ['who.is', 'whois'],
    ['whoxy.com', 'whoxy'],
    ['crt.sh', 'crtsh'],
    ['ssllabs.com', 'ssllabs'],
    ['dnstwister.report', 'dnstwister'],
    ['whoisds.com', 'whoisds'],
    ['publicsuffix.org', 'psl'],
    ['app.any.run', 'anyrun'],
    ['tria.ge', 'triage'],
    ['hybrid-analysis.com', 'hybrid-analysis'],
    ['joesandbox.com', 'joesandbox'],
    ['analyze.intezer.com', 'intezer'],
    ['metadefender.opswat.com', 'metadefender'],
    ['polyswarm.io', 'polyswarm'],
    ['malshare.com', 'malshare'],
    ['vx-underground.org', 'vx-underground'],
    ['remnux.org', 'remnux'],
    ['ghidra-sre.org', 'ghidra'],
    ['gchq.github.io', 'cyberchef'],
    ['nvd.nist.gov', 'nvd'],
    ['cve.org', 'cve'],
    ['cwe.mitre.org', 'cwe'],
    ['first.org', 'epss'],
    ['exploit-db.com', 'exploit-db'],
    ['vulners.com', 'vulners'],
    ['vuldb.com', 'vuldb'],
    ['osv.dev', 'osv'],
    ['zerodayinitiative.com', 'zdi'],
    ['opencve.io', 'opencve'],
    ['seclists.org', 'seclists'],
    ['haveibeenpwned.com', 'hibp'],
    ['dehashed.com', 'dehash'],
    ['intelx.io', 'intelx'],
    ['leakix.net', 'leakix'],
    ['dark.fail', 'darkfail'],
    ['oniontree.org', 'reference'], // dead since 2022 — historical link
    ['ahmia.fi', 'ahmia'],
    ['torproject.org', 'tor'],
    ['tails.net', 'tails'],
    ['shodan.io', 'shodan'],
    ['search.censys.io', 'censys'],
    ['app.netlas.io', 'netlas'],
    ['fofa.info', 'fofa'],
    ['osintframework.com', 'osint-framework'],
    ['maltego.com', 'maltego'],
    ['spiderfoot.net', 'spiderfoot'],
    ['whatsmyname.app', 'whatsmyname'],
    ['web.archive.org', 'wayback'],
    ['archive.ph', 'archive-today'],
    ['filigran.io', 'opencti'],
    ['thehive-project.org', 'thehive'],
    ['strangebee.com', 'cortex'],
    ['yeti-platform.io', 'reference'], // self-hosted TIP, no SaaS API
    ['cisa.gov', 'cisa-kev'],
    ['ncsc.gov.uk', 'ncsc'],
    ['enisa.europa.eu', 'enisa'],
    ['nist.gov', 'nist'],
    ['cisecurity.org', 'cis'],
    ['owasp.org', 'owasp'],
    ['oasis-open.github.io', 'stix'],
    ['verisframework.org', 'veris'],
    ['nomoreransom.org', 'ransomware-hub'],
    ['id-ransomware.malwarehunterteam.com', 'ransomware-hub'],
    ['openphish.com', 'openphish'],
    ['phishtank.com', 'phishtank'],
    ['phishunt.io', 'phishunt'],
    ['emailrep.io', 'emailrep'],
    ['mxtoolbox.com', 'mxtoolbox'],
    ['mha.azurewebsites.net', 'mha'],
  ].map(([h, v]) => [h.toLowerCase(), v]),
);

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'link';
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function platformStatusFor(url) {
  const host = hostnameOf(url);
  if (!host) return { status: 'reference', platformRef: null };
  for (const [key, ref] of LIVE_HOSTS) {
    if (host === key || host.endsWith(`.${key}`)) {
      // null ref + explicit reference host = curated link surface only
      // (ExternalResources / docs), no live data integration possible
      // (dead upstream, EOL product, or self-hosted with no SaaS API).
      if (ref === 'reference') return { status: 'reference', platformRef: 'external-resources' };
      return ref ? { status: 'live', platformRef: ref } : { status: 'missing', platformRef: null };
    }
  }
  if (host.endsWith('github.com') || host.endsWith('github.io')) {
    return { status: 'reference', platformRef: 'github' };
  }
  return { status: 'reference', platformRef: null };
}

function parseBookmarks(html) {
  const entries = [];
  const categories = new Map(); // "Level || Category" -> { level, category, count }
  const seenSlugs = new Set();
  let level = null;
  let category = null;

  const tagRe = /<(H3|A)\b([^>]*)>(.*?)<\/\1>/gis;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1].toUpperCase();
    const attrs = m[2] || '';
    const inner = decodeEntities((m[3] || '').trim());
    if (tag === 'H3') {
      const name = inner.replace(/\s+/g, ' ').trim();
      if (LEVELS.has(name)) {
        level = name;
        category = null;
      } else if (!SKIP_FOLDERS.has(name) && name) {
        category = name;
      }
    } else if (tag === 'A') {
      const hrefM = /HREF="([^"]+)"/i.exec(attrs);
      const url = hrefM ? hrefM[1] : '';
      if (!url || !url.startsWith('http')) continue;
      const parts = inner.split('\\\\').map((s) => s.trim());
      const name = (parts[0] || url).replace(/\s+/g, ' ').trim();
      const description = parts.slice(1).join(' — ').replace(/\s+/g, ' ').trim();
      const base = slugify(name) || slugify(hostnameOf(url));
      let slug = base;
      let n = 2;
      while (seenSlugs.has(slug)) slug = `${base}-${n++}`;
      seenSlugs.add(slug);
      const lvl = level || 'Tools';
      const cat = category || 'Uncategorized';
      const key = `${lvl} || ${cat}`;
      if (!categories.has(key)) categories.set(key, { level: lvl, category: cat, count: 0 });
      categories.get(key).count += 1;
      const { status, platformRef } = platformStatusFor(url);
      entries.push({
        slug,
        name: name.slice(0, 160),
        url,
        host: hostnameOf(url),
        level: lvl,
        category: cat,
        description: description.slice(0, 300),
        status,
        platformRef,
        tags: Array.from(
          new Set(
            [lvl.toLowerCase(), ...cat.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)].slice(0, 6),
          ),
        ),
      });
    }
  }
  return { entries, categories: [...categories.values()] };
}

async function loadSource() {
  const argIdx = process.argv.indexOf('--source');
  const override = argIdx !== -1 ? process.argv[argIdx + 1] : null;
  if (override) {
    if (/^https?:\/\//.test(override)) {
      const res = await fetch(override);
      if (!res.ok) throw new Error(`fetch ${override}: HTTP ${res.status}`);
      return await res.text();
    }
    return readFileSync(override, 'utf8');
  }
  const res = await fetch(UPSTREAM_URL);
  if (!res.ok) throw new Error(`fetch upstream: HTTP ${res.status}`);
  return await res.text();
}

const html = await loadSource();
const { entries, categories } = parseBookmarks(html);
if (entries.length < 100) {
  throw new Error(`parse yielded only ${entries.length} entries — upstream format changed?`);
}
mkdirSync(OUT, { recursive: true });
const index = {
  source: UPSTREAM_REPO,
  license: 'upstream-collection (links only; no vendored content)',
  replicatedAt: new Date().toISOString().slice(0, 10),
  count: entries.length,
  levels: [...new Set(entries.map((e) => e.level))].sort(),
  categories,
  statusCounts: {
    live: entries.filter((e) => e.status === 'live').length,
    reference: entries.filter((e) => e.status === 'reference').length,
    missing: entries.filter((e) => e.status === 'missing').length,
  },
  entries,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log('✔ Built CTI bookmarks manifest:');
console.log(`    ${entries.length} bookmarks, ${categories.length} categories`);
console.log(
  `    live=${index.statusCounts.live} reference=${index.statusCounts.reference} missing=${index.statusCounts.missing}`,
);
