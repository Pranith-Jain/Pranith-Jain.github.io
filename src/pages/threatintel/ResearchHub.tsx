import { Suspense, lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
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
const HUB_PATH = 'research-hub';
const DEFAULT_TAB: TabId = 'research';
export default function ResearchHub(): JSX.Element {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const activeTab = tab && TABS.some((t) => t.id === tab) ? (tab as TabId) : DEFAULT_TAB;
  useEffect(() => {
    if (!tab || !TABS.some((t) => t.id === tab)) {
      navigate(`/threatintel/${HUB_PATH}/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tab, navigate]);
  return (
    <HubShell
      tabs={TABS}
      active={activeTab}
      onSelect={(id) => navigate(`/threatintel/${HUB_PATH}/${id}`, { replace: true })}
      ariaLabel="Research tools"
      tone="rose"
    >
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'research' && <ResearchIndex />}
        {activeTab === 'reports' && <Reports />}
        {activeTab === 'ai' && <AIReportShowcase />}
        {activeTab === 'writeups' && <Writeups />}
        {activeTab === 'signal' && <ResearchSignal />}
        {activeTab === 'redhunt' && <RedHuntInsights />}
        {activeTab === 'redhunt-labs' && <RedHuntLabsResearch />}
        {activeTab === 'volexity' && <VolexityThreatIntel />}
      </Suspense>
    </HubShell>
  );
}
