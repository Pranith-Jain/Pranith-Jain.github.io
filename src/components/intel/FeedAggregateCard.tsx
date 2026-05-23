import { useMemo } from 'react';
import { IntelCard } from './IntelCard';

/**
 * One-card-per-page aggregate enrichment surface for narrative feed pages
 * (Telegram, Reddit, Dark Web, Breach Forums, RSS aggregators).
 *
 * Why aggregate instead of per-item: many of these pages render dozens of
 * short messages. A per-item card would fan out N fetches AND yield little
 * (Telegram messages are often a few sentences). An aggregate card pools
 * the visible items' text into one extraction pass — a single STIX bundle
 * representing "what's hot on this feed right now."
 *
 * itemRef is derived from a stable per-day bucket so the bundle re-builds
 * when the feed materially shifts (one bundle per page per day),
 * remaining cacheable for the rest of the day.
 *
 * Wraps <IntelCard>, which itself talks to /api/v1/intel-bundle. Falls back
 * to rendering nothing while loading so the page's existing list still
 * carries first paint.
 */

export interface FeedAggregateCardProps {
  /** Stable identifier for this surface (e.g. 'telegram', 'reddit', 'darkweb'). */
  sourceId: string;
  /** Display name shown in the card header (e.g. "Telegram firehose"). */
  sourceName: string;
  /** Items to fold into one synthetic report. Title + body fields are joined. */
  items: Array<{ title?: string; body: string }>;
  /** Page-level title shown on the card. */
  title: string;
  /**
   * Stable per-day bucket key — usually `new Date().toISOString().slice(0,10)`
   * so the same calendar day shares a bundle. Pass a different key if
   * you want a finer / coarser bucket.
   */
  dayKey?: string;
  /** Max items folded into the body. The byte-cap above kicks in first
   *  when items are long; this exists so an obscenely long feed can't
   *  exhaust memory before the byte cap runs. */
  maxItems?: number;
}

/** Cap on combined body bytes — sized just under the route's MAX_BRIEF_BYTES
 *  (50 KB) so we can pack as much 7-day signal as the extractor will accept. */
const MAX_BODY_BYTES = 45_000;

function joinItems(items: FeedAggregateCardProps['items'], maxItems: number): string {
  const slice = items.slice(0, maxItems);
  const parts: string[] = [];
  let used = 0;
  for (const it of slice) {
    const fragment = (it.title ? `## ${it.title}\n` : '') + it.body.replace(/\s+/g, ' ').trim();
    if (!fragment) continue;
    if (used + fragment.length > MAX_BODY_BYTES) break;
    parts.push(fragment);
    used += fragment.length + 2;
  }
  return parts.join('\n\n');
}

export function FeedAggregateCard(props: FeedAggregateCardProps): JSX.Element | null {
  const { sourceId, items, title, dayKey, maxItems = 500 } = props;
  // `sourceName` is accepted in the API for documentation / future use
  // (e.g. a friendly STIX identity name override) but the underlying card
  // currently derives the display name from `sourceId` via the route's
  // `deriveSourceName` helper.
  void props.sourceName;

  const day = dayKey ?? new Date().toISOString().slice(0, 10);
  const body = useMemo(() => joinItems(items, maxItems), [items, maxItems]);

  // No content to extract — skip the card entirely so we don't pin a useless
  // entry in D1 just because the page loaded with an empty feed.
  if (!body) return null;

  return (
    <div className="mb-6">
      <IntelCard
        sourceId={sourceId}
        itemRef={`${sourceId}:${day}`}
        item={{
          title: `${title} — ${day}`,
          body,
          publishedAt: new Date().toISOString(),
        }}
        // No fallback by design: the page's existing list IS the fallback
        // surface — the card is purely additive while it loads.
        fallback={null}
      />
    </div>
  );
}
