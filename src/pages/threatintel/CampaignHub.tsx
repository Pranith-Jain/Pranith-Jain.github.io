import { lazy, useState } from 'react';
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
export default function CampaignHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('active');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Campaign tools" tone="rose">
      {activeTab === 'active' && <Campaigns />}
      {activeTab === 'lifecycle' && <CampaignLifecycle />}
      {activeTab === 'generator' && <CampaignGenerator />}
      {activeTab === 'cross' && <CrossCampaignCorrelation />}
    </HubShell>
  );
}
