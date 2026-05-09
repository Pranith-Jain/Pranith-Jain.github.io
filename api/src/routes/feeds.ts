import type { Context } from 'hono';
import type { Env } from '../env';
import { safeErrorMessage } from '../lib/error';

const TIMEOUT_MS = 10_000;

const ALLOWED_HOSTS = new Set([
  // Government and CERT
  'www.cisa.gov',
  'cisa.gov',
  'nvd.nist.gov',
  'isc.sans.edu',
  'us-cert.cisa.gov',
  'cert.europa.eu',
  // Aggregators
  'feeds.feedburner.com',
  // News and journalism
  'threatpost.com',
  'krebsonsecurity.com',
  'thehackernews.com',
  'www.bleepingcomputer.com',
  'bleepingcomputer.com',
  'www.securityweek.com',
  'securityweek.com',
  'www.darkreading.com',
  'darkreading.com',
  'www.zdnet.com',
  'feeds.arstechnica.com',
  'arstechnica.com',
  'www.vice.com',
  'www.wired.com',
  'www.theregister.com',
  'www.schneier.com',
  // abuse.ch
  'threatfox.abuse.ch',
  'urlhaus.abuse.ch',
  'bazaar.abuse.ch',
  'mb-api.abuse.ch',
  'feodotracker.abuse.ch',
  'sslbl.abuse.ch',
  'openphish.com',
  'www.openphish.com',
  // DFIR Lab and Radar
  'dfir-lab.ch',
  'www.dfir-lab.ch',
  'falhumaid.github.io',
  // Vendor research
  'blog.talosintelligence.com',
  'talosintelligence.com',
  'unit42.paloaltonetworks.com',
  'www.welivesecurity.com',
  'welivesecurity.com',
  'securelist.com',
  'www.securelist.com',
  'www.crowdstrike.com',
  'crowdstrike.com',
  'www.sentinelone.com',
  'sentinelone.com',
  'flashpoint.io',
  'www.flashpoint.io',
  'feeds.fireeye.com',
  'www.microsoft.com',
  'msrc-blog.microsoft.com',
  'googleprojectzero.blogspot.com',
  'cloud.google.com',
  'research.checkpoint.com',
  'www.trendmicro.com',
  'news.sophos.com',
  'blog.malwarebytes.com',
  'www.volexity.com',
  'www.huntress.com',
  'redcanary.com',
  // Researcher blogs
  'www.malware-traffic-analysis.net',
  'doublepulsar.com',
  'www.hackmageddon.com',
  'www.infostealers.com',
  'medium.com',
  // Dark web and ransomware trackers
  'darkwebinformer.com',
  'ransomware.live',
  'www.databreaches.net',
  'thedfirreport.com',
  'therecord.media',
  'www.curatedintel.org',
  'www.cyfirma.com',
  // Reddit RSS
  'www.reddit.com',
  'reddit.com',
  'old.reddit.com',
  // Hacker News and YC
  'hnrss.org',
  'news.ycombinator.com',
  'www.ycombinator.com',
  'ycombinator.com',
  // Late additions: probed and confirmed accessible
  'rss.packetstormsecurity.com',
  'otx.alienvault.com',
  'www.helpnetsecurity.com',
  'www.csoonline.com',
  'www.cvedetails.com',
  'www.exploit-db.com',
  'raw.githubusercontent.com',
  // Scam Watch sources
  'consumer.ftc.gov',
  'www.ic3.gov',
  'ic3.gov',
  'www.snopes.com',
  'snopes.com',
  'news.google.com',
  'rekt.news',
  'www.web3isgoinggreat.com',
  'web3isgoinggreat.com',
  // Industry / fundraising / Tech & AI
  'techcrunch.com',
  'www.techcrunch.com',
  'venturebeat.com',
  'www.venturebeat.com',
  'www.theverge.com',
  'theverge.com',
  'feeds.arstechnica.com',
  'arstechnica.com',
  'www.technologyreview.com',
  'technologyreview.com',
  'openai.com',
  'www.openai.com',
  'blog.google',
]);

export async function feedProxyHandler(c: Context<{ Bindings: Env }>) {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'missing url' }, 400);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ error: 'invalid url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: 'unsupported protocol' }, 400);
  }
  // Allow-list to prevent SSRF / abuse
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    return c.json({ error: `host not in allow-list: ${parsed.hostname}` }, 403);
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: {
        // Many feed origins (Akamai-fronted, Cloudflare-fronted, Reddit, etc.) block
        // generic bot UAs with 403/429. Use a browser-like UA to maximise compatibility.
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) pranithjain-rss/1.0 Safari/537.36',
        accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
        'accept-language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!upstream.ok) {
      return c.json({ error: `upstream ${upstream.status}` }, 502);
    }
    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/xml',
        'cache-control': 'public, max-age=300', // 5min cache hint
      },
    });
  } catch (err) {
    return c.json({ error: safeErrorMessage(c.env as unknown as Record<string, unknown>, err) }, 502);
  }
}
