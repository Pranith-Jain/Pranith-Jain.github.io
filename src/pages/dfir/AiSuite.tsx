import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Sparkles } from 'lucide-react';

const InsightAi = lazy(() => import('./InsightAi'));
const QuerycraftAi = lazy(() => import('./QuerycraftAi'));
const ChronoAi = lazy(() => import('./ChronoAi'));
const MalbriefAi = lazy(() => import('./MalbriefAi'));
const VerdiktAi = lazy(() => import('./VerdiktAi'));

type TabId = 'insight' | 'querycraft' | 'chrono' | 'malbrief' | 'verdikt';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'insight', label: 'INSIGHT-AI', desc: 'AI-assisted incident summarisation and pattern detection' },
  { id: 'querycraft', label: 'QUERYCRAFT-AI', desc: 'AI-assisted KQL / SPL / Lucene generation' },
  { id: 'chrono', label: 'CHRONO-AI', desc: 'AI-assisted timeline reconstruction from logs + reports' },
  { id: 'malbrief', label: 'MALBRIEF-AI', desc: 'AI-assisted malware family briefing from sample + sandbox output' },
  { id: 'verdikt', label: 'VERDIKT-AI', desc: 'AI-assisted IOC verdict - explain cross-source disagreement' },
];

export default function AiSuite(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('insight');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Sparkles size={28} />}
      title="AI Suite"
      description="AI-assisted investigation tools - incident summarisation, query generation, timeline reconstruction, malware briefing, and IOC verdicts."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="AI suite tools"
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
          {activeTab === 'insight' && <InsightAi />}
          {activeTab === 'querycraft' && <QuerycraftAi />}
          {activeTab === 'chrono' && <ChronoAi />}
          {activeTab === 'malbrief' && <MalbriefAi />}
          {activeTab === 'verdikt' && <VerdiktAi />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
