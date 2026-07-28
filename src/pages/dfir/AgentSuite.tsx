import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Bot } from 'lucide-react';

const AgentInvestigator = lazy(() => import('./AgentInvestigator'));
const TieEnrich = lazy(() => import('./TieEnrich'));
const AgentMap = lazy(() => import('./AgentMap'));

type TabId = 'investigator' | 'enrich' | 'map';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'investigator', label: 'INVESTIGATOR', desc: 'Autonomous investigation agent for threat triage' },
  { id: 'enrich', label: 'ENRICH', desc: 'Threat intelligence enrichment agent' },
  { id: 'map', label: 'MAP', desc: 'Visualise investigation relationships and findings' },
];

export default function AgentSuite(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('investigator');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Bot size={28} />}
      title="Agent Suite"
      description="Autonomous investigation, enrichment, and mapping agents for threat intelligence workflows."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Agent suite tools"
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
          {activeTab === 'investigator' && <AgentInvestigator />}
          {activeTab === 'enrich' && <TieEnrich />}
          {activeTab === 'map' && <AgentMap />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
