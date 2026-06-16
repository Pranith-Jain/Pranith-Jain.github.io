import { lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
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
      ariaLabel="External tools"
      tone="rose"
    >
      {activeTab === 'external' && <ExternalResources />}
      {activeTab === 'supply' && <SupplyChainIntelligence />}
      {activeTab === 'awesome' && <AwesomeLists />}
    </HubShell>
  );
}
