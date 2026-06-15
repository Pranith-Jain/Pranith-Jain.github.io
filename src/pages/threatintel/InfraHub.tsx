import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Globe, Loader2 } from 'lucide-react';
const CloudThreatLandscape = lazy(() => import('./CloudThreatLandscape'));
const InfraIntel = lazy(() => import('./InfraIntel'));
const Webamon = lazy(() => import('./Webamon'));
const DomainMonitor = lazy(() => import('./DomainMonitor'));
type TabId = 'cloud' | 'infra' | 'webamon' | 'domain';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'cloud', label: 'Cloud', desc: 'Cloud threat landscape' },
  { id: 'infra', label: 'Infrastructure', desc: 'Infrastructure intelligence' },
  { id: 'webamon', label: 'Webamon', desc: 'Web asset monitoring' },
  { id: 'domain', label: 'Domain', desc: 'Domain monitoring and tracking' },
];
function TabFallback() { return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400 mr-2" /><span className="text-sm font-mono text-slate-500">Loading…</span></div>; }
export default function InfraHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('cloud');
  return (
    <DataPageLayout backTo="/threatintel" icon={<Globe size={28} />} title="Infrastructure & Cloud Intelligence" description="Cloud threats, infrastructure search, and domain monitoring.">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="Infrastructure tools">
        {TABS.map((t) => (<button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} aria-selected={activeTab === t.id} role="tab">{t.label}</button>))}
      </nav>
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">{TABS.find((t) => t.id === activeTab)?.desc}</p>
      <div role="tabpanel"><Suspense fallback={<TabFallback />}>
        {activeTab === 'cloud' && <CloudThreatLandscape />}
        {activeTab === 'infra' && <InfraIntel />}
        {activeTab === 'webamon' && <Webamon />}
        {activeTab === 'domain' && <DomainMonitor />}
      </Suspense></div>
    </DataPageLayout>
  );
}
