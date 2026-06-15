import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Bug, Loader2 } from 'lucide-react';
const CveIntel = lazy(() => import('./CveIntel'));
const GithubAdvisories = lazy(() => import('./GithubAdvisories'));
const CveResourcesCatalog = lazy(() => import('../dfir/CveResourcesCatalog'));
type TabId = 'cves' | 'advisories' | 'resources';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'cves', label: 'CVE Intel', desc: 'Unified CVE intelligence hub' },
  { id: 'advisories', label: 'Advisories', desc: 'GitHub security advisories' },
  { id: 'resources', label: 'Resources', desc: 'CVE resource catalogs' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function VulnHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('cves');
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Bug size={28} />}
      title="Vulnerability Intelligence"
      description="CVE feeds, advisories, and vulnerability resource catalogs."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6"
        aria-label="Vulnerability tools"
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
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {TABS.find((t) => t.id === activeTab)?.desc}
      </p>
      <div role="tabpanel">
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'cves' && <CveIntel />}
          {activeTab === 'advisories' && <GithubAdvisories />}
          {activeTab === 'resources' && <CveResourcesCatalog />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
