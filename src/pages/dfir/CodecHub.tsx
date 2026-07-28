import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Code2 } from 'lucide-react';

const Decode = lazy(() => import('./Decode'));
const Encoder = lazy(() => import('./Encoder'));

type TabId = 'decode' | 'encode';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'decode', label: 'DECODE', desc: 'Decode encoded strings and payloads' },
  { id: 'encode', label: 'ENCODE', desc: 'Encode strings into various formats' },
];

export default function CodecHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('decode');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Code2 size={28} />}
      title="Codec Hub"
      description="Encode and decode strings across common formats used in security analysis."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Codec hub tools"
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
          {activeTab === 'decode' && <Decode />}
          {activeTab === 'encode' && <Encoder />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
