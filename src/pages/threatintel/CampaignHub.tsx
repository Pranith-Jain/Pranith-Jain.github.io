import { lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
const Campaigns = lazy(() => import('./Campaigns'));
const CampaignLifecycle = lazy(() => import('./CampaignLifecycle'));
const CampaignGenerator = lazy(() => import('./CampaignGenerator'));
const CrossCampaignCorrelation = lazy(() => import('./CrossCampaignCorrelation'));
type TabId = 'active' | 'lifecycle' | 'generator' | 'cross';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'active', label: 'Active', desc: 'Active campaign tracker' },
  { id: 'lifecycle', label: 'Lifecycle', desc: 'Campaign lifecycle analysis' },
  { id: 'generator', label: 'Generator', desc: 'AI-powered campaign generation' },
  { id: 'cross', label: 'Cross-campaign', desc: 'Cross-campaign correlation' },
];
const DEFAULT_TAB: TabId = 'active';
export default function CampaignHub(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const activeTab = tab && TABS.some((t) => t.id === tab) ? (tab as TabId) : DEFAULT_TAB;
  return (
    <HubShell
      tabs={TABS}
      active={activeTab}
      onSelect={(id) => setSearchParams({ tab: id }, { replace: true })}
      ariaLabel="Campaign tools"
      tone="rose"
    >
      {activeTab === 'active' && <Campaigns />}
      {activeTab === 'lifecycle' && <CampaignLifecycle />}
      {activeTab === 'generator' && <CampaignGenerator />}
      {activeTab === 'cross' && <CrossCampaignCorrelation />}
    </HubShell>
  );
}
