import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Crosshair, Loader2 } from 'lucide-react';
const LiveIocs = lazy(() => import('./LiveIocs'));
const IocEnrichment = lazy(() => import('./IocEnrichment'));
const IocFeedsPage = lazy(() => import('./IocFeedsPage'));
const EntityResolution = lazy(() => import('./EntityResolution'));
const C2Tracker = lazy(() => import('./C2Tracker'));
const ThreatMap = lazy(() => import('../dfir/ThreatMap'));
type TabId = 'live' | 'enrichment' | 'feeds' | 'entity' | 'c2' | 'map';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'live', label: 'Live', desc: 'Real-time IOC feed' },
  { id: 'enrichment', label: 'Enrichment', desc: 'IOC enrichment and lookup' },
  { id: 'feeds', label: 'Feeds', desc: 'IOC feed catalog' },
  { id: 'entity', label: 'Entity', desc: 'Entity resolution across intel sources' },
  { id: 'c2', label: 'C2', desc: 'C2 infrastructure tracker' },
  { id: 'map', label: 'Threat Map', desc: 'Geo-visualization of IOCs by country' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function IocHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('live');
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Crosshair size={28} />}
      title="IOC Intelligence"
      description="Live IOC feeds, enrichment, entity resolution, and geo-visualization."
    >
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="IOC tools">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
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
          {activeTab === 'live' && <LiveIocs />}
          {activeTab === 'enrichment' && <IocEnrichment />}
          {activeTab === 'feeds' && <IocFeedsPage />}
          {activeTab === 'entity' && <EntityResolution />}
          {activeTab === 'c2' && <C2Tracker />}
          {activeTab === 'map' && <ThreatMap />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
