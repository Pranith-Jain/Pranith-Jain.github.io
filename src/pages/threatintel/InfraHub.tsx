import { lazy, useState } from 'react';
import { HubShell } from '../../components/HubShell';
const CloudThreatLandscape = lazy(() => import('./CloudThreatLandscape'));
const InfraIntel = lazy(() => import('./InfraIntel'));
const Webamon = lazy(() => import('./Webamon'));
const DomainMonitor = lazy(() => import('./DomainMonitor'));
type TabId = 'cloud' | 'infra' | 'webamon' | 'domain';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'cloud', label: 'Cloud', desc: 'Cloud threat landscape' },
  { id: 'infra', label: 'Infrastructure', desc: 'Infrastructure intelligence' },
  { id: 'webamon', label: 'Webamon', desc: 'Web asset monitoring' },
  { id: 'domain', label: 'Domain', desc: 'Domain monitoring and tracking' },
];
export default function InfraHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('cloud');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Infrastructure tools" tone="rose">
      {activeTab === 'cloud' && <CloudThreatLandscape />}
      {activeTab === 'infra' && <InfraIntel />}
      {activeTab === 'webamon' && <Webamon />}
      {activeTab === 'domain' && <DomainMonitor />}
    </HubShell>
  );
}
