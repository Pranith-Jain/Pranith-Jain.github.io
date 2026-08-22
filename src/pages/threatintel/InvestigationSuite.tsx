import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { FolderTree } from 'lucide-react';

const Investigations = lazy(() => import('./Investigations'));
const Watches = lazy(() => import('./Watches'));
const Workspaces = lazy(() => import('./Workspaces'));

type TabId = 'investigations' | 'watches' | 'workspaces';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'investigations', label: 'INVESTIGATIONS', desc: 'Manage and browse threat investigations' },
  { id: 'watches', label: 'WATCHES', desc: 'Saved watch lists and monitoring alerts' },
  { id: 'workspaces', label: 'WORKSPACES', desc: 'Collaborative investigation workspaces' },
];

export default function InvestigationSuite(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('investigations');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<FolderTree size={28} />}
      title="Investigation Suite"
      description="Investigations, watch lists, and collaborative workspaces for threat intelligence."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Investigation suite tools"
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
          {activeTab === 'investigations' && <Investigations />}
          {activeTab === 'watches' && <Watches />}
          {activeTab === 'workspaces' && <Workspaces />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
