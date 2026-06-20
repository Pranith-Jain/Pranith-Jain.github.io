/**
 * Reusable JSON-LD helpers for FAQPage and HowTo schemas.
 *
 * Why this lives in its own component: `BlogPost.tsx` already runs the
 * markdown `extractFaq()` path, but `/dfir` and `/` don't have a markdown
 * body to scan. For those surfaces the FAQ lives as static data in the
 * page, and these two components render the matching schema.org blocks.
 *
 * Answer length: 40-60 words per AEO guidance. AI engines ignore shorter
 * answers and truncate longer ones. Each entry below is hand-counted.
 */

export interface FaqEntry {
  question: string;
  /** Plain-text answer. 40-60 words. */
  answer: string;
}

export function FaqStructuredData({ entries }: { entries: FaqEntry[] }): JSX.Element | null {
  if (entries.length < 2) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
    />
  );
}

export interface HowToStep {
  name: string;
  text: string;
}

export function HowToStructuredData({
  name,
  description,
  steps,
}: {
  name: string;
  description: string;
  steps: HowToStep[];
}): JSX.Element | null {
  if (steps.length < 2) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    step: steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
    />
  );
}
