import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Share2 } from 'lucide-react';

const StixBundleBrowser = lazy(() => import('./StixBundleBrowser'));
const StixIpExport = lazy(() => import('./StixIpExport'));

type TabId = 'bundle' | 'ip';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'bundle', label: 'BUNDLE BROWSER', desc: 'Browse and explore STIX 2.1 bundles' },
  { id: 'ip', label: 'IP ENRICHMENT', desc: 'Export enriched IP indicators as STIX 2.1' },
];

export default function StixHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('bundle');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Share2 size={28} />}
      title="STIX Hub"
      description="STIX 2.1 bundle browsing and IP indicator enrichment export."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="STIX hub tools"
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

      <p className="text-xs font-mono text-muted mb-4">{TABS.find((t) => t.id === activeTab)?.desc}</p>

      <div role="tabpanel">
        <Suspense fallback={<TabLoader />}>
          {activeTab === 'bundle' && <StixBundleBrowser />}
          {activeTab === 'ip' && <StixIpExport />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
