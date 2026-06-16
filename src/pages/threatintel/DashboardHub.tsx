import { Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
const IntelDashboard = lazy(() => import('./IntelDashboard'));
const GlobalPulse = lazy(() => import('./GlobalPulse'));
const ThreatPulse = lazy(() => import('./ThreatPulse'));
const CertStreamLive = lazy(() => import('./CertStreamLive'));
const PirDashboard = lazy(() => import('./PirDashboard'));
const Metrics = lazy(() => import('./Metrics'));
const Predictions = lazy(() => import('./Predictions'));
const PredictiveIntel = lazy(() => import('./PredictiveIntel'));
const Analyze = lazy(() => import('./Analyze'));
const Assessments = lazy(() => import('./Assessments'));
const Observe = lazy(() => import('./Observe'));
type TabId =
  | 'dashboard'
  | 'global-pulse'
  | 'threat-pulse'
  | 'certstream'
  | 'pir'
  | 'metrics'
  | 'predictions'
  | 'predictive'
  | 'analyze'
  | 'assessments'
  | 'observe';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Intel dashboard overview' },
  { id: 'global-pulse', label: 'Global Pulse', desc: 'Global threat pulse monitoring' },
  { id: 'threat-pulse', label: 'Threat Pulse', desc: 'Threat pulse tracking' },
  { id: 'certstream', label: 'CertStream', desc: 'Certificate transparency live feed' },
  { id: 'pir', label: 'PIR Dashboard', desc: 'PIR dashboard' },
  { id: 'metrics', label: 'Metrics', desc: 'Ten-panel metrics board' },
  { id: 'predictions', label: 'Predictions', desc: 'Threat predictions' },
  { id: 'predictive', label: 'Predictive', desc: 'Predictive intelligence' },
  { id: 'analyze', label: 'Analyze', desc: 'Intelligence analysis' },
  { id: 'assessments', label: 'Assessments', desc: 'Security assessments' },
  { id: 'observe', label: 'Observe', desc: 'Observation dashboard' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function DashboardHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4"
        aria-label="Dashboard tools"
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
        {activeTab === 'dashboard' && <IntelDashboard />}
        {activeTab === 'global-pulse' && <GlobalPulse />}
        {activeTab === 'threat-pulse' && <ThreatPulse />}
        {activeTab === 'certstream' && <CertStreamLive />}
        {activeTab === 'pir' && <PirDashboard />}
        {activeTab === 'metrics' && <Metrics />}
        {activeTab === 'predictions' && <Predictions />}
        {activeTab === 'predictive' && <PredictiveIntel />}
        {activeTab === 'analyze' && <Analyze />}
        {activeTab === 'assessments' && <Assessments />}
        {activeTab === 'observe' && <Observe />}
      </Suspense>
    </div>
  );
}
