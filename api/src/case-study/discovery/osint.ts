import { createRssRunner, type RssRunnerDeps } from './rss-util';

export type DiscoverDeps = RssRunnerDeps;

const FEEDS = [
  'https://www.bellingcat.com/feed/',
  'https://osintteam.blog/feed',
  'https://nixintel.info/feed/',
  'https://hatless1der.com/feed/',
  'https://osintcurio.us/feed/',
  'https://inteltechniques.com/blog/feed/',
  'https://medium.com/feed/@osint-blog',
  'https://sector035.nl/feed/',
  'https://www.secjuice.com/feed/',
  'https://blog.haschek.at/feed/',
  'https://www.alec.fyi/feed/',
  'https://blacklanternsecurity.com/feed/',
  'https://osint.team/feed/',
  'https://osintbureau.com/feed/',
  'https://webbreacher.com/feed/',
];

export const discoverOsint = createRssRunner({
  type: 'osint',
  feeds: FEEDS,
  windowMs: 7 * 24 * 3600 * 1000,
  sourceWeight: 0.6,
  rationaleLabel: 'OSINT tradecraft',
  runnerName: 'discoverOsint',
});
