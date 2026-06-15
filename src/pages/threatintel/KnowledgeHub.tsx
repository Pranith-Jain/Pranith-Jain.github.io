import { Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
const Wiki = lazy(() => import('../dfir/Wiki'));
const MitreMatrix = lazy(() => import('../dfir/MitreMatrix'));
const F3ead = lazy(() => import('./F3ead'));
const InsiderThreatMatrix = lazy(() => import('./InsiderThreatMatrix'));
const OwaspAiLandscape = lazy(() => import('./OwaspAiLandscape'));
const LlmThreatAtlas = lazy(() => import('./LlmThreatAtlas'));
type TabId = 'wiki' | 'mitre' | 'f3ead' | 'insider' | 'owasp' | 'llm';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'wiki', label: 'Wiki', desc: 'Threat intelligence wiki' },
  { id: 'mitre', label: 'MITRE', desc: 'MITRE ATT&CK matrix' },
  { id: 'f3ead', label: 'F3EAD', desc: 'F3EAD intelligence framework' },
  { id: 'insider', label: 'Insider', desc: 'Insider threat matrix' },
  { id: 'owasp', label: 'OWASP AI', desc: 'OWASP AI security landscape' },
  { id: 'llm', label: 'LLM Atlas', desc: 'LLM threat atlas' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function KnowledgeHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('wiki');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4"
        aria-label="Knowledge tools"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            aria-selected={activeTab === t.id}
            role="tab"
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'wiki' && <Wiki />}
        {activeTab === 'mitre' && <MitreMatrix />}
        {activeTab === 'f3ead' && <F3ead />}
        {activeTab === 'insider' && <InsiderThreatMatrix />}
        {activeTab === 'owasp' && <OwaspAiLandscape />}
        {activeTab === 'llm' && <LlmThreatAtlas />}
      </Suspense>
    </div>
  );
}
