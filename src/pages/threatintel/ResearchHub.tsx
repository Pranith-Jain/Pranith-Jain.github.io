import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { BookOpen, Loader2 } from 'lucide-react';
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
function TabFallback() { return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-slate-400 mr-2" /><span className="text-sm font-mono text-slate-500">Loading…</span></div>; }
export default function ResearchHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('research');
  return (
    <DataPageLayout backTo="/threatintel" icon={<BookOpen size={28} />} title="Research & Reports" description="Research posts, reports, write-ups, and vendor intelligence.">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="Research tools">
        {TABS.map((t) => (<button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} aria-selected={activeTab === t.id} role="tab">{t.label}</button>))}
      </nav>
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">{TABS.find((t) => t.id === activeTab)?.desc}</p>
      <div role="tabpanel"><Suspense fallback={<TabFallback />}>
        {activeTab === 'research' && <ResearchIndex />}
        {activeTab === 'reports' && <Reports />}
        {activeTab === 'ai' && <AIReportShowcase />}
        {activeTab === 'writeups' && <Writeups />}
        {activeTab === 'signal' && <ResearchSignal />}
        {activeTab === 'redhunt' && <RedHuntInsights />}
        {activeTab === 'redhunt-labs' && <RedHuntLabsResearch />}
        {activeTab === 'volexity' && <VolexityThreatIntel />}
      </Suspense></div>
    </DataPageLayout>
  );
}
