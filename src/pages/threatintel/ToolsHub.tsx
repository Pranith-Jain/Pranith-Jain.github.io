import { lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
const CopilotChat = lazy(() => import('./CopilotChat'));
const McpSearch = lazy(() => import('./McpSearch'));
const MispBrowser = lazy(() => import('./MispBrowser'));
const StixBundleBrowser = lazy(() => import('./StixBundleBrowser'));
const RelationshipGraph = lazy(() => import('./RelationshipGraph'));
const Investigations = lazy(() => import('./Investigations'));
const Watches = lazy(() => import('./Watches'));
type TabId = 'copilot' | 'mcp' | 'misp' | 'stix' | 'graph' | 'investigations' | 'watches';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'copilot', label: 'Copilot', desc: 'AI copilot chat' },
  { id: 'mcp', label: 'MCP', desc: 'MCP search' },
  { id: 'misp', label: 'MISP', desc: 'MISP browser' },
  { id: 'stix', label: 'STIX', desc: 'STIX bundle browser' },
  { id: 'graph', label: 'Graph', desc: 'Relationship graph' },
  { id: 'investigations', label: 'Cases', desc: 'Investigation case manager' },
  { id: 'watches', label: 'Watches', desc: 'Watch lists' },
];
const HUB_PATH = 'tools';
const DEFAULT_TAB: TabId = 'copilot';
export default function ToolsHub(): JSX.Element {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const activeTab = tab && TABS.some(t => t.id === tab) ? (tab as TabId) : DEFAULT_TAB;
  useEffect(() => {
    if (!tab || !TABS.some(t => t.id === tab)) {
      navigate(`/threatintel/${HUB_PATH}/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tab, navigate]);
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={(id) => navigate(`/threatintel/${HUB_PATH}/${id}`, { replace: true })} ariaLabel="Utility tools" tone="rose">
      {activeTab === 'copilot' && <CopilotChat />}
      {activeTab === 'mcp' && <McpSearch />}
      {activeTab === 'misp' && <MispBrowser />}
      {activeTab === 'stix' && <StixBundleBrowser />}
      {activeTab === 'graph' && <RelationshipGraph />}
      {activeTab === 'investigations' && <Investigations />}
      {activeTab === 'watches' && <Watches />}
    </HubShell>
  );
}
