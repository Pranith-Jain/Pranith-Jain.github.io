import { lazy, useState } from 'react';
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
export default function ToolsHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('copilot');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Utility tools" tone="rose">
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
