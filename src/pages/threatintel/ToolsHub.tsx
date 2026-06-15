import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Wrench, Loader2 } from 'lucide-react';
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
function TabFallback() { return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400 mr-2" /><span className="text-sm font-mono text-slate-500">Loading…</span></div>; }
export default function ToolsHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('copilot');
  return (
    <DataPageLayout backTo="/threatintel" icon={<Wrench size={28} />} title="Tools & Utilities" description="Copilot, MCP search, MISP browser, STIX tools, and case management.">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="Utility tools">
        {TABS.map((t) => (<button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} aria-selected={activeTab === t.id} role="tab">{t.label}</button>))}
      </nav>
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">{TABS.find((t) => t.id === activeTab)?.desc}</p>
      <div role="tabpanel"><Suspense fallback={<TabFallback />}>
        {activeTab === 'copilot' && <CopilotChat />}
        {activeTab === 'mcp' && <McpSearch />}
        {activeTab === 'misp' && <MispBrowser />}
        {activeTab === 'stix' && <StixBundleBrowser />}
        {activeTab === 'graph' && <RelationshipGraph />}
        {activeTab === 'investigations' && <Investigations />}
        {activeTab === 'watches' && <Watches />}
      </Suspense></div>
    </DataPageLayout>
  );
}
