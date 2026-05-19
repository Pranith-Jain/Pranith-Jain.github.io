// Vendor threat-intel RSS feeds scanned for actor mentions.
// These are public feeds — no auth required.
export const ACTOR_RSS_FEEDS: string[] = [
  'https://www.mandiant.com/resources/blog/rss.xml',
  'https://www.crowdstrike.com/blog/feed/',
  'https://www.microsoft.com/en-us/security/blog/feed/',
  'https://blog.talosintelligence.com/feed/',
  // Broadened 2026-05-19: more actor/APT research surface so the `actor`
  // topic has a deeper, more varied candidate pool. All aggregator-proven
  // free feeds (mirror src/data/rssFeeds.ts).
  'https://unit42.paloaltonetworks.com/feed/',
  'https://securelist.com/feed/',
  'https://www.welivesecurity.com/feed/',
  'https://www.sentinelone.com/labs/feed/',
  'https://redcanary.com/feed/',
  'https://thedfirreport.com/feed/',
];

export const SITE_URL = 'https://pranithjain.qzz.io';
