import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Eye, Loader2 } from 'lucide-react';
const DarkWeb = lazy(() => import('./DarkWebOsintTools'));
const DarknetMarketsTimeline = lazy(() => import('./DarknetMarketsTimeline'));
const BreachForums = lazy(() => import('./BreachForums'));
const DeepDarkCTI = lazy(() => import('./DeepDarkCTI'));
const CyberCrime = lazy(() => import('./CyberCrime'));
const PhysicalBitcoinAttacks = lazy(() => import('./PhysicalBitcoinAttacks'));
type TabId = 'watch' | 'markets' | 'forums' | 'deepdark' | 'crime' | 'bitcoin';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'watch', label: 'Watch', desc: 'Dark web monitoring dashboard' },
  { id: 'markets', label: 'Markets', desc: 'Darknet market timelines' },
  { id: 'forums', label: 'Forums', desc: 'Breach forum tracker' },
  { id: 'deepdark', label: 'DeepDark', desc: 'DeepDark CTI sources' },
  { id: 'crime', label: 'Crime', desc: 'Cybercrime ecosystem intelligence' },
  { id: 'bitcoin', label: 'Bitcoin', desc: 'Physical Bitcoin attack tracking' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function DarkwebHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('watch');
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Eye size={28} />}
      title="Dark Web Intelligence"
      description="Dark web monitoring, forums, markets, and underground activity."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6"
        aria-label="Dark web tools"
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
          {activeTab === 'watch' && <DarkWeb />}
          {activeTab === 'markets' && <DarknetMarketsTimeline />}
          {activeTab === 'forums' && <BreachForums />}
          {activeTab === 'deepdark' && <DeepDarkCTI />}
          {activeTab === 'crime' && <CyberCrime />}
          {activeTab === 'bitcoin' && <PhysicalBitcoinAttacks />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
