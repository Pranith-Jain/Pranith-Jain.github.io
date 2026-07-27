import { TOOL_TOPICS, type ToolTopic } from '../../data/dfir/tool-topics';

/**
 * Pre-process an article body to convert the FIRST mention of each known
 * topic term into a markdown link to the relevant tool. Subsequent mentions
 * are left as plain text.
 *
 * Skips:
 *   - text inside fenced code blocks (```...```)
 *   - text inside inline code (`...`)
 *   - text already inside a markdown link [...](...)
 *
 * Important invariant: when a topic match is wrapped, the wrapped link is
 * spliced into the segments array as a NEW skip-segment immediately, so
 * later iterations cannot scan inside the link's title attribute and produce
 * nested markup like `[SPF](… "… [DKIM](…) …")`. This module exists as a
 * standalone export specifically so the nesting bug can be regression-tested
 * in isolation - the symptom shipped to production once already.
 */
export function injectToolLinks(body: string): { body: string; matched: ToolTopic[] } {
  const segments: { kind: 'plain' | 'skip'; text: string }[] = [];
  const SKIP_RE = /(```[\s\S]*?```|`[^`\n]*`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  for (const m of body.matchAll(SKIP_RE)) {
    if (m.index === undefined) continue;
    if (m.index > last) segments.push({ kind: 'plain', text: body.slice(last, m.index) });
    segments.push({ kind: 'skip', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) segments.push({ kind: 'plain', text: body.slice(last) });

  const matched = new Map<string, ToolTopic>();
  const usedTopics = new Set<string>();

  for (const topic of TOOL_TOPICS) {
    if (usedTopics.has(topic.term.toLowerCase())) continue;
    const escaped = topic.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b(${escaped})\\b`, 'i');
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg || seg.kind !== 'plain') continue;
      const m = re.exec(seg.text);
      if (!m) continue;
      const before = seg.text.slice(0, m.index);
      const matchText = m[0];
      const link = `[${matchText}](${topic.href} "${topic.blurb}")`;
      const after = seg.text.slice(m.index + matchText.length);
      segments.splice(
        i,
        1,
        { kind: 'plain', text: before },
        { kind: 'skip', text: link },
        { kind: 'plain', text: after }
      );
      usedTopics.add(topic.term.toLowerCase());
      matched.set(topic.href, topic);
      break;
    }
  }

  return { body: segments.map((s) => s.text).join(''), matched: [...matched.values()] };
}
