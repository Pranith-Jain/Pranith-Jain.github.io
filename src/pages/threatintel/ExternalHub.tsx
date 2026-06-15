import { lazy, useState } from 'react';
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
export default function ExternalHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('external');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="External tools" tone="rose">
      {activeTab === 'external' && <ExternalResources />}
      {activeTab === 'supply' && <SupplyChainIntelligence />}
      {activeTab === 'awesome' && <AwesomeLists />}
    </HubShell>
  );
}
