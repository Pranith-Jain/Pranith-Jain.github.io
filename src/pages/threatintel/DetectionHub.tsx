import { Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
const Detections = lazy(() => import('./Detections'));
const DisarmFramework = lazy(() => import('./DisarmFramework'));
const YaraPage = lazy(() => import('./Yarahub'));
const ThreatSignalRss = lazy(() => import('./ThreatSignalRss'));
type TabId = 'detections' | 'disarm' | 'yara' | 'signal';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'detections', label: 'Detections', desc: 'Detection rule catalog' },
  { id: 'disarm', label: 'DISARM', desc: 'DISARM framework' },
  { id: 'yara', label: 'YARA', desc: 'YARA rule browser' },
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
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4"
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
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'detections' && <Detections />}
        {activeTab === 'disarm' && <DisarmFramework />}
        {activeTab === 'yara' && <YaraPage />}
        {activeTab === 'signal' && <ThreatSignalRss />}
      </Suspense>
    </div>
  );
}
