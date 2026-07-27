import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ScrollText } from 'lucide-react';

const ReportAnalyzer = lazy(() => import('./ReportAnalyzer'));
const ReportComposer = lazy(() => import('./ReportComposer'));

type TabId = 'analyzer' | 'composer';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'analyzer', label: 'Report Analyzer', desc: 'AI summary - IOC extraction - MITRE TTP mapping - STIX bundle' },
  { id: 'composer', label: 'Report Composer', desc: 'Cover - summary - findings - IOCs - sources - TLP - export to PDF/DOCX' },
];

export default function ReportHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('analyzer');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<ScrollText size={28} />}
      title="Report Hub"
      description="Analyze external reports and compose investigation reports - AI summarisation, IOC extraction, MITRE mapping, and PDF/DOCX export."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Report tools"
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
          {activeTab === 'analyzer' && <ReportAnalyzer />}
          {activeTab === 'composer' && <ReportComposer />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
