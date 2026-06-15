import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { BarChart3, Loader2 } from 'lucide-react';
const IntelDashboard = lazy(() => import('./IntelDashboard'));
const Predictions = lazy(() => import('./Predictions'));
const PredictiveIntel = lazy(() => import('./PredictiveIntel'));
const Analyze = lazy(() => import('./Analyze'));
const Assessments = lazy(() => import('./Assessments'));
const Observe = lazy(() => import('./Observe'));
type TabId = 'dashboard' | 'predictions' | 'predictive' | 'analyze' | 'assessments' | 'observe';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Intel dashboard overview' },
  { id: 'predictions', label: 'Predictions', desc: 'Threat predictions' },
  { id: 'predictive', label: 'Predictive', desc: 'Predictive intelligence' },
  { id: 'analyze', label: 'Analyze', desc: 'Intelligence analysis' },
  { id: 'assessments', label: 'Assessments', desc: 'Security assessments' },
  { id: 'observe', label: 'Observe', desc: 'Observation dashboard' },
];
function TabFallback() { return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400 mr-2" /><span className="text-sm font-mono text-slate-500">Loading…</span></div>; }
export default function DashboardHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  return (
    <DataPageLayout backTo="/threatintel" icon={<BarChart3 size={28} />} title="Intel Dashboards" description="Dashboard, predictions, intelligence analysis, and assessments.">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="Dashboard tools">
        {TABS.map((t) => (<button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} aria-selected={activeTab === t.id} role="tab">{t.label}</button>))}
      </nav>
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">{TABS.find((t) => t.id === activeTab)?.desc}</p>
      <div role="tabpanel"><Suspense fallback={<TabFallback />}>
        {activeTab === 'dashboard' && <IntelDashboard />}
        {activeTab === 'predictions' && <Predictions />}
        {activeTab === 'predictive' && <PredictiveIntel />}
        {activeTab === 'analyze' && <Analyze />}
        {activeTab === 'assessments' && <Assessments />}
        {activeTab === 'observe' && <Observe />}
      </Suspense></div>
    </DataPageLayout>
  );
}
