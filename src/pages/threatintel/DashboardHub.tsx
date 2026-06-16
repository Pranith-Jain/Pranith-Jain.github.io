import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
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
const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard'));
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
  | 'observe'
  | 'analytics';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Intel dashboard overview' },
  { id: 'global-pulse', label: 'Global Pulse', desc: 'Global threat pulse monitoring' },
  { id: 'threat-pulse', label: 'Threat Pulse', desc: 'Threat pulse tracking' },
  { id: 'certstream', label: 'CertStream', desc: 'Certificate transparency live feed' },
  { id: 'pir', label: 'PIR Dashboard', desc: 'PIR dashboard' },
  { id: 'metrics', label: 'Metrics', desc: 'Ten-panel metrics board' },
  { id: 'analytics', label: 'Analytics & Ops', desc: 'Platform health, feed reliability, and intel metrics' },
  { id: 'predictions', label: 'Predictions', desc: 'Threat predictions' },
  { id: 'predictive', label: 'Predictive', desc: 'Predictive intelligence' },
  { id: 'analyze', label: 'Analyze', desc: 'Intelligence analysis' },
  { id: 'assessments', label: 'Assessments', desc: 'Security assessments' },
  { id: 'observe', label: 'Observe', desc: 'Observation dashboard' },
];
const HUB_PATH = 'predictive';
const DEFAULT_TAB: TabId = 'dashboard';
export default function DashboardHub(): JSX.Element {
  // Deep links like /threatintel/predictive/metrics should land on the right
  // tab. Seed state with the default tab so the SSR/first client render
  // match the hub-base prerender; sync to the URL param in a post-mount
  // effect.
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);
  useEffect(() => {
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
    } else if (!tab) {
      navigate(`/threatintel/${HUB_PATH}/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tab, navigate]);
  const onSelect = (id: TabId) => {
    if (id === activeTab) return;
    setActiveTab(id);
    navigate(`/threatintel/${HUB_PATH}/${id}`, { replace: true });
  };
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Dashboard tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
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
        {activeTab === 'analytics' && <AnalyticsDashboard />}
      </Suspense>
    </HubShell>
  );
}
