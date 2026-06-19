import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Crosshair } from 'lucide-react';

const IocCheck = lazy(() => import('./IocCheck'));
const IocPivot = lazy(() => import('./IocPivot'));
const ThreatHunt = lazy(() => import('./ThreatHunt'));

type TabId = 'table' | 'graph' | 'hunt';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'table', label: 'Table View', desc: 'Stream IOC results from 24 providers in table format' },
  {
    id: 'graph',
    label: 'Pivot Graph',
    desc: 'Same 26-source checker rendered as radial graph with clickable pivot nodes',
  },
  { id: 'hunt', label: 'Threat Hunt', desc: 'Extended with Telegram leak cross-ref + breach DB links' },
];

export default function IocInvestigate(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('table');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Crosshair size={28} />}
      title="IOC Investigator"
      description="Unified IOC investigation — table view, pivot graph, and extended threat hunt. Paste an IP, domain, URL, or hash to start."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="IOC investigation"
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
          {activeTab === 'table' && <IocCheck />}
          {activeTab === 'graph' && <IocPivot />}
          {activeTab === 'hunt' && <ThreatHunt />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
