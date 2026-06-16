import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const CopilotChat = lazy(() => import('./CopilotChat'));
const McpSearch = lazy(() => import('./McpSearch'));
const MispBrowser = lazy(() => import('./MispBrowser'));
const StixBundleBrowser = lazy(() => import('./StixBundleBrowser'));
const RelationshipGraph = lazy(() => import('./RelationshipGraph'));
const Investigations = lazy(() => import('./Investigations'));
const Watches = lazy(() => import('./Watches'));
const Settings = lazy(() => import('./Settings'));
const Copilot = lazy(() => import('./Copilot'));
const UnifiedSearch = lazy(() => import('./UnifiedSearch'));
type TabId =
  | 'copilot'
  | 'mcp'
  | 'misp'
  | 'stix'
  | 'graph'
  | 'investigations'
  | 'watches'
  | 'settings'
  | 'copilot-chat'
  | 'unified-search';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'copilot', label: 'Copilot', desc: 'AI copilot chat' },
  { id: 'mcp', label: 'MCP', desc: 'MCP search' },
  { id: 'misp', label: 'MISP', desc: 'MISP browser' },
  { id: 'stix', label: 'STIX', desc: 'STIX bundle browser' },
  { id: 'graph', label: 'Graph', desc: 'Relationship graph' },
  { id: 'investigations', label: 'Cases', desc: 'Investigation case manager' },
  { id: 'watches', label: 'Watches', desc: 'Watch lists' },
  { id: 'settings', label: 'Settings', desc: 'Platform settings' },
  { id: 'copilot-chat', label: 'Copilot Chat', desc: 'AI copilot interface' },
  { id: 'unified-search', label: 'Unified Search', desc: 'Cross-source search' },
];
const HUB_PATH = 'tools';
const DEFAULT_TAB: TabId = 'copilot';
export default function ToolsHub(): JSX.Element {
  // Deep links like /threatintel/tools/misp should land on the right tab.
  // Seed state with the default tab so the SSR/first client render match
  // the hub-base prerender; sync to the URL param in a post-mount effect.
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
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Utility tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'copilot' && <Copilot />}
        {activeTab === 'mcp' && <McpSearch />}
        {activeTab === 'misp' && <MispBrowser />}
        {activeTab === 'stix' && <StixBundleBrowser />}
        {activeTab === 'graph' && <RelationshipGraph />}
        {activeTab === 'investigations' && <Investigations />}
        {activeTab === 'watches' && <Watches />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'copilot-chat' && <CopilotChat />}
        {activeTab === 'unified-search' && <UnifiedSearch />}
      </Suspense>
    </HubShell>
  );
}
