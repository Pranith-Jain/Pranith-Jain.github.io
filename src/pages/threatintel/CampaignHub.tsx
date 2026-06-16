import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
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
  // Deep links like /threatintel/campaigns?tab=lifecycle should land on the
  // right tab. Seed state with the default tab so the SSR/first client
  // render match the hub-base prerender; sync to the query param in a
  // post-mount effect. The ?tab= query form is used here (not /:tab) to
  // avoid colliding with /threatintel/campaigns/:id detail routes.
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
    } else if (!tab) {
      setSearchParams({ tab: DEFAULT_TAB }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const onSelect = (id: TabId) => {
    if (id === activeTab) return;
    setActiveTab(id);
    setSearchParams({ tab: id }, { replace: true });
  };
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Campaign tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'active' && <Campaigns />}
        {activeTab === 'lifecycle' && <CampaignLifecycle />}
        {activeTab === 'generator' && <CampaignGenerator />}
        {activeTab === 'cross' && <CrossCampaignCorrelation />}
      </Suspense>
    </HubShell>
  );
}
