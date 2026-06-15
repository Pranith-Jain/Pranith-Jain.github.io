import { lazy, useState } from 'react';
import { HubShell } from '../../components/HubShell';
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
export default function DashboardHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Dashboard tools" tone="rose">
      {activeTab === 'dashboard' && <IntelDashboard />}
      {activeTab === 'predictions' && <Predictions />}
      {activeTab === 'predictive' && <PredictiveIntel />}
      {activeTab === 'analyze' && <Analyze />}
      {activeTab === 'assessments' && <Assessments />}
      {activeTab === 'observe' && <Observe />}
    </HubShell>
  );
}
