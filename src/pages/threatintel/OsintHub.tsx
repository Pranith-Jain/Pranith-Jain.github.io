import { Suspense, lazy, useEffect, useState } from 'react';
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
  // Deep links like /threatintel/osint/map should land on the right tab.
  // Seed state with the default tab so the SSR/first client render match
  // the hub-base prerender; sync to the URL param in a post-mount effect.
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);
  useEffect(() => {
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
    } else if (!tab) {
      navigate(`/threatintel/${HUB_PATH}/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tab, navigate]);
  const onSelect = (id: TabId) => {
    if (id === activeTab) return;
    setActiveTab(id);
    navigate(`/threatintel/${HUB_PATH}/${id}`, { replace: true });
  };
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="OSINT tools" tone="rose">
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
