import type { ActorStatus, Sophistication } from '../../data/dfir/threat-actors';

interface Props {
  search: string;
  setSearch: (v: string) => void;
  status: 'all' | ActorStatus;
  setStatus: (v: 'all' | ActorStatus) => void;
  sophistication: 'all' | Sophistication;
  setSophistication: (v: 'all' | Sophistication) => void;
}

const STATUSES: Array<'all' | ActorStatus> = ['all', 'active', 'inactive'];
const SOPHS: Array<'all' | Sophistication> = ['all', 'nation-state', 'expert', 'advanced', 'intermediate', 'novice'];

function Pill<T extends string>({
  value,
  current,
  onClick,
  children,
}: {
  value: T;
  current: T;
  onClick: (v: T) => void;
  children: React.ReactNode;
}): JSX.Element {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider border transition-colors ${
        active
          ? 'bg-[#00fff9]/15 text-[#00fff9] border-[#00fff9]/40'
          : 'bg-[#111113] text-[#a1a1aa] border-[#1f1f23] hover:border-[#00fff9]/30'
      }`}
    >
      {children}
    </button>
  );
}

export function ActorFilterBar(p: Props): JSX.Element {
  return (
    <div className="space-y-4 mb-8">
      <input
        type="search"
        value={p.search}
        onChange={(e) => p.setSearch(e.target.value)}
        placeholder="search by name or alias…"
        className="w-full px-4 py-2 bg-[#111113] border border-[#1f1f23] rounded-lg font-mono text-sm text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:border-[#00fff9]/50"
      />
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Pill key={s} value={s} current={p.status} onClick={p.setStatus}>
            {s}
          </Pill>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {SOPHS.map((s) => (
          <Pill key={s} value={s} current={p.sophistication} onClick={p.setSophistication}>
            {s.replace('-', ' ')}
          </Pill>
        ))}
      </div>
    </div>
  );
}
