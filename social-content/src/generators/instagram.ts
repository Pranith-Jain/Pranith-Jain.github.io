/**
 * Instagram generator — produces:
 * 1. Carousel HTML (1080×1350, portrait)
 * 2. Post caption (with hashtags, optimized for IG)
 *
 * Instagram carousel: screenshot each slide as PNG, upload as carousel.
 * Instagram story: use the 1080×1920 template.
 */

import { BRAND } from '../brand';
import type { ContentSpec } from '../content-spec';
import { renderCarouselHTML } from '../carousel-renderer';

export function generateInstagramCaption(spec: ContentSpec): string {
  const hook = spec.slides[0]?.headline ?? spec.title;
  const points = spec.slides
    .slice(1, -1)
    .flatMap((s) => s.bullets ?? (s.body ? [s.body] : []))
    .slice(0, 5);

  const cta = spec.cta || 'Save this post for later 🔖';

  let caption = `${hook}\n\n`;

  if (points.length > 0) {
    for (let i = 0; i < points.length; i++) {
      caption += `${i + 1}. ${points[i]}\n`;
    }
    caption += `\n`;
  }

  caption += `${cta}\n\n`;

  // IG hashtags: mix of sizes
  caption += `.\n.\n.\n`;
  const tags = spec.hashtags.map((t) => `#${t}`).join(' ');
  caption += `${tags} #cybersecurity #infosec #DFIR #threatintel #security`;

  return caption;
}

export function generateInstagramCarouselHTML(spec: ContentSpec): string {
  return renderCarouselHTML(spec);
}
