import { Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
const SocialFirehose = lazy(() => import('./SocialFirehose'));
const TechAiNews = lazy(() => import('../dfir/TechAiNews'));
type TabId = 'firehose' | 'news';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'firehose', label: 'Firehose', desc: 'Multi-platform social media firehose' },
  { id: 'news', label: 'Tech News', desc: 'Tech and AI news aggregation' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function SocialHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('firehose');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4"
        aria-label="Social tools"
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
        {activeTab === 'firehose' && <SocialFirehose />}
        {activeTab === 'news' && <TechAiNews />}
      </Suspense>
    </div>
  );
}
