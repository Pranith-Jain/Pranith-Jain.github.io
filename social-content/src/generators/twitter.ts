/**
 * Twitter/X generator — produces:
 * 1. Thread text (each tweet ≤280 chars)
 * 2. Single post text
 *
 * Twitter threads: hook tweet → context → points → conclusion → CTA
 * Each tweet is separated by a blank line for easy copy-paste.
 */

import type { ContentSpec } from '../content-spec';

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

export function generateTwitterThread(spec: ContentSpec): string[] {
  const tweets: string[] = [];

  // Tweet 1: Hook
  const hook = spec.slides[0]?.headline ?? spec.title;
  tweets.push(truncate(hook, 270));

  // Tweet 2: Context (if available)
  if (spec.slides[0]?.body) {
    tweets.push(truncate(spec.slides[0].body, 275));
  }

  // Middle tweets: slides (skip first and last)
  for (const slide of spec.slides.slice(1, -1)) {
    if (slide.bullets && slide.bullets.length > 0) {
      let tweet = `${slide.headline}\n\n`;
      for (const b of slide.bullets) {
        const line = `→ ${b}\n`;
        if (tweet.length + line.length > 270) break;
        tweet += line;
      }
      tweets.push(truncate(tweet.trim(), 275));
    } else if (slide.body) {
      tweets.push(truncate(`${slide.headline}\n\n${slide.body}`, 275));
    } else if (slide.stat) {
      tweets.push(truncate(`${slide.stat.value} — ${slide.stat.label}\n\n${slide.headline}`, 275));
    } else {
      tweets.push(truncate(slide.headline, 275));
    }
  }

  // CTA tweet
  const cta = spec.cta || (spec.slides[spec.slides.length - 1]?.headline ?? '');
  const tags = spec.hashtags
    .slice(0, 3)
    .map((t) => `#${t}`)
    .join(' ');
  tweets.push(truncate(`${cta}\n\n${tags}`, 275));

  return tweets;
}

export function generateTwitterPost(spec: ContentSpec): string {
  const hook = spec.slides[0]?.headline ?? spec.title;
  const cta = spec.cta || '';
  const tags = spec.hashtags
    .slice(0, 3)
    .map((t) => `#${t}`)
    .join(' ');

  return truncate(`${hook}\n\n${cta}\n\n${tags}`, 280);
}

export function generateTwitterThreadText(spec: ContentSpec): string {
  const tweets = generateTwitterThread(spec);
  return tweets.map((t, i) => `Tweet ${i + 1}:\n${t}`).join('\n\n---\n\n');
}
