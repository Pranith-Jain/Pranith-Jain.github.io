import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Target, Loader2 } from 'lucide-react';
const Campaigns = lazy(() => import('./Campaigns'));
const CampaignLifecycle = lazy(() => import('./CampaignLifecycle'));
const CampaignGenerator = lazy(() => import('./CampaignGenerator'));
const CrossCampaignCorrelation = lazy(() => import('./CrossCampaignCorrelation'));
type TabId = 'active' | 'lifecycle' | 'generator' | 'cross';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'active', label: 'Active', desc: 'Active campaign tracker' },
  { id: 'lifecycle', label: 'Lifecycle', desc: 'Campaign lifecycle analysis' },
  { id: 'generator', label: 'Generator', desc: 'AI-powered campaign generation' },
  { id: 'cross', label: 'Cross-campaign', desc: 'Cross-campaign correlation' },
];
function TabFallback() { return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400 mr-2" /><span className="text-sm font-mono text-slate-500">Loading…</span></div>; }
export default function CampaignHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('active');
  return (
    <DataPageLayout backTo="/threatintel" icon={<Target size={28} />} title="Campaign Intelligence" description="Campaign tracking, lifecycle, generation, and cross-campaign correlation.">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="Campaign tools">
        {TABS.map((t) => (<button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} aria-selected={activeTab === t.id} role="tab">{t.label}</button>))}
      </nav>
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">{TABS.find((t) => t.id === activeTab)?.desc}</p>
      <div role="tabpanel"><Suspense fallback={<TabFallback />}>
        {activeTab === 'active' && <Campaigns />}
        {activeTab === 'lifecycle' && <CampaignLifecycle />}
        {activeTab === 'generator' && <CampaignGenerator />}
        {activeTab === 'cross' && <CrossCampaignCorrelation />}
      </Suspense></div>
    </DataPageLayout>
  );
}
