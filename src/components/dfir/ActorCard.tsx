import { Link } from 'react-router-dom';
import type { ThreatActor } from '../../data/dfir/threat-actors';

const SOPH_STYLES: Record<string, string> = {
  'nation-state': 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40',
  expert: 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40',
  advanced: 'bg-[#fbbf24]/15 text-[#fbbf24] border-[#fbbf24]/40',
  intermediate: 'bg-[#a1a1aa]/15 text-[#a1a1aa] border-[#a1a1aa]/40',
  novice: 'bg-[#71717a]/15 text-[#71717a] border-[#71717a]/40',
};

export function ActorCard({ actor }: { actor: ThreatActor }): JSX.Element {
  return (
    <Link
      to={`/dfir/actors/${actor.slug}`}
      className="block rounded-lg border border-[#1f1f23] bg-[#111113] p-5 hover:border-[#00fff9]/40 transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-display font-bold text-lg text-[#fafafa]">{actor.name}</h3>
          {actor.aliases.length > 0 && (
            <p className="text-xs font-mono text-[#71717a] mt-0.5">{actor.aliases.slice(0, 3).join(' · ')}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded border ${
              actor.status === 'active'
                ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/40'
                : 'bg-[#71717a]/15 text-[#71717a] border-[#71717a]/40'
            }`}
          >
            {actor.status}
          </span>
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded border ${SOPH_STYLES[actor.sophistication] ?? SOPH_STYLES.novice}`}
          >
            {actor.sophistication}
          </span>
        </div>
      </div>
      <p className="text-sm text-[#a1a1aa] leading-relaxed line-clamp-3 mb-3">{actor.description}</p>
      <div className="flex items-center gap-3 text-xs font-mono text-[#71717a]">
        {actor.country && <span>{actor.country}</span>}
        <span>{actor.techniques.length} techniques</span>
        <span>{actor.malware.length} tools</span>
      </div>
    </Link>
  );
}
