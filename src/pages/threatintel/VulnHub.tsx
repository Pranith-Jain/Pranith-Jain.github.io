import { Suspense, lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const CveIntel = lazy(() => import('./CveIntel'));
const GithubAdvisories = lazy(() => import('./GithubAdvisories'));
const CveResourcesCatalog = lazy(() => import('../dfir/CveResourcesCatalog'));
type TabId = 'cves' | 'advisories' | 'resources';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'cves', label: 'CVE Intel', desc: 'Unified CVE intelligence hub' },
  { id: 'advisories', label: 'Advisories', desc: 'GitHub security advisories' },
  { id: 'resources', label: 'Resources', desc: 'CVE resource catalogs' },
];
const HUB_PATH = 'cves';
const DEFAULT_TAB: TabId = 'cves';
export default function VulnHub(): JSX.Element {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const activeTab = tab && TABS.some((t) => t.id === tab) ? (tab as TabId) : DEFAULT_TAB;
  useEffect(() => {
    if (!tab || !TABS.some((t) => t.id === tab)) {
      navigate(`/threatintel/${HUB_PATH}/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tab, navigate]);
  return (
    <HubShell
      tabs={TABS}
      active={activeTab}
      onSelect={(id) => navigate(`/threatintel/${HUB_PATH}/${id}`, { replace: true })}
      ariaLabel="Vulnerability tools"
      tone="rose"
    >
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'cves' && <CveIntel />}
        {activeTab === 'advisories' && <GithubAdvisories />}
        {activeTab === 'resources' && <CveResourcesCatalog />}
      </Suspense>
    </HubShell>
  );
}
