import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { GitBranch } from 'lucide-react';

const SupplyChainAttacks = lazy(() => import('./SupplyChainAttacks'));
const SupplyChainFeed = lazy(() => import('./SupplyChainFeed'));
const SupplyChainIntelligence = lazy(() => import('./SupplyChainIntelligence'));

type TabId = 'attacks' | 'feed' | 'intel';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'attacks', label: 'Attacks', desc: 'Tracked supply-chain attacks and incidents' },
  { id: 'feed', label: 'Feed', desc: 'Malicious package feed - OSSF database' },
  { id: 'intel', label: 'Intel', desc: 'Supply-chain intelligence and analysis' },
];

export default function SupplyChainHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('attacks');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<GitBranch size={28} />}
      title="Supply Chain Hub"
      description="Supply-chain attack tracking, malicious package feeds, and intelligence."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Supply Chain Hub"
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
          {activeTab === 'attacks' && <SupplyChainAttacks />}
          {activeTab === 'feed' && <SupplyChainFeed />}
          {activeTab === 'intel' && <SupplyChainIntelligence />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
