import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ShieldCheck, Loader2 } from 'lucide-react';
const Detections = lazy(() => import('./Detections'));
const DisarmFramework = lazy(() => import('./DisarmFramework'));
const YaraPage = lazy(() => import('./Yarahub'));
const ThreatMap = lazy(() => import('../dfir/ThreatMap'));
const ThreatSignalRss = lazy(() => import('./ThreatSignalRss'));
type TabId = 'detections' | 'disarm' | 'yara' | 'map' | 'signal';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'detections', label: 'Detections', desc: 'Detection rule catalog' },
  { id: 'disarm', label: 'DISARM', desc: 'DISARM framework' },
  { id: 'yara', label: 'YARA', desc: 'YARA rule browser' },
  { id: 'map', label: 'Threat Map', desc: 'Threat map visualization' },
  { id: 'signal', label: 'Signal', desc: 'ThreatSignal RSS feed' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function DetectionHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('detections');
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldCheck size={28} />}
      title="Detection & Rules"
      description="Detection rules, DISARM framework, YARA, and threat mapping."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6"
        aria-label="Detection tools"
      >
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
          {activeTab === 'detections' && <Detections />}
          {activeTab === 'disarm' && <DisarmFramework />}
          {activeTab === 'yara' && <YaraPage />}
          {activeTab === 'map' && <ThreatMap />}
          {activeTab === 'signal' && <ThreatSignalRss />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
