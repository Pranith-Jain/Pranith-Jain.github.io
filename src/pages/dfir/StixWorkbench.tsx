import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { FileText, Loader2 } from 'lucide-react';

const StixBuilder = lazy(() => import('./StixBuilder'));
const StixViewer = lazy(() => import('./StixViewer'));
const TaxiiServer = lazy(() => import('./TaxiiServer'));

type TabId = 'build' | 'view' | 'taxii';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'build', label: 'Build', desc: 'Build STIX bundle from text/IOCs/URL/file upload' },
  { id: 'view', label: 'View & Graph', desc: 'Paste/view STIX 2.1 bundle with interactive graph' },
  { id: 'taxii', label: 'TAXII Server', desc: 'In-browser TAXII 2.1 server for STIX sharing' },
];

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}

export default function StixWorkbench(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('build');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<FileText size={28} />}
      title="STIX/TAXII Workbench"
      description="Unified STIX/TAXII workflow — build bundles, visualize with interactive graphs, and share via TAXII server."
    >
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="STIX tools">
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
          {activeTab === 'build' && <StixBuilder />}
          {activeTab === 'view' && <StixViewer />}
          {activeTab === 'taxii' && <TaxiiServer />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
