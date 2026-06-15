import { Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
const ActorDirectory = lazy(() => import('./ActorDirectory'));
const ActorTimeline = lazy(() => import('./ActorTimeline'));
const ActorDNA = lazy(() => import('./ActorDNA'));
const ActorUsernameSearch = lazy(() => import('./ActorUsernameSearch'));
const Attribution = lazy(() => import('./AttributionFramework'));
type TabId = 'directory' | 'timeline' | 'dna' | 'usernames' | 'attribution';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'directory', label: 'Directory', desc: 'Actor directory across MITRE, MISP Galaxy, and platform DB' },
  { id: 'timeline', label: 'Timeline', desc: 'Actor posting activity and operational tempo' },
  { id: 'dna', label: 'DNA', desc: 'TTP signatures and infrastructure fingerprints' },
  { id: 'usernames', label: 'Usernames', desc: 'Search forum handles across 2M+ records' },
  { id: 'attribution', label: 'Attribution', desc: 'Attribution framework and analysis' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function ActorHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('directory');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4"
        aria-label="Actor tools"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            aria-selected={activeTab === t.id}
            role="tab"
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'directory' && <ActorDirectory />}
        {activeTab === 'timeline' && <ActorTimeline />}
        {activeTab === 'dna' && <ActorDNA />}
        {activeTab === 'usernames' && <ActorUsernameSearch />}
        {activeTab === 'attribution' && <Attribution />}
      </Suspense>
    </div>
  );
}
