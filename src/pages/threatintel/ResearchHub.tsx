import { Suspense, lazy, useEffect, useState } from 'react';
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
const ResearchPost = lazy(() => import('./ResearchPost'));
const AttackFlowLibrary = lazy(() => import('./AttackFlowLibrary'));
const CampaignGenerator = lazy(() => import('./CampaignGenerator'));
const KnowledgeGraph = lazy(() => import('./KnowledgeGraph'));
const ACH = lazy(() => import('./ACH'));
type TabId =
  | 'research'
  | 'reports'
  | 'ai'
  | 'writeups'
  | 'signal'
  | 'redhunt'
  | 'redhunt-labs'
  | 'volexity'
  | 'post'
  | 'attack-flow'
  | 'campaign-gen'
  | 'knowledge'
  | 'ach';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'research', label: 'Research', desc: 'Research post index' },
  { id: 'reports', label: 'Reports', desc: 'Intelligence reports' },
  { id: 'ai', label: 'AI Reports', desc: 'AI-generated reports' },
  { id: 'writeups', label: 'Write-ups', desc: 'Security write-ups' },
  { id: 'signal', label: 'Signal', desc: 'Research signal feed' },
  { id: 'redhunt', label: 'RedHunt', desc: 'RedHunt Labs insights' },
  { id: 'redhunt-labs', label: 'RedHunt Labs', desc: 'RedHunt Labs research' },
  { id: 'volexity', label: 'Volexity', desc: 'Volexity threat intelligence' },
  { id: 'post', label: 'Post', desc: 'Individual research post' },
  { id: 'attack-flow', label: 'Attack Flow', desc: 'Attack flow library' },
  { id: 'campaign-gen', label: 'Campaign Gen', desc: 'Campaign generator' },
  { id: 'knowledge', label: 'Knowledge', desc: 'Knowledge graph' },
  { id: 'ach', label: 'ACH', desc: 'Analysis of competing hypotheses' },
];
const HUB_PATH = 'research-hub';
const DEFAULT_TAB: TabId = 'research';
export default function ResearchHub(): JSX.Element {
  // Deep links like /threatintel/research-hub/reports should land on the
  // right tab. Seed state with the default tab so the SSR/first client
  // render match the hub-base prerender; sync to the URL param in a
  // post-mount effect.
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
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Research tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'research' && <ResearchIndex />}
        {activeTab === 'reports' && <Reports />}
        {activeTab === 'ai' && <AIReportShowcase />}
        {activeTab === 'writeups' && <Writeups />}
        {activeTab === 'signal' && <ResearchSignal />}
        {activeTab === 'redhunt' && <RedHuntInsights />}
        {activeTab === 'redhunt-labs' && <RedHuntLabsResearch />}
        {activeTab === 'volexity' && <VolexityThreatIntel />}
        {activeTab === 'post' && <ResearchPost />}
        {activeTab === 'attack-flow' && <AttackFlowLibrary />}
        {activeTab === 'campaign-gen' && <CampaignGenerator />}
        {activeTab === 'knowledge' && <KnowledgeGraph />}
        {activeTab === 'ach' && <ACH />}
      </Suspense>
    </HubShell>
  );
}
