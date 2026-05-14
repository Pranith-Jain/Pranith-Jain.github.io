import type { Post } from '../types';

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

export interface RenderRssInput {
  siteUrl: string;
}

export function renderRss(posts: Post[], { siteUrl }: RenderRssInput): string {
  const items = posts
    .map((p) => {
      const url = `${siteUrl}/blog/${p.slug}`;
      const pub = new Date(p.publishedAt).toUTCString();
      return `<item>
      <title>${xmlEscape(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pub}</pubDate>
      <category>${xmlEscape(p.type)}</category>
      <description>${xmlEscape(p.excerpt)}</description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Pranith Jain — Case Studies</title>
<link>${siteUrl}/blog</link>
<description>Cybersecurity case studies — CVEs, threat actors, malware, ransomware.</description>
<language>en</language>
${items}
</channel>
</rss>`;
}
