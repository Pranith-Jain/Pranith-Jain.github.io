import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Radio, Loader2 } from 'lucide-react';
const FeedCatalog = lazy(() => import('./FeedCatalog'));
const FeedSources = lazy(() => import('./FeedSources'));
const FeedQuality = lazy(() => import('./FeedQuality'));
const FeedScheduler = lazy(() => import('./FeedScheduler'));
const ThreatFeeds = lazy(() => import('../dfir/ThreatFeeds'));
type TabId = 'catalog' | 'sources' | 'quality' | 'scheduler' | 'threatfeeds';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'catalog', label: 'Catalog', desc: 'Feed file browser' },
  { id: 'sources', label: 'Sources', desc: 'Feed source registry' },
  { id: 'quality', label: 'Quality', desc: 'Feed quality metrics' },
  { id: 'scheduler', label: 'Scheduler', desc: 'Feed scheduling and orchestration' },
  { id: 'threatfeeds', label: 'Threat Feeds', desc: 'Threat intelligence feeds' },
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
    <DataPageLayout
      backTo="/threatintel"
      icon={<Radio size={28} />}
      title="Feed & Source Management"
      description="Feed catalogs, source health, quality metrics, and scheduling."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6"
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
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {TABS.find((t) => t.id === activeTab)?.desc}
      </p>
      <div role="tabpanel">
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'catalog' && <FeedCatalog />}
          {activeTab === 'sources' && <FeedSources />}
          {activeTab === 'quality' && <FeedQuality />}
          {activeTab === 'scheduler' && <FeedScheduler />}
          {activeTab === 'threatfeeds' && <ThreatFeeds />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
