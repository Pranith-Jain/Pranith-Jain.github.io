import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { LineChart } from 'lucide-react';

const TiDashboard = lazy(() => import('../TiDashboard'));
const CtiDashboard = lazy(() => import('./CtiDashboard'));

type TabId = 'ti' | 'cti';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'ti', label: 'TI DASHBOARD', desc: 'Threat intelligence overview dashboard' },
  { id: 'cti', label: 'CTI DASHBOARD', desc: 'Cyber threat intelligence dashboard' },
];

export default function DashboardHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('ti');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<LineChart size={28} />}
      title="Dashboard Hub"
      description="Threat intelligence dashboards - TI overview and CTI views. The threat landscape lives in the Intel Dashboard."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Dashboard hub tools"
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
          {activeTab === 'ti' && <TiDashboard />}
          {activeTab === 'cti' && <CtiDashboard />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
