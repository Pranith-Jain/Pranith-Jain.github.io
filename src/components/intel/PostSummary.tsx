import { Sparkles } from 'lucide-react';

/**
 * <PostSummary> — one-line AI summary rendered under a single feed post.
 *
 * Pair with usePostSummaries(): pass `text={summaries.get(item.id)}`. Renders
 * nothing when there's no summary (public visitors, un-summarised items, or a
 * failed/cold item), so it's safe to drop into any feed-item card.
 */
export function PostSummary({ text, className }: { text?: string; className?: string }): JSX.Element | null {
  if (!text) return null;
  return (
    <p
      className={`mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400 ${className ?? ''}`}
    >
      <Sparkles size={12} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
      <span>
        <span className="font-mono text-micro uppercase tracking-wider text-brand-600/80 dark:text-brand-400/80">
          AI
        </span>{' '}
        {text}
      </span>
    </p>
  );
}
