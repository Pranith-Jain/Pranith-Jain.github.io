import { Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
const OsintFramework = lazy(() => import('../dfir/OsintFramework'));
const OsintCliTools = lazy(() => import('./OsintCliTools'));
const OsintCountryMap = lazy(() => import('./OsintCountryMap'));
const CuratedToolbox = lazy(() => import('./CuratedToolbox'));
const SecopsCatalog = lazy(() => import('../dfir/SecopsCatalog'));
type TabId = 'framework' | 'cli' | 'map' | 'toolbox' | 'secops';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'framework', label: 'Framework', desc: 'OSINT framework browser' },
  { id: 'cli', label: 'CLI Tools', desc: 'CLI tools catalog' },
  { id: 'map', label: 'Country Map', desc: 'Country-based OSINT map' },
  { id: 'toolbox', label: 'Toolbox', desc: 'Curated security toolbox' },
  { id: 'secops', label: 'SecOps', desc: 'SecOps tools catalog' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function OsintHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('framework');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4"
        aria-label="OSINT tools"
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
        {activeTab === 'framework' && <OsintFramework />}
        {activeTab === 'cli' && <OsintCliTools />}
        {activeTab === 'map' && <OsintCountryMap />}
        {activeTab === 'toolbox' && <CuratedToolbox />}
        {activeTab === 'secops' && <SecopsCatalog />}
      </Suspense>
    </div>
  );
}
