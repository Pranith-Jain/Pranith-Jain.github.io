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
  // Breach-focused feeds (added 2026-05-11) — used by /threatintel/breach
  'www.vpnmentor.com',
  'vpnmentor.com',
  'grcsolutions.io',
  'www.grcsolutions.io',
  'www.comparitech.com',
  'comparitech.com',
  'www.troyhunt.com',
  'troyhunt.com',
  'www.idtheftcenter.org',
  'idtheftcenter.org',
  // Feed expansion 2026-05-18 (kept in sync with feeds-aggregate.ts)
  'cyble.com',
  'www.cyble.com',
  'socradar.io',
  'www.socradar.io',
  'blog.bushidotoken.net',
  'www.rapid7.com',
  'rapid7.com',
  'blogs.jpcert.or.jp',
  'www.ncsc.gov.uk',
  'asec.ahnlab.com',
  'huggingface.co',
  'the-decoder.com',
  'importai.substack.com',
  // Same-origin synthesised feeds (e.g. MyThreatIntel ransomware → RSS)
  'pranithjain.qzz.io',
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
    // Manual redirect handling: an allow-listed host with an open redirect
    // (Google News, Reddit, raw.githubusercontent, …) could otherwise bounce
    // `redirect: 'follow'` to an arbitrary internal/external target,
    // defeating the allow-list. Re-validate every hop's host.
    const reqHeaders = {
      // Many feed origins (Akamai/Cloudflare-fronted, Reddit, etc.) block
      // generic bot UAs. Use a browser-like UA to maximise compatibility.
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) pranithjain-rss/1.0 Safari/537.36',
      accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
      'accept-language': 'en-US,en;q=0.9',
    };
    let current = parsed;
    let upstream: Response | null = null;
    for (let hop = 0; hop < 5; hop += 1) {
      upstream = await fetch(current.toString(), {
        redirect: 'manual',
        headers: reqHeaders,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (upstream.status < 300 || upstream.status >= 400) break;
      const location = upstream.headers.get('location');
      if (!location) break;
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return c.json({ error: 'upstream redirect to malformed url' }, 502);
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        return c.json({ error: `upstream redirect to unsupported protocol: ${next.protocol}` }, 403);
      }
      if (!ALLOWED_HOSTS.has(next.hostname.toLowerCase())) {
        return c.json({ error: `upstream redirect to non-allow-listed host: ${next.hostname}` }, 403);
      }
      current = next;
      if (hop === 4) return c.json({ error: 'too many redirects' }, 502);
    }
    if (!upstream) return c.json({ error: 'upstream fetch failed' }, 502);
    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get('retry-after') ?? '60';
      return c.json({ error: 'upstream_rate_limited', upstream: parsed.hostname, upstream_status: 429 }, 429, {
        'retry-after': retryAfter,
        'cache-control': 'no-store',
      });
    }
    if (!upstream.ok) {
      return c.json({ error: `upstream ${upstream.status}` }, 502);
    }
    const body = await upstream.text();
    // Never echo the upstream content-type verbatim: this endpoint is
    // same-origin, and an allow-listed raw-content host (e.g.
    // raw.githubusercontent.com) returning text/html would render as an
    // attacker page on our origin. Only pass through XML/JSON feed types;
    // anything else is served as inert text/plain.
    const upstreamCt = (upstream.headers.get('content-type') ?? '').toLowerCase();
    const safeCt = /(?:xml|rss|atom|json)/.test(upstreamCt)
      ? (upstreamCt.split(';')[0]?.trim() ?? 'text/plain; charset=utf-8')
      : 'text/plain; charset=utf-8';
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': safeCt,
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=300', // 5min cache hint
      },
    });
  } catch (err) {
    return c.json({ error: safeErrorMessage(c.env as unknown as Record<string, unknown>, err) }, 502);
  }
}
