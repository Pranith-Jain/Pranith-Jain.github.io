import { createRssRunner, type RssRunnerDeps } from './rss-util';

export type DiscoverDeps = RssRunnerDeps;

/** General cybersecurity news feeds. Deliberately excludes
 *  bleepingcomputer.com and thehackernews.com which are already
 *  covered by the intel and scam runners — avoids same-story
 *  duplication without relying solely on URL dedup. */
const FEEDS = [
  'https://therecord.media/feed/',
  'https://www.securityweek.com/feed/',
  'https://www.darkreading.com/rss.xml',
  'https://www.infosecurity-magazine.com/rss/news/',
  'https://cyberscoop.com/feed/',
  'https://www.csoonline.com/feed/',
  'https://www.zdnet.com/topic/security/rss.xml',
  'https://cybernews.com/feed/',
  'https://portswigger.net/daily-swig/rss',
  'https://www.scmagazine.com/feed',
  'https://www.cyberdaily.au/feed',
  'https://www.helpnetsecurity.com/feed/',
  'https://threatpost.com/feed/',
];

export const discoverCybersecNews = createRssRunner({
  type: 'news',
  feeds: FEEDS,
  windowMs: 7 * 24 * 3600 * 1000,
  sourceWeight: 0.6,
  rationaleLabel: 'Cybersec news',
  runnerName: 'discoverCybersecNews',
});
