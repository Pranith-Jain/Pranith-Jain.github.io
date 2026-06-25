/**
 * LinkedIn generator — produces:
 * 1. Carousel HTML (self-contained, brand-aligned)
 * 2. Post text (copy-paste ready with hashtags)
 *
 * LinkedIn carousel upload: save the HTML as PDF via browser print,
 * then upload the PDF to LinkedIn.
 */

import { BRAND } from '../brand';
import type { ContentSpec } from '../content-spec';
import { renderCarouselHTML } from '../carousel-renderer';

export function generateLinkedInPost(spec: ContentSpec): string {
  const hook = spec.slides[0]?.headline ?? spec.title;
  const points = spec.slides
    .slice(1, -1)
    .flatMap((s) => s.bullets ?? (s.body ? [s.body] : []))
    .slice(0, 5);

  const cta = spec.cta || (spec.slides[spec.slides.length - 1]?.headline ?? '');

  let post = `${hook}\n\n`;

  if (points.length > 0) {
    for (const p of points) {
      post += `→ ${p}\n`;
    }
    post += `\n`;
  }

  if (spec.thread && spec.thread.length > 0) {
    post += `${spec.thread[0]}\n\n`;
  }

  post += `${cta}\n\n`;

  const tags = spec.hashtags.map((t) => `#${t}`).join(' ');
  post += `${tags}\n`;
  post += `\n— Pranith Jain ▰ ${BRAND.portfolioUrl}`;

  return post;
}

export function generateLinkedInCarouselHTML(spec: ContentSpec): string {
  return renderCarouselHTML(spec);
}

export function generateLinkedInReadme(spec: ContentSpec): string {
  return `# ▰ Pranith Jain · ${BRAND.portfolioUrl}

## LinkedIn Carousel: ${spec.title}

### Funnel: ${spec.funnel.toUpperCase()} | Persona: ${spec.persona}
### Hook: ${spec.hook} | Platform: LinkedIn

### Upload Instructions
1. Open the .html file in Chrome
2. Print to PDF (Ctrl+P → Save as PDF)
3. Upload the PDF as a LinkedIn carousel post
4. Copy the post text below and paste as the caption

### Post Caption
\`\`\`
${generateLinkedInPost(spec)}
\`\`\`

### Slide Breakdown
${spec.slides.map((s) => `- **Slide ${s.index}**: ${s.headline}${s.body ? ` — ${s.body}` : ''}`).join('\n')}
`;
}
