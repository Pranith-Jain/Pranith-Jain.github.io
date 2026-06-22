import { createRssRunner, type RssRunnerDeps } from './rss-util';

export type DiscoverDeps = RssRunnerDeps;

/** Cybersecurity tool releases, pentest utilities, and practical
 *  offensive-security walkthroughs. Excludes deep-dive threat research
 *  blogs (Rapid7, SpecterOps, WatchTowr) — those belong in methodology. */
const FEEDS = [
  'https://www.kitploit.com/feeds/posts/default',
  'https://kalilinuxtutorials.com/feed/',
  'https://www.darknet.org.uk/feed/',
  'https://www.hackingarticles.in/feed/',
  'https://pentesttools.net/feed/',
  'https://gbhackers.com/feed/',
  'https://blog.detectify.com/feed/',
  'https://www.blackhillsinfosec.com/feed/',
  'https://blog.holdmybeersecurity.com/feed/',
  'https://www.offsec.com/feed.xml',
  'https://blog.secureideas.com/feed/',
];

export const discoverTools = createRssRunner({
  type: 'tool',
  feeds: FEEDS,
  windowMs: 7 * 24 * 3600 * 1000,
  sourceWeight: 0.6,
  rationaleLabel: 'Cybersec tool',
  runnerName: 'discoverTools',
});
