import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { FileCode } from 'lucide-react';

const YaraManager = lazy(() => import('./YaraManager'));
const RulePlayground = lazy(() => import('./RulePlayground'));

type TabId = 'library' | 'test';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'library', label: 'Rule Library', desc: 'Create, edit, validate, and export YARA rules (localStorage-backed)' },
  { id: 'test', label: 'Test Lab', desc: 'Paste a YARA/Sigma rule + sample, highlight matches' },
];

export default function YaraWorkbench(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('library');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<FileCode size={28} />}
      title="YARA Workbench"
      description="Unified YARA workflow — build rules in the library, then test them against samples in the test lab."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[#1e2030] mb-6"
        aria-label="YARA tools"
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
          {activeTab === 'library' && <YaraManager />}
          {activeTab === 'test' && <RulePlayground />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
