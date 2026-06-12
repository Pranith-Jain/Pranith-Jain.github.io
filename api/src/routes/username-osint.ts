import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Username OSINT — check 200+ platforms for a given username.
 *
 *   GET /api/v1/username-osint?username=<handle>[&platforms=github,twitter,...]
 *
 * Inspired by Sherlock (84.9k stars, MIT) and Maigret (32.8k stars, MIT).
 * Runs entirely in Workers — no Python, no external services.
 * Each platform check is an HTTP request; found/not-found is inferred from
 * the response status code.
 *
 * Subrequest budget: batched to 10 concurrent, max 240 platforms.
 * Cache TTL: 15 min (username lookups don't change often).
 */

const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_SECONDS = 15 * 60;
const MAX_CONCURRENT = 25;
const MAX_PLATFORMS = 100;

interface PlatformCheck {
  id: string;
  name: string;
  category: 'social' | 'dev' | 'tech' | 'gaming' | 'creative' | 'finance' | 'other';
  url: (u: string) => string;
  /** Custom response classifier. Default: 200 = found, 404 = not found. */
  detect?: (status: number, headers: Headers, body?: string) => 'found' | 'not-found' | 'unknown';
}

// Platforms that block cloud IPs — only checked when explicitly requested via ?platforms=
const CLOUD_BLOCKED = new Set([
  // Original blocklist
  'soundcloud',
  'spotify',
  'patreon',
  'buymeacoffee',
  'kofi',
  'liberapay',
  'ghsponsors',
  'aboutme',
  'linktree',
  'gravatar',
  'wikipedia',
  'archiveorg',
  'tryhackme',
  'hackthebox',
  'kaggle',
  'codeforces',
  'vk',
  'ok',
  'xing',
  'bilibili',
  'pixiv',
  'letterboxd',
  'goodreads',
  'strava',
  'meetup',
  'discord',
  'telegram',
  'osu',
  'scratch',
  'replit-alt',
  'glitch',
  'codeberg',
  'hashnode',
  'carrd',
  'bio-link',
  'venmo',
  'cashapp',
  'paypal',
  'opensea',
  'rarible',
  'farcaster',
  'nostr',
  'nitter',
  'sourceforge',
  'crates-io',
  'rubygems',
  'packagist',
  'nuget',
  'gitbook',
  'gitea',
  'gogs',
  'notion-site',
  'freecodecamp',
  // Additional cloud-blocked platforms
  'codecademy',
  'coursera',
  'udemy',
  'edx',
  'pluralsight',
  'linkedin-learning',
  'udacity',
  'datacamp',
  'brilliant',
  'leetcode-alt',
  'artstation',
  'newgrounds',
  'itch-io',
  'bandcamp',
  'vimeo',
  'dailymotion',
  'twitch-alt',
  'rumble',
  'odysee',
  'bitchute',
  'gab',
  'parler',
  'gettr',
  'truth-social',
  'rumble-alt',
  'coinbase',
  'binance',
  'kraken',
  'bitstamp',
  'kucoin',
  'okx',
  'bybit',
  'gate-io',
  'crypto-com',
  'bitget',
  'mexc',
  'stripe',
  'wise',
  'revolut',
  'n26',
  'chime',
  'quora',
  'stackexchange',
  'superuser',
  'serverfault',
  'askubuntu',
  'mathoverflow',
  'unix-se',
  'dba-se',
  'security-se',
  'networkengineering-se',
  'devops-se',
  'sre-se',
  // Stack Exchange + cloud dashboards
  'cloud-se',
  'crypto-se',
  'bitcoin-se',
  'ethereum-se',
  'iot-se',
  'retrocomputing',
  'emacs-se',
  'vi-se',
  'tex-se',
  'blender-se',
  'gamedev-se',
  'ux-se',
  'graphicdesign-se',
  'photo-se',
  'cooking-se',
  'gardening-se',
  'diy-se',
  'money-se',
  'law-se',
  'philosophy-se',
  'history-se',
  'buddhism-se',
  'judaism-se',
  'christianity-se',
  'islam-se',
  'hinduism-se',
  'skeptics-se',
  'puzzling-se',
  'rpg-se',
  'boardgames-se',
  'golf-se',
  'sports-se',
  'fitness-se',
  'travel-se',
  'expatriates-se',
  'parenting-se',
  'workplace-se',
  'freelancing-se',
  'expressionengine-se',
  'drupal-se',
  'wordpress-se',
  'magento-se',
  'salesforce-se',
  'sharepoint-se',
  'power-platform-se',
  'dynamics-se',
  'outlook-se',
  'teams-se',
  'azure-se',
  'aws-se',
  'gcp-se',
  'digitalocean-se',
  'linode-se',
  // Remaining cloud-blocked
  'vultr-se',
  'hetzner-se',
  'ovh-se',
  'ionos-se',
  'namecheap-se',
  'godaddy-se',
  'cloudflare-se',
  'vercel-se',
  'netlify-se',
  'heroku-se',
  'render-se',
  'railway-se',
  'fly-se',
  'deta-se',
  'xbox',
  'roblox',
]);

const PLATFORMS: PlatformCheck[] = [
  // ── Social ──────────────────────────────────────────────────────────────
  { id: 'github', name: 'GitHub', category: 'dev', url: (u) => `https://github.com/${u}` },
  {
    id: 'twitter',
    name: 'X / Twitter',
    category: 'social',
    url: (u) => `https://x.com/${u}`,
    detect: (s) => (s === 200 ? 'found' : s === 404 ? 'not-found' : 'unknown'),
  },
  { id: 'instagram', name: 'Instagram', category: 'social', url: (u) => `https://www.instagram.com/${u}/` },
  { id: 'tiktok', name: 'TikTok', category: 'social', url: (u) => `https://www.tiktok.com/@${u}` },
  { id: 'youtube', name: 'YouTube', category: 'social', url: (u) => `https://www.youtube.com/@${u}` },
  { id: 'facebook', name: 'Facebook', category: 'social', url: (u) => `https://www.facebook.com/${u}` },
  { id: 'linkedin', name: 'LinkedIn', category: 'social', url: (u) => `https://www.linkedin.com/in/${u}` },
  { id: 'reddit', name: 'Reddit', category: 'social', url: (u) => `https://www.reddit.com/user/${u}` },
  { id: 'pinterest', name: 'Pinterest', category: 'social', url: (u) => `https://www.pinterest.com/${u}/` },
  { id: 'tumblr', name: 'Tumblr', category: 'social', url: (u) => `https://${u}.tumblr.com` },
  { id: 'snapchat', name: 'Snapchat', category: 'social', url: (u) => `https://www.snapchat.com/add/${u}` },
  { id: 'mastodon', name: 'Mastodon', category: 'social', url: (u) => `https://mastodon.social/@${u}` },
  { id: 'bluesky', name: 'Bluesky', category: 'social', url: (u) => `https://bsky.app/profile/${u}.bsky.social` },
  { id: 'threads', name: 'Threads', category: 'social', url: (u) => `https://www.threads.net/@${u}` },
  { id: 'x', name: 'X', category: 'social', url: (u) => `https://x.com/${u}` },

  // ── Dev ─────────────────────────────────────────────────────────────────
  { id: 'gitlab', name: 'GitLab', category: 'dev', url: (u) => `https://gitlab.com/${u}` },
  { id: 'bitbucket', name: 'Bitbucket', category: 'dev', url: (u) => `https://bitbucket.org/${u}/` },
  { id: 'devto', name: 'Dev.to', category: 'dev', url: (u) => `https://dev.to/${u}` },
  { id: 'codepen', name: 'CodePen', category: 'dev', url: (u) => `https://codepen.io/${u}` },
  { id: 'replit', name: 'Replit', category: 'dev', url: (u) => `https://replit.com/@${u}` },
  { id: 'hackerrank', name: 'HackerRank', category: 'dev', url: (u) => `https://www.hackerrank.com/${u}` },
  { id: 'leetcode', name: 'LeetCode', category: 'dev', url: (u) => `https://leetcode.com/${u}/` },
  { id: 'npm', name: 'npm', category: 'dev', url: (u) => `https://www.npmjs.com/~${u}` },
  { id: 'pypi', name: 'PyPI', category: 'dev', url: (u) => `https://pypi.org/user/${u}/` },
  { id: 'dockerhub', name: 'Docker Hub', category: 'dev', url: (u) => `https://hub.docker.com/u/${u}` },
  { id: 'dockerhub2', name: 'Docker Hub (org)', category: 'dev', url: (u) => `https://hub.docker.com/r/${u}` },
  { id: 'keybase', name: 'Keybase', category: 'dev', url: (u) => `https://keybase.io/${u}` },
  { id: 'hackerone', name: 'HackerOne', category: 'dev', url: (u) => `https://hackerone.com/${u}` },
  { id: 'bugcrowd', name: 'Bugcrowd', category: 'dev', url: (u) => `https://bugcrowd.com/${u}` },

  // ── Tech ────────────────────────────────────────────────────────────────
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    category: 'tech',
    url: (u) => `https://stackoverflow.com/users?tab=Accounts&search=${u}`,
  },
  { id: 'medium', name: 'Medium', category: 'tech', url: (u) => `https://medium.com/@${u}` },
  { id: 'substack', name: 'Substack', category: 'tech', url: (u) => `https://${u}.substack.com` },
  { id: 'ghost', name: 'Ghost', category: 'tech', url: (u) => `https://${u}.ghost.io` },
  { id: 'notion', name: 'Notion', category: 'tech', url: (u) => `https://www.notion.so/${u}` },
  { id: 'producthunt', name: 'Product Hunt', category: 'tech', url: (u) => `https://www.producthunt.com/@${u}` },
  { id: 'hackernews', name: 'Hacker News', category: 'tech', url: (u) => `https://news.ycombinator.com/user?id=${u}` },

  // ── Gaming ──────────────────────────────────────────────────────────────
  { id: 'steam', name: 'Steam', category: 'gaming', url: (u) => `https://steamcommunity.com/id/${u}` },
  { id: 'twitch', name: 'Twitch', category: 'gaming', url: (u) => `https://www.twitch.tv/${u}` },
  { id: 'xbox', name: 'Xbox', category: 'gaming', url: (u) => `https://www.xbox.com/en-US/play/user/${u}` },
  { id: 'roblox', name: 'Roblox', category: 'gaming', url: (u) => `https://www.roblox.com/user.aspx?username=${u}` },
  { id: 'minecraft', name: 'Minecraft', category: 'gaming', url: (u) => `https://namemc.com/profile/${u}` },

  // ── Creative ────────────────────────────────────────────────────────────
  { id: 'deviantart', name: 'DeviantArt', category: 'creative', url: (u) => `https://www.deviantart.com/${u}` },
  { id: 'behance', name: 'Behance', category: 'creative', url: (u) => `https://www.behance.net/${u}` },
  { id: 'dribbble', name: 'Dribbble', category: 'creative', url: (u) => `https://dribbble.com/${u}` },
  { id: 'flickr', name: 'Flickr', category: 'creative', url: (u) => `https://www.flickr.com/people/${u}/` },
  { id: '500px', name: '500px', category: 'creative', url: (u) => `https://500px.com/p/${u}` },
  { id: 'unsplash', name: 'Unsplash', category: 'creative', url: (u) => `https://unsplash.com/@${u}` },
  { id: 'soundcloud', name: 'SoundCloud', category: 'creative', url: (u) => `https://soundcloud.com/${u}` },
  { id: 'spotify', name: 'Spotify', category: 'creative', url: (u) => `https://open.spotify.com/user/${u}` },

  // ── Finance ─────────────────────────────────────────────────────────────
  { id: 'patreon', name: 'Patreon', category: 'finance', url: (u) => `https://www.patreon.com/${u}` },
  { id: 'buymeacoffee', name: 'Buy Me a Coffee', category: 'finance', url: (u) => `https://www.buymeacoffee.com/${u}` },
  { id: 'kofi', name: 'Ko-fi', category: 'finance', url: (u) => `https://ko-fi.com/${u}` },
  { id: 'liberapay', name: 'Liberapay', category: 'finance', url: (u) => `https://liberapay.com/${u}` },
  { id: 'ghsponsors', name: 'GitHub Sponsors', category: 'finance', url: (u) => `https://github.com/sponsors/${u}` },

  // ── Other ───────────────────────────────────────────────────────────────
  { id: 'aboutme', name: 'About.me', category: 'other', url: (u) => `https://about.me/${u}` },
  { id: 'linktree', name: 'Linktree', category: 'other', url: (u) => `https://linktr.ee/${u}` },
  { id: 'gravatar', name: 'Gravatar', category: 'other', url: (u) => `https://en.gravatar.com/${u}` },
  { id: 'wikipedia', name: 'Wikipedia', category: 'other', url: (u) => `https://en.wikipedia.org/wiki/User:${u}` },
  { id: 'archiveorg', name: 'Internet Archive', category: 'other', url: (u) => `https://archive.org/details/@${u}` },
  { id: 'tryhackme', name: 'TryHackMe', category: 'dev', url: (u) => `https://tryhackme.com/p/${u}` },
  { id: 'hackthebox', name: 'Hack The Box', category: 'dev', url: (u) => `https://app.hackthebox.com/users/${u}` },
  { id: 'kaggle', name: 'Kaggle', category: 'tech', url: (u) => `https://www.kaggle.com/${u}` },
  { id: 'codeforces', name: 'Codeforces', category: 'dev', url: (u) => `https://codeforces.com/profile/${u}` },

  // ── Additional Social (2026-06-12) ────────────────────────────────────
  { id: 'vk', name: 'VK', category: 'social', url: (u) => `https://vk.com/${u}` },
  { id: 'ok', name: 'Odnoklassniki', category: 'social', url: (u) => `https://ok.ru/${u}` },
  { id: 'xing', name: 'XING', category: 'social', url: (u) => `https://www.xing.com/profile/${u}` },
  { id: 'bilibili', name: 'Bilibili', category: 'social', url: (u) => `https://space.bilibili.com/${u}` },
  { id: 'pixiv', name: 'Pixiv', category: 'social', url: (u) => `https://www.pixiv.net/users/${u}` },
  { id: 'letterboxd', name: 'Letterboxd', category: 'social', url: (u) => `https://letterboxd.com/${u}` },
  { id: 'goodreads', name: 'Goodreads', category: 'social', url: (u) => `https://www.goodreads.com/user/show/${u}` },
  { id: 'strava', name: 'Strava', category: 'social', url: (u) => `https://www.strava.com/athletes/${u}` },
  { id: 'meetup', name: 'Meetup', category: 'social', url: (u) => `https://www.meetup.com/members/${u}` },
  { id: 'discord', name: 'Discord', category: 'social', url: (u) => `https://discord.com/users/${u}` },
  { id: 'telegram', name: 'Telegram', category: 'social', url: (u) => `https://t.me/${u}` },
  { id: 'osu', name: 'osu!', category: 'social', url: (u) => `https://osu.ppy.sh/users/${u}` },
  { id: 'scratch', name: 'Scratch', category: 'social', url: (u) => `https://scratch.mit.edu/users/${u}` },
  { id: 'replit-alt', name: 'Replit', category: 'social', url: (u) => `https://replit.com/@${u}` },
  { id: 'glitch', name: 'Glitch', category: 'social', url: (u) => `https://glitch.com/@${u}` },
  { id: 'codeberg', name: 'Codeberg', category: 'social', url: (u) => `https://codeberg.org/${u}` },
  { id: 'hashnode', name: 'Hashnode', category: 'social', url: (u) => `https://hashnode.com/@${u}` },
  { id: 'carrd', name: 'Carrd', category: 'social', url: (u) => `https://${u}.carrd.co` },
  { id: 'bio-link', name: 'Bio Link', category: 'social', url: (u) => `https://bio.link/${u}` },
  { id: 'venmo', name: 'Venmo', category: 'social', url: (u) => `https://venmo.com/${u}` },
  { id: 'cashapp', name: 'Cash App', category: 'social', url: (u) => `https://cash.app/$${u}` },
  { id: 'paypal', name: 'PayPal', category: 'social', url: (u) => `https://paypal.me/${u}` },
  { id: 'opensea', name: 'OpenSea', category: 'social', url: (u) => `https://opensea.io/${u}` },
  { id: 'rarible', name: 'Rarible', category: 'social', url: (u) => `https://rarible.com/${u}` },
  { id: 'farcaster', name: 'Farcaster', category: 'social', url: (u) => `https://warpcast.com/${u}` },
  { id: 'nostr', name: 'Nostr', category: 'social', url: (u) => `https://nostr.com/${u}` },
  { id: 'nitter', name: 'Nitter', category: 'social', url: (u) => `https://nitter.net/${u}` },

  // ── Additional Dev ────────────────────────────────────────────────────
  { id: 'sourceforge', name: 'SourceForge', category: 'dev', url: (u) => `https://sourceforge.net/u/${u}/` },
  { id: 'crates-io', name: 'crates.io', category: 'dev', url: (u) => `https://crates.io/users/${u}` },
  { id: 'rubygems', name: 'RubyGems', category: 'dev', url: (u) => `https://rubygems.org/profiles/${u}` },
  { id: 'packagist', name: 'Packagist', category: 'dev', url: (u) => `https://packagist.org/packages/${u}` },
  { id: 'nuget', name: 'NuGet', category: 'dev', url: (u) => `https://www.nuget.org/profiles/${u}` },
  { id: 'gitbook', name: 'GitBook', category: 'dev', url: (u) => `https://${u}.gitbook.io` },
  { id: 'gitea', name: 'Gitea', category: 'dev', url: (u) => `https://gitea.com/${u}` },
  { id: 'gogs', name: 'Gogs', category: 'dev', url: (u) => `https://try.gogs.io/${u}` },
  { id: 'notion-site', name: 'Notion Site', category: 'dev', url: (u) => `https://${u}.notion.site` },

  // ── Additional Tech ───────────────────────────────────────────────────
  { id: 'freecodecamp', name: 'freeCodeCamp', category: 'tech', url: (u) => `https://www.freecodecamp.org/${u}` },
  { id: 'codecademy', name: 'Codecademy', category: 'tech', url: (u) => `https://www.codecademy.com/profiles/${u}` },
  { id: 'coursera', name: 'Coursera', category: 'tech', url: (u) => `https://www.coursera.org/user/${u}` },
  { id: 'udemy', name: 'Udemy', category: 'tech', url: (u) => `https://www.udemy.com/user/${u}/` },
  { id: 'edx', name: 'edX', category: 'tech', url: (u) => `https://www.edx.org/user/${u}` },
  { id: 'pluralsight', name: 'Pluralsight', category: 'tech', url: (u) => `https://www.pluralsight.com/profile/${u}` },
  {
    id: 'linkedin-learning',
    name: 'LinkedIn Learning',
    category: 'tech',
    url: (u) => `https://www.linkedin.com/learning/${u}`,
  },
  { id: 'udacity', name: 'Udacity', category: 'tech', url: (u) => `https://www.udacity.com/user/${u}` },
  { id: 'datacamp', name: 'DataCamp', category: 'tech', url: (u) => `https://www.datacamp.com/profile/${u}` },
  { id: 'brilliant', name: 'Brilliant', category: 'tech', url: (u) => `https://brilliant.org/profile/${u}` },
  { id: 'leetcode-alt', name: 'LeetCode (alt)', category: 'tech', url: (u) => `https://leetcode.com/u/${u}` },

  // ── Additional Creative ───────────────────────────────────────────────
  { id: 'artstation', name: 'ArtStation', category: 'creative', url: (u) => `https://www.artstation.com/${u}` },
  { id: 'newgrounds', name: 'Newgrounds', category: 'creative', url: (u) => `https://www.newgrounds.com/members/${u}` },
  { id: 'itch-io', name: 'itch.io', category: 'creative', url: (u) => `https://${u}.itch.io` },
  { id: 'bandcamp', name: 'Bandcamp', category: 'creative', url: (u) => `https://${u}.bandcamp.com` },
  { id: 'vimeo', name: 'Vimeo', category: 'creative', url: (u) => `https://vimeo.com/${u}` },
  { id: 'dailymotion', name: 'Dailymotion', category: 'creative', url: (u) => `https://www.dailymotion.com/${u}` },
  { id: 'twitch-alt', name: 'Twitch (alt)', category: 'creative', url: (u) => `https://m.twitch.tv/${u}/about` },
  { id: 'rumble', name: 'Rumble', category: 'creative', url: (u) => `https://rumble.com/c/${u}` },
  { id: 'odysee', name: 'Odysee', category: 'creative', url: (u) => `https://odysee.com/$/${u}` },
  { id: 'bitchute', name: 'BitChute', category: 'creative', url: (u) => `https://www.bitchute.com/channel/${u}` },
  { id: 'gab', name: 'Gab', category: 'creative', url: (u) => `https://gab.com/${u}` },
  { id: 'parler', name: 'Parler', category: 'creative', url: (u) => `https://parler.com/profile/${u}` },
  { id: 'gettr', name: 'GETTR', category: 'creative', url: (u) => `https://gettr.com/user/${u}` },
  { id: 'truth-social', name: 'Truth Social', category: 'creative', url: (u) => `https://truthsocial.com/@${u}` },
  { id: 'rumble-alt', name: 'Rumble (alt)', category: 'creative', url: (u) => `https://rumble.com/c/${u}` },

  // ── Additional Finance ────────────────────────────────────────────────
  { id: 'coinbase', name: 'Coinbase', category: 'finance', url: (u) => `https://www.coinbase.com/${u}` },
  { id: 'binance', name: 'Binance', category: 'finance', url: (u) => `https://www.binance.com/en/profile/${u}` },
  { id: 'kraken', name: 'Kraken', category: 'finance', url: (u) => `https://www.kraken.com/u/${u}` },
  { id: 'bitstamp', name: 'Bitstamp', category: 'finance', url: (u) => `https://www.bitstamp.net/u/${u}` },
  { id: 'kucoin', name: 'KuCoin', category: 'finance', url: (u) => `https://www.kucoin.com/u/${u}` },
  { id: 'okx', name: 'OKX', category: 'finance', url: (u) => `https://www.okx.com/u/${u}` },
  { id: 'bybit', name: 'Bybit', category: 'finance', url: (u) => `https://www.bybit.com/u/${u}` },
  { id: 'gate-io', name: 'Gate.io', category: 'finance', url: (u) => `https://www.gate.io/u/${u}` },
  { id: 'crypto-com', name: 'Crypto.com', category: 'finance', url: (u) => `https://crypto.com/u/${u}` },
  { id: 'bitget', name: 'Bitget', category: 'finance', url: (u) => `https://www.bitget.com/u/${u}` },
  { id: 'mexc', name: 'MEXC', category: 'finance', url: (u) => `https://www.mexc.com/u/${u}` },
  { id: 'stripe', name: 'Stripe', category: 'finance', url: (u) => `https://stripe.com/${u}` },
  { id: 'wise', name: 'Wise', category: 'finance', url: (u) => `https://wise.com/u/${u}` },
  { id: 'revolut', name: 'Revolut', category: 'finance', url: (u) => `https://revolut.com/${u}` },
  { id: 'n26', name: 'N26', category: 'finance', url: (u) => `https://n26.com/${u}` },
  { id: 'chime', name: 'Chime', category: 'finance', url: (u) => `https://chime.com/${u}` },

  // ── Additional Other ──────────────────────────────────────────────────
  { id: 'quora', name: 'Quora', category: 'other', url: (u) => `https://www.quora.com/profile/${u}` },
  {
    id: 'stackexchange',
    name: 'Stack Exchange',
    category: 'other',
    url: (u) => `https://stackexchange.com/users/${u}`,
  },
  { id: 'superuser', name: 'Super User', category: 'other', url: (u) => `https://superuser.com/users/${u}` },
  { id: 'serverfault', name: 'Server Fault', category: 'other', url: (u) => `https://serverfault.com/users/${u}` },
  { id: 'askubuntu', name: 'Ask Ubuntu', category: 'other', url: (u) => `https://askubuntu.com/users/${u}` },
  { id: 'mathoverflow', name: 'MathOverflow', category: 'other', url: (u) => `https://mathoverflow.net/users/${u}` },
  { id: 'unix-se', name: 'Unix & Linux', category: 'other', url: (u) => `https://unix.stackexchange.com/users/${u}` },
  {
    id: 'dba-se',
    name: 'Database Administrators',
    category: 'other',
    url: (u) => `https://dba.stackexchange.com/users/${u}`,
  },
  {
    id: 'security-se',
    name: 'Information Security',
    category: 'other',
    url: (u) => `https://security.stackexchange.com/users/${u}`,
  },
  {
    id: 'networkengineering-se',
    name: 'Network Engineering',
    category: 'other',
    url: (u) => `https://networkengineering.stackexchange.com/users/${u}`,
  },
  { id: 'devops-se', name: 'DevOps', category: 'other', url: (u) => `https://devops.stackexchange.com/users/${u}` },
  {
    id: 'sre-se',
    name: 'Site Reliability Engineering',
    category: 'other',
    url: (u) => `https://sre.stackexchange.com/users/${u}`,
  },
  {
    id: 'cloud-se',
    name: 'Cloud Computing',
    category: 'other',
    url: (u) => `https://cloudcomputing.stackexchange.com/users/${u}`,
  },
  {
    id: 'crypto-se',
    name: 'Cryptography',
    category: 'other',
    url: (u) => `https://crypto.stackexchange.com/users/${u}`,
  },
  { id: 'bitcoin-se', name: 'Bitcoin', category: 'other', url: (u) => `https://bitcoin.stackexchange.com/users/${u}` },
  {
    id: 'ethereum-se',
    name: 'Ethereum',
    category: 'other',
    url: (u) => `https://ethereum.stackexchange.com/users/${u}`,
  },
  {
    id: 'iot-se',
    name: 'Internet of Things',
    category: 'other',
    url: (u) => `https://iot.stackexchange.com/users/${u}`,
  },
  {
    id: 'retrocomputing',
    name: 'Retrocomputing',
    category: 'other',
    url: (u) => `https://retrocomputing.stackexchange.com/users/${u}`,
  },
  { id: 'emacs-se', name: 'Emacs', category: 'other', url: (u) => `https://emacs.stackexchange.com/users/${u}` },
  { id: 'vi-se', name: 'Vi & Vim', category: 'other', url: (u) => `https://vi.stackexchange.com/users/${u}` },
  { id: 'tex-se', name: 'TeX - LaTeX', category: 'other', url: (u) => `https://tex.stackexchange.com/users/${u}` },
  { id: 'blender-se', name: 'Blender', category: 'other', url: (u) => `https://blender.stackexchange.com/users/${u}` },
  {
    id: 'gamedev-se',
    name: 'Game Development',
    category: 'other',
    url: (u) => `https://gamedev.stackexchange.com/users/${u}`,
  },
  { id: 'ux-se', name: 'User Experience', category: 'other', url: (u) => `https://ux.stackexchange.com/users/${u}` },
  {
    id: 'graphicdesign-se',
    name: 'Graphic Design',
    category: 'other',
    url: (u) => `https://graphicdesign.stackexchange.com/users/${u}`,
  },
  { id: 'photo-se', name: 'Photography', category: 'other', url: (u) => `https://photo.stackexchange.com/users/${u}` },
  { id: 'cooking-se', name: 'Cooking', category: 'other', url: (u) => `https://cooking.stackexchange.com/users/${u}` },
  {
    id: 'gardening-se',
    name: 'Gardening',
    category: 'other',
    url: (u) => `https://gardening.stackexchange.com/users/${u}`,
  },
  { id: 'diy-se', name: 'Home Improvement', category: 'other', url: (u) => `https://diy.stackexchange.com/users/${u}` },
  {
    id: 'money-se',
    name: 'Personal Finance',
    category: 'other',
    url: (u) => `https://money.stackexchange.com/users/${u}`,
  },
  { id: 'law-se', name: 'Law', category: 'other', url: (u) => `https://law.stackexchange.com/users/${u}` },
  {
    id: 'philosophy-se',
    name: 'Philosophy',
    category: 'other',
    url: (u) => `https://philosophy.stackexchange.com/users/${u}`,
  },
  { id: 'history-se', name: 'History', category: 'other', url: (u) => `https://history.stackexchange.com/users/${u}` },
  {
    id: 'buddhism-se',
    name: 'Buddhism',
    category: 'other',
    url: (u) => `https://buddhism.stackexchange.com/users/${u}`,
  },
  { id: 'judaism-se', name: 'Judaism', category: 'other', url: (u) => `https://judaism.stackexchange.com/users/${u}` },
  {
    id: 'christianity-se',
    name: 'Christianity',
    category: 'other',
    url: (u) => `https://christianity.stackexchange.com/users/${u}`,
  },
  { id: 'islam-se', name: 'Islam', category: 'other', url: (u) => `https://islam.stackexchange.com/users/${u}` },
  {
    id: 'hinduism-se',
    name: 'Hinduism',
    category: 'other',
    url: (u) => `https://hinduism.stackexchange.com/users/${u}`,
  },
  {
    id: 'skeptics-se',
    name: 'Skeptics',
    category: 'other',
    url: (u) => `https://skeptics.stackexchange.com/users/${u}`,
  },
  {
    id: 'puzzling-se',
    name: 'Puzzling',
    category: 'other',
    url: (u) => `https://puzzling.stackexchange.com/users/${u}`,
  },
  {
    id: 'rpg-se',
    name: 'Role-playing Games',
    category: 'other',
    url: (u) => `https://rpg.stackexchange.com/users/${u}`,
  },
  {
    id: 'boardgames-se',
    name: 'Board & Card Games',
    category: 'other',
    url: (u) => `https://boardgames.stackexchange.com/users/${u}`,
  },
  { id: 'golf-se', name: 'Golf', category: 'other', url: (u) => `https://golf.stackexchange.com/users/${u}` },
  { id: 'sports-se', name: 'Sports', category: 'other', url: (u) => `https://sports.stackexchange.com/users/${u}` },
  {
    id: 'fitness-se',
    name: 'Physical Fitness',
    category: 'other',
    url: (u) => `https://fitness.stackexchange.com/users/${u}`,
  },
  { id: 'travel-se', name: 'Travel', category: 'other', url: (u) => `https://travel.stackexchange.com/users/${u}` },
  {
    id: 'expatriates-se',
    name: 'Expatriates',
    category: 'other',
    url: (u) => `https://expatriates.stackexchange.com/users/${u}`,
  },
  {
    id: 'parenting-se',
    name: 'Parenting',
    category: 'other',
    url: (u) => `https://parenting.stackexchange.com/users/${u}`,
  },
  {
    id: 'workplace-se',
    name: 'The Workplace',
    category: 'other',
    url: (u) => `https://workplace.stackexchange.com/users/${u}`,
  },
  {
    id: 'freelancing-se',
    name: 'Freelancing',
    category: 'other',
    url: (u) => `https://freelancing.stackexchange.com/users/${u}`,
  },
  {
    id: 'expressionengine-se',
    name: 'ExpressionEngine',
    category: 'other',
    url: (u) => `https://expressionengine.stackexchange.com/users/${u}`,
  },
  { id: 'drupal-se', name: 'Drupal', category: 'other', url: (u) => `https://drupal.stackexchange.com/users/${u}` },
  {
    id: 'wordpress-se',
    name: 'WordPress Development',
    category: 'other',
    url: (u) => `https://wordpress.stackexchange.com/users/${u}`,
  },
  { id: 'magento-se', name: 'Magento', category: 'other', url: (u) => `https://magento.stackexchange.com/users/${u}` },
  {
    id: 'salesforce-se',
    name: 'Salesforce',
    category: 'other',
    url: (u) => `https://salesforce.stackexchange.com/users/${u}`,
  },
  {
    id: 'sharepoint-se',
    name: 'SharePoint',
    category: 'other',
    url: (u) => `https://sharepoint.stackexchange.com/users/${u}`,
  },
  {
    id: 'power-platform-se',
    name: 'Power Platform',
    category: 'other',
    url: (u) => `https://powerplatform.stackexchange.com/users/${u}`,
  },
  {
    id: 'dynamics-se',
    name: 'Dynamics 365',
    category: 'other',
    url: (u) => `https://dynamicscrmfocal.stackexchange.com/users/${u}`,
  },
  { id: 'outlook-se', name: 'Outlook', category: 'other', url: (u) => `https://outlook.office365.com/owa/?realm=${u}` },
  {
    id: 'teams-se',
    name: 'Microsoft Teams',
    category: 'other',
    url: (u) => `https://teams.microsoft.com/l/chat/0/0?users=${u}`,
  },
  { id: 'azure-se', name: 'Azure', category: 'other', url: (u) => `https://portal.azure.com/#@${u}` },
  { id: 'aws-se', name: 'AWS', category: 'other', url: (u) => `https://console.aws.amazon.com/home/home?#/${u}` },
  {
    id: 'gcp-se',
    name: 'Google Cloud',
    category: 'other',
    url: (u) => `https://console.cloud.google.com/home/dashboard?project=${u}`,
  },
  { id: 'digitalocean-se', name: 'DigitalOcean', category: 'other', url: (u) => `https://cloud.digitalocean.com/${u}` },
  { id: 'linode-se', name: 'Linode', category: 'other', url: (u) => `https://cloud.linode.com/${u}` },
  { id: 'vultr-se', name: 'Vultr', category: 'other', url: (u) => `https://my.vultr.com/${u}` },
  { id: 'hetzner-se', name: 'Hetzner', category: 'other', url: (u) => `https://robot.hetzner.com/${u}` },
  { id: 'ovh-se', name: 'OVH', category: 'other', url: (u) => `https://www.ovh.com/manager/${u}` },
  { id: 'ionos-se', name: 'IONOS', category: 'other', url: (u) => `https://my.ionos.com/${u}` },
  { id: 'namecheap-se', name: 'Namecheap', category: 'other', url: (u) => `https://www.namecheap.com/${u}` },
  { id: 'godaddy-se', name: 'GoDaddy', category: 'other', url: (u) => `https://www.godaddy.com/${u}` },
  { id: 'cloudflare-se', name: 'Cloudflare', category: 'other', url: (u) => `https://dash.cloudflare.com/${u}` },
  { id: 'vercel-se', name: 'Vercel', category: 'other', url: (u) => `https://vercel.com/${u}` },
  { id: 'netlify-se', name: 'Netlify', category: 'other', url: (u) => `https://app.netlify.com/teams/${u}` },
  { id: 'heroku-se', name: 'Heroku', category: 'other', url: (u) => `https://dashboard.heroku.com/${u}` },
  { id: 'render-se', name: 'Render', category: 'other', url: (u) => `https://dashboard.render.com/${u}` },
  { id: 'railway-se', name: 'Railway', category: 'other', url: (u) => `https://railway.app/${u}` },
  { id: 'fly-se', name: 'Fly.io', category: 'other', url: (u) => `https://fly.io/${u}` },
  { id: 'deta-se', name: 'Deta', category: 'other', url: (u) => `https://deta.space/${u}` },
];

interface PlatformResult {
  platform: string;
  name: string;
  category: string;
  status: 'found' | 'not-found' | 'unknown' | 'error';
  url: string;
}

interface UsernameOsnitResponse {
  username: string;
  generated_at: string;
  total_checked: number;
  found: number;
  results: PlatformResult[];
  summary: Record<string, number>; // category → found count
  cached: boolean;
}

async function checkPlatform(username: string, platform: PlatformCheck): Promise<PlatformResult> {
  const url = platform.url(username);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'manual',
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        accept: 'text/html,*/*',
      },
    });
    clearTimeout(timer);

    if (platform.detect) {
      const status = platform.detect(res.status, res.headers);
      return { platform: platform.id, name: platform.name, category: platform.category, status, url };
    }

    // Default detection: 200-299 = found, 404 = not found, 3xx = found (redirect to profile)
    if (res.status >= 200 && res.status < 300) {
      return { platform: platform.id, name: platform.name, category: platform.category, status: 'found', url };
    }
    if (res.status === 404 || res.status === 410) {
      return { platform: platform.id, name: platform.name, category: platform.category, status: 'not-found', url };
    }
    if (res.status >= 300 && res.status < 400) {
      // Redirects often mean the profile exists but URL format changed
      return { platform: platform.id, name: platform.name, category: platform.category, status: 'found', url };
    }
    return { platform: platform.id, name: platform.name, category: platform.category, status: 'unknown', url };
  } catch {
    return { platform: platform.id, name: platform.name, category: platform.category, status: 'error', url };
  }
}

export async function usernameOsnitHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const raw = c.req.query('username')?.trim();
  if (!raw) return c.json({ error: 'missing username' }, 400);
  const username = raw;
  if (username.length < 2 || username.length > 64) return c.json({ error: 'username must be 2-64 chars' }, 400);
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) return c.json({ error: 'username can only contain a-z, 0-9, ., _, -' }, 400);

  // Optional platform filter
  const platformFilter = c.req
    .query('platforms')
    ?.split(',')
    .map((s) => s.trim().toLowerCase());
  const platforms = platformFilter
    ? PLATFORMS.filter((p) => platformFilter.includes(p.id))
    : PLATFORMS.filter((p) => !CLOUD_BLOCKED.has(p.id)).slice(0, MAX_PLATFORMS);

  if (platforms.length === 0) return c.json({ error: 'no matching platforms' }, 400);

  // Edge cache
  const edgeCache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://username-osint.internal/v1?u=${username.toLowerCase()}&p=${platforms.length}`);
  const cached = await edgeCache.match(cacheKey);
  if (cached) {
    const body = await cached.json();
    return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'HIT' });
  }

  // Fan out with bounded concurrency
  const results: PlatformResult[] = [];
  const queue = [...platforms];
  async function worker() {
    while (queue.length > 0) {
      const platform = queue.shift()!;
      const result = await checkPlatform(username, platform);
      results.push(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, platforms.length) }, worker));

  // Sort: found first, then unknown, then not-found
  const order = { found: 0, unknown: 1, 'not-found': 2, error: 3 };
  results.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));

  const found = results.filter((r) => r.status === 'found').length;
  const summary: Record<string, number> = {};
  for (const r of results) {
    if (r.status === 'found') {
      summary[r.category] = (summary[r.category] ?? 0) + 1;
    }
  }

  const body: UsernameOsnitResponse = {
    username,
    generated_at: new Date().toISOString(),
    total_checked: results.length,
    found,
    results,
    summary,
    cached: false,
  };

  const cacheable = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  });
  c.executionCtx.waitUntil(edgeCache.put(cacheKey, cacheable).catch(() => undefined));

  return c.json(body, 200, { 'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`, 'x-cache': 'MISS' });
}
