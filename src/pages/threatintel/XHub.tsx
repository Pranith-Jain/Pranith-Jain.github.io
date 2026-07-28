import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Radio } from 'lucide-react';

const XFirehose = lazy(() => import('./XFirehose'));
const XLive = lazy(() => import('./XLive'));
const XWatch = lazy(() => import('./XWatch'));

type TabId = 'firehose' | 'live' | 'watch';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'firehose', label: 'FIREHOSE', desc: 'Bulk X/Twitter post ingestion and search' },
  { id: 'live', label: 'LIVE STREAM', desc: 'Real-time X/Twitter stream monitoring' },
  { id: 'watch', label: 'WATCH', desc: 'Saved X/Twitter watch lists and alerts' },
];

export default function XHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('firehose');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Radio size={28} />}
      title="X/Twitter Hub"
      description="X/Twitter intelligence - firehose search, live stream monitoring, and watch lists."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="X/Twitter hub tools"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
              activeTab === t.id
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
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
        <Suspense fallback={<TabLoader />}>
          {activeTab === 'firehose' && <XFirehose />}
          {activeTab === 'live' && <XLive />}
          {activeTab === 'watch' && <XWatch />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
