import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Crosshair } from 'lucide-react';

const Tracer = lazy(() => import('./Tracer'));
const Tracepulse = lazy(() => import('./Tracepulse'));
const Quicktrace = lazy(() => import('./Quicktrace'));

type TabId = 'tracer' | 'tracepulse' | 'quicktrace';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'tracer', label: 'TRACER', desc: 'Cross-chain transaction tracer for AML and ransomware investigations' },
  { id: 'tracepulse', label: 'TRACEPULSE', desc: 'Real-time crypto flow monitor - alerts on suspicious wallet activity' },
  { id: 'quicktrace', label: 'QUICKTRACE', desc: 'Quick lookup for a crypto address or transaction hash' },
];

export default function CryptoTracer(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('tracer');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Crosshair size={28} />}
      title="Crypto Tracer"
      description="Cross-chain transaction tracing, real-time flow monitoring, and quick address lookups for AML and ransomware investigations."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Crypto tracer tools"
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
          {activeTab === 'tracer' && <Tracer />}
          {activeTab === 'tracepulse' && <Tracepulse />}
          {activeTab === 'quicktrace' && <Quicktrace />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
