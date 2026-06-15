import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Activity, Loader2 } from 'lucide-react';

const FeedStatus = lazy(() => import('./FeedStatus'));
const CollectionSlo = lazy(() => import('./CollectionSlo'));
const SourceReliability = lazy(() => import('./SourceReliability'));

type TabId = 'status' | 'slo' | 'grades';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'status', label: 'Operational Status', desc: 'Feed health status for every upstream-backed feed' },
  { id: 'slo', label: 'SLO Metrics', desc: 'Uptime %, staleness, reliability grades per collector' },
  { id: 'grades', label: 'Trust Grades', desc: 'NATO Admiralty Code (A-F) grading for all sources' },
];

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}

export default function SourceHealth(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('status');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Activity size={28} />}
      title="Source Health"
      description="Unified source health dashboard — operational status, SLO metrics, and trust grades for all data sources."
    >
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="Source health">
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
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'status' && <FeedStatus />}
          {activeTab === 'slo' && <CollectionSlo />}
          {activeTab === 'grades' && <SourceReliability />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
