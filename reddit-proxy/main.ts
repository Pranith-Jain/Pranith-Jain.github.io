const ALLOWED_DOMAINS = ['www.reddit.com', 'old.reddit.com', 'reddit.com'];

function isAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_DOMAINS.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

interface RssItem {
  title: string;
  pubDate: string;
  link: string;
  author: string;
  content: string;
}

function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is');
      const x = r.exec(block);
      return x ? x[1].trim() : '';
    };
    const title = get('title');
    const pubDate = get('pubDate');
    const link = get('link');
    const author = get('author') || get('dc:creator');
    let content = get('content:encoded') || get('description');
    content = content.replace(/<[^>]+>/g, '').trim();
    if (title) items.push({ title, pubDate, link, author, content });
  }
  return items;
}

function parseAtomXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag: string) => {
      const r = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is');
      const x = r.exec(block);
      return x ? x[1].trim() : '';
    };
    const title = get('title');
    const pubDate = get('published') || get('updated');
    const linkMatch = /<link[^>]*href="([^"]*)"/.exec(block);
    const link = linkMatch ? linkMatch[1] : '';
    const author = (() => {
      const nameMatch = /<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/i.exec(block);
      return nameMatch ? nameMatch[1].trim() : '';
    })();
    let content = get('content') || get('summary');
    content = content.replace(/<[^>]+>/g, '').trim();
    if (title) items.push({ title, pubDate, link, author, content });
  }
  return items;
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const rssUrl = url.searchParams.get('rss_url');
  if (!rssUrl) {
    return new Response(JSON.stringify({ status: 'error', message: 'Missing rss_url' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!isAllowed(rssUrl)) {
    return new Response(JSON.stringify({ status: 'error', message: 'Domain not allowed' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const res = await fetch(rssUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml',
      },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ status: 'error', message: `HTTP ${res.status}` }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    const xml = await res.text();
    const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');
    const items = isAtom ? parseAtomXml(xml) : parseRssXml(xml);

    return new Response(JSON.stringify({ status: 'ok', feed: { url: rssUrl }, items }), {
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: 'error', message: String(err) }), {
      headers: { 'content-type': 'application/json' },
    });
  }
}

Deno.serve(handler);
