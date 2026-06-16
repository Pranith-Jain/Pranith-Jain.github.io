import { Suspense, lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
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
const HUB_PATH = 'osint';
const DEFAULT_TAB: TabId = 'framework';
export default function OsintHub(): JSX.Element {
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
      ariaLabel="OSINT tools"
      tone="rose"
    >
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'framework' && <OsintFramework />}
        {activeTab === 'cli' && <OsintCliTools />}
        {activeTab === 'map' && <OsintCountryMap />}
        {activeTab === 'toolbox' && <CuratedToolbox />}
        {activeTab === 'secops' && <SecopsCatalog />}
      </Suspense>
    </HubShell>
  );
}
