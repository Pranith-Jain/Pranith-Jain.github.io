import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const ExternalResources = lazy(() => import('./ExternalResources'));
const SupplyChainIntelligence = lazy(() => import('./SupplyChainIntelligence'));
const AwesomeLists = lazy(() => import('../dfir/AwesomeLists'));
type TabId = 'external' | 'supply' | 'awesome';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'external', label: 'External', desc: 'External resources directory' },
  { id: 'supply', label: 'Supply Chain', desc: 'Supply chain intelligence' },
  { id: 'awesome', label: 'Awesome Lists', desc: 'Awesome security lists' },
];
const HUB_PATH = 'external';
const DEFAULT_TAB: TabId = 'external';
export default function ExternalHub(): JSX.Element {
  // Deep links like /threatintel/external/supply should land on the right
  // tab. Seed state with the default tab so the SSR/first client render
  // match the hub-base prerender; sync to the URL param in a post-mount
  // effect.
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
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="External resources" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'external' && <ExternalResources />}
        {activeTab === 'supply' && <SupplyChainIntelligence />}
        {activeTab === 'awesome' && <AwesomeLists />}
      </Suspense>
    </HubShell>
  );
}
