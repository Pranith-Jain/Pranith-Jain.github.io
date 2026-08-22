import { TabLoader } from '../../components/ui/TabLoader';
import { Tabs } from '../../components/ui/Tabs';
import { Suspense, lazy, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Crosshair } from 'lucide-react';

const Tracer = lazy(() => import('./Tracer'));
const Tracepulse = lazy(() => import('./Tracepulse'));
const Quicktrace = lazy(() => import('./Quicktrace'));

type TabId = 'tracer' | 'tracepulse' | 'quicktrace';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'tracer', label: 'TRACER', desc: 'Cross-chain transaction tracer for AML and ransomware investigations' },
  {
    id: 'tracepulse',
    label: 'TRACEPULSE',
    desc: 'Real-time crypto flow monitor - alerts on suspicious wallet activity',
  },
  { id: 'quicktrace', label: 'QUICKTRACE', desc: 'Quick lookup for a crypto address or transaction hash' },
];

export default function CryptoTracer(): JSX.Element {
  // Deep-link: /dfir/crypto-tracer?address=<addr|tx-hash> (IOC pivots emit
  // this) pre-seeds the Tracer tab's seed input.
  const [searchParams] = useSearchParams();
  const initialAddress = searchParams.get('address')?.trim() ?? '';
  const [activeTab, setActiveTab] = useState<TabId>('tracer');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Crosshair size={28} />}
      title="Crypto Tracer"
      description="Cross-chain transaction tracing, real-time flow monitoring, and quick address lookups for AML and ransomware investigations."
    >
      <Tabs
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        active={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        variant="underline"
        tabListClassName="mb-4"
      >
        {(active) => (
          <>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
              {TABS.find((t) => t.id === active)?.desc}
            </p>
            <Suspense fallback={<TabLoader />}>
              {active === 'tracer' && <Tracer initialAddress={initialAddress} />}
              {active === 'tracepulse' && <Tracepulse />}
              {active === 'quicktrace' && <Quicktrace />}
            </Suspense>
          </>
        )}
      </Tabs>
    </DataPageLayout>
  );
}
