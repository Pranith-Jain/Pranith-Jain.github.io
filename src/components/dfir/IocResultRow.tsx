import { VerdictChip } from './VerdictChip';
import type { ProviderResultWire } from '../../lib/dfir/types';

export function IocResultRow({ r }: { r: ProviderResultWire }): JSX.Element {
  return (
    <div className="rounded-lg border border-[#1f1f23] bg-[#111113] p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-display font-semibold text-[#fafafa] capitalize">{r.source}</span>
        <VerdictChip verdict={r.verdict} />
      </div>
      <div className="flex items-center gap-4 text-sm font-mono text-[#a1a1aa]">
        <span>
          score: <span className="text-[#fafafa]">{r.score}</span>
        </span>
        {r.cached && <span className="text-[#00fff9]">cached</span>}
        {r.status === 'error' && <span className="text-[#ef4444]">err: {r.error}</span>}
        {r.status === 'unsupported' && <span className="text-[#71717a]">n/a for this type</span>}
      </div>
      {r.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.tags.slice(0, 6).map((t) => (
            <span
              key={t}
              className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#0a0a0a] text-[#a1a1aa] border border-[#1f1f23]"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
