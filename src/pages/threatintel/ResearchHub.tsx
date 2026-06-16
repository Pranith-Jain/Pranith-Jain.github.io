import { lazy, useState } from 'react';
import { HubShell } from '../../components/HubShell';
const ResearchIndex = lazy(() => import('./Research'));
const Reports = lazy(() => import('./ThreatIntelReports'));
const AIReportShowcase = lazy(() => import('./AIReportShowcase'));
const Writeups = lazy(() => import('./Writeups'));
const ResearchSignal = lazy(() => import('./Signal'));
const RedHuntInsights = lazy(() => import('./RedHuntInsights'));
const RedHuntLabsResearch = lazy(() => import('./RedHuntLabsResearch'));
const VolexityThreatIntel = lazy(() => import('./VolexityThreatIntel'));
type TabId = 'research' | 'reports' | 'ai' | 'writeups' | 'signal' | 'redhunt' | 'redhunt-labs' | 'volexity';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'research', label: 'Research', desc: 'Research post index' },
  { id: 'reports', label: 'Reports', desc: 'Intelligence reports' },
  { id: 'ai', label: 'AI Reports', desc: 'AI-generated reports' },
  { id: 'writeups', label: 'Write-ups', desc: 'Security write-ups' },
  { id: 'signal', label: 'Signal', desc: 'Research signal feed' },
  { id: 'redhunt', label: 'RedHunt', desc: 'RedHunt Labs insights' },
  { id: 'redhunt-labs', label: 'RedHunt Labs', desc: 'RedHunt Labs research' },
  { id: 'volexity', label: 'Volexity', desc: 'Volexity threat intelligence' },
];
export default function ResearchHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('research');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Research tools" tone="rose">
      {activeTab === 'research' && <ResearchIndex />}
      {activeTab === 'reports' && <Reports />}
      {activeTab === 'ai' && <AIReportShowcase />}
      {activeTab === 'writeups' && <Writeups />}
      {activeTab === 'signal' && <ResearchSignal />}
      {activeTab === 'redhunt' && <RedHuntInsights />}
      {activeTab === 'redhunt-labs' && <RedHuntLabsResearch />}
      {activeTab === 'volexity' && <VolexityThreatIntel />}
    </HubShell>
  );
}
