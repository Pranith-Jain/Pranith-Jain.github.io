import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
const CveIntel = lazy(() => import('./CveIntel'));
const GithubAdvisories = lazy(() => import('./GithubAdvisories'));
const CveResourcesCatalog = lazy(() => import('../dfir/CveResourcesCatalog'));
const K8sCve = lazy(() => import('./K8sCve'));
const ExploitableCves = lazy(() => import('./ExploitableCves'));
const CveList = lazy(() => import('./CveList'));
type TabId = 'cves' | 'advisories' | 'resources' | 'k8s' | 'exploitable' | 'list';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'cves', label: 'CVE Intel', desc: 'Unified CVE intelligence hub' },
  { id: 'advisories', label: 'Advisories', desc: 'GitHub security advisories' },
  { id: 'resources', label: 'Resources', desc: 'CVE resource catalogs' },
  { id: 'k8s', label: 'Kubernetes', desc: 'Kubernetes-specific CVE feed' },
  { id: 'exploitable', label: 'Exploitable', desc: 'CVEs with known exploits' },
  { id: 'list', label: 'CVE List', desc: 'Full CVE listing' },
];
const HUB_PATH = 'cves';
const DEFAULT_TAB: TabId = 'cves';
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function VulnHub(): JSX.Element {
  // Deep links like /threatintel/cves/advisories should land on the right
  // tab. To keep SSR/first client render identical (the worker serves the
  // hub-base prerender for every tab URL, so any other initial value would
  // produce a hydration mismatch), seed state with the default tab and
  // sync to the URL param in a post-mount effect. The brief default→target
  // flash is the cost of sharing one prerender across every tab URL.
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);
  useEffect(() => {
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
    } else if (!tab) {
      // Bare /threatintel/cves — normalize to the default tab URL.
      navigate(`/threatintel/${HUB_PATH}/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tab, navigate]);
  const onSelect = (id: TabId) => {
    if (id === activeTab) return;
    setActiveTab(id);
    navigate(`/threatintel/${HUB_PATH}/${id}`, { replace: true });
  };
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4"
        aria-label="Vulnerability tools"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
              activeTab === t.id
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            aria-selected={activeTab === t.id}
            role="tab"
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Suspense fallback={<TabFallback />}>
        {activeTab === 'cves' && <CveIntel />}
        {activeTab === 'advisories' && <GithubAdvisories />}
        {activeTab === 'resources' && <CveResourcesCatalog />}
        {activeTab === 'k8s' && <K8sCve />}
        {activeTab === 'exploitable' && <ExploitableCves />}
        {activeTab === 'list' && <CveList />}
      </Suspense>
    </div>
  );
}
