import { createRssRunner, type RssRunnerDeps } from './rss-util';

export type DiscoverDeps = RssRunnerDeps;

/** Methodology/thought-leadership content is more evergreen than
 *  breaking news — use a 14-day window so slower-publishing sources
 *  (SANS, Mandiant deep-dives) don't get systematically excluded. */
const FEEDS = [
  'https://www.mandiant.com/resources/blog/rss.xml',
  'https://www.crowdstrike.com/blog/feed/',
  'https://www.recordedfuture.com/blog/rss.xml',
  'https://www.sans.org/security-awareness-training/feed/',
  'https://www.cybereason.com/blog/feed',
  'https://www.sentinelone.com/blog/feed/',
  'https://blogs.cisco.com/security/feed',
  'https://securityboulevard.com/feed/',
  'https://www.digitalshadows.com/blog/feed/',
  'https://www.socradar.io/feed/',
  'https://www.withsecure.com/en/blog/rss.xml',
  'https://www.trellix.com/about/newsroom/feed/',
  'https://blog.virustotal.com/feeds/posts/default',
  'https://blog.rapid7.com/feed/',
  'https://posts.specterops.io/feed',
  'https://labs.watchtowr.com/feed/',
  'https://blog.thinkst.com/feeds/posts/default',
];

export const discoverMethodology = createRssRunner({
  type: 'methodology',
  feeds: FEEDS,
  windowMs: 14 * 24 * 3600 * 1000,
  sourceWeight: 0.6,
  rationaleLabel: 'CTI methodology',
  runnerName: 'discoverMethodology',
});
