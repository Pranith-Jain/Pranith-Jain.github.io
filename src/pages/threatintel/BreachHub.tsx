import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ShieldAlert } from 'lucide-react';

const BreachDisclosures = lazy(() => import('./BreachDisclosures'));
const BreachForums = lazy(() => import('./BreachForums'));
const BreachWatch = lazy(() => import('./BreachWatch'));

type TabId = 'disclosures' | 'forums' | 'watch';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'disclosures', label: 'Disclosures', desc: 'Have I Been Pwned feed with verification flags' },
  { id: 'forums', label: 'Forums', desc: 'DeepdarkCTI criminal forum + dark-market directory' },
  { id: 'watch', label: 'Watch', desc: 'Breach monitoring and alerting' },
];

export default function BreachHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('disclosures');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldAlert size={28} />}
      title="Breach Hub"
      description="Breach disclosures, forum tracking, and breach-watch monitoring."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Breach Hub"
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
          {activeTab === 'disclosures' && <BreachDisclosures />}
          {activeTab === 'forums' && <BreachForums />}
          {activeTab === 'watch' && <BreachWatch />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
