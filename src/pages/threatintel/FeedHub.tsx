import { Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
const FeedCatalog = lazy(() => import('./FeedCatalog'));
const FeedSources = lazy(() => import('./FeedSources'));
const FeedQuality = lazy(() => import('./FeedQuality'));
const FeedScheduler = lazy(() => import('./FeedScheduler'));
const ThreatFeeds = lazy(() => import('../dfir/ThreatFeeds'));
const FeedStatus = lazy(() => import('./FeedStatus'));
const SourceReliability = lazy(() => import('./SourceReliability'));
const MyThreatIntel = lazy(() => import('./MyThreatIntel'));
type TabId =
  | 'catalog'
  | 'sources'
  | 'quality'
  | 'scheduler'
  | 'threatfeeds'
  | 'status'
  | 'reliability'
  | 'mythreatintel';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'catalog', label: 'Catalog', desc: 'Feed file browser' },
  { id: 'sources', label: 'Sources', desc: 'Feed source registry' },
  { id: 'quality', label: 'Quality', desc: 'Feed quality metrics' },
  { id: 'scheduler', label: 'Scheduler', desc: 'Feed scheduling and orchestration' },
  { id: 'threatfeeds', label: 'Threat Feeds', desc: 'Threat intelligence feeds' },
  { id: 'status', label: 'Status', desc: 'Feed health status' },
  { id: 'reliability', label: 'Reliability', desc: 'Source reliability grades' },
  { id: 'mythreatintel', label: 'MyThreatIntel', desc: 'MyThreatIntel feed' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function FeedHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('catalog');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4"
        aria-label="Feed tools"
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
        {activeTab === 'catalog' && <FeedCatalog />}
        {activeTab === 'sources' && <FeedSources />}
        {activeTab === 'quality' && <FeedQuality />}
        {activeTab === 'scheduler' && <FeedScheduler />}
        {activeTab === 'threatfeeds' && <ThreatFeeds />}
        {activeTab === 'status' && <FeedStatus />}
        {activeTab === 'reliability' && <SourceReliability />}
        {activeTab === 'mythreatintel' && <MyThreatIntel />}
      </Suspense>
    </div>
  );
}
