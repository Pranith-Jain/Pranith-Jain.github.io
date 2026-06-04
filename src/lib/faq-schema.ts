export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Extract FAQ Q&A pairs from a post's markdown body, for FAQPage JSON-LD.
 * Looks for a `## FAQ` section, then each `### question` heading followed by
 * its answer text (up to the next heading). Returns [] when there is no
 * parseable FAQ — callers should then emit no FAQPage schema (graceful).
 */
export function extractFaq(markdown: string): FaqItem[] {
  const lines = markdown.split('\n');
  let i = lines.findIndex((l) => /^##\s+FAQ\b/i.test(l.trim()));
  if (i < 0) return [];
  i += 1;

  const items: FaqItem[] = [];
  let question: string | null = null;
  let answer: string[] = [];
  const flush = () => {
    if (question) {
      const a = answer.join(' ').replace(/\s+/g, ' ').trim();
      if (a) items.push({ question, answer: a });
    }
    question = null;
    answer = [];
  };

  for (; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^##\s+/.test(line)) break; // next top-level section ends the FAQ
    const h3 = line.match(/^###\s+(.*\S)\s*$/);
    if (h3) {
      flush();
      question = h3[1]!.replace(/[*_`]/g, '').trim();
      continue;
    }
    if (question) answer.push(line.replace(/[*_`>]/g, '').trim());
  }
  flush();
  return items;
}
