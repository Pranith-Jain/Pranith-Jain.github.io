import { Suspense, lazy, useState } from 'react';
import { TabLoader } from '../../components/ui/TabLoader';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Search } from 'lucide-react';

const ActorUsernames = lazy(() => import('./ActorUsernames'));
const ScrapedIntelUsernames = lazy(() => import('./ScrapedIntelUsernames'));

type TabId = 'local' | 'scrapedintel';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'local', label: 'Local Dataset (291K)', desc: 'Search ~291K handles from ~25 cybercrime forums' },
  { id: 'scrapedintel', label: 'ScrapedIntel (2M+)', desc: 'Search 2M+ handles from threatactorusernames.com API' },
];

export default function ActorUsernameSearch(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('local');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Search size={28} />}
      title="Forum Username Search"
      description="Search threat-actor handles across cybercrime forums. Local dataset (291K) or ScrapedIntel API (2M+)."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[#1e2030] mb-6"
        aria-label="Username sources"
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
          {activeTab === 'local' && <ActorUsernames />}
          {activeTab === 'scrapedintel' && <ScrapedIntelUsernames />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
