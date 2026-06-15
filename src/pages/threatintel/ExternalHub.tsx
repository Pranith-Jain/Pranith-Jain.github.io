import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Link, Loader2 } from 'lucide-react';
const ExternalResources = lazy(() => import('./ExternalResources'));
const SupplyChainIntelligence = lazy(() => import('./SupplyChainIntelligence'));
const AwesomeLists = lazy(() => import('../dfir/AwesomeLists'));
type TabId = 'external' | 'supply' | 'awesome';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'external', label: 'External', desc: 'External resources directory' },
  { id: 'supply', label: 'Supply Chain', desc: 'Supply chain intelligence' },
  { id: 'awesome', label: 'Awesome Lists', desc: 'Awesome security lists' },
];
function TabFallback() { return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400 mr-2" /><span className="text-sm font-mono text-slate-500">Loading…</span></div>; }
export default function ExternalHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('external');
  return (
    <DataPageLayout backTo="/threatintel" icon={<Link size={28} />} title="External Resources & References" description="External resource catalogs, supply chain intel, and awesome lists.">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="External tools">
        {TABS.map((t) => (<button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} aria-selected={activeTab === t.id} role="tab">{t.label}</button>))}
      </nav>
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">{TABS.find((t) => t.id === activeTab)?.desc}</p>
      <div role="tabpanel"><Suspense fallback={<TabFallback />}>
        {activeTab === 'external' && <ExternalResources />}
        {activeTab === 'supply' && <SupplyChainIntelligence />}
        {activeTab === 'awesome' && <AwesomeLists />}
      </Suspense></div>
    </DataPageLayout>
  );
}
