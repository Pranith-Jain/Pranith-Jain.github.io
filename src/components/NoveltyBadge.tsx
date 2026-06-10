import { useEffect, useState } from 'react';

interface NoveltyBadgeProps {
  text: string;
  /** Also mark this text as seen when checked */
  markSeen?: boolean;
  /** Show as compact dot instead of full badge */
  compact?: boolean;
}

export function NoveltyBadge({ text, markSeen, compact }: NoveltyBadgeProps) {
  const [novel, setNovel] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!text || text.length < 3) {
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({ q: text });
    if (markSeen) params.set('mark', '1');
    fetch(`/api/v1/threat-intel/novelty?${params}`)
      .then((r) => r.json() as Promise<{ novel: boolean; score: number }>)
      .then((d) => {
        setNovel(d.novel);
        setScore(d.score);
      })
      .catch(() => {
        /* non-fatal */
      })
      .finally(() => setLoading(false));
  }, [text, markSeen]);

  if (loading) return null;

  if (novel) {
    if (compact) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-micro font-bold font-mono text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
          new
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-micro font-bold font-mono text-emerald-700 dark:text-emerald-300 uppercase tracking-wider border border-emerald-300 dark:border-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Novel — first seen
      </span>
    );
  }

  if (score > 0 && score < 0.5) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-micro font-mono text-slate-500 border border-slate-200 dark:border-slate-700">
        Seen before ({(score * 100).toFixed(0)}% recall)
      </span>
    );
  }

  return null;
}
