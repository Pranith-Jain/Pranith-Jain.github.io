import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
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
const HUB_PATH = 'infra';
const DEFAULT_TAB: TabId = 'cloud';
export default function InfraHub(): JSX.Element {
  // Deep links like /threatintel/infra/domain should land on the right tab.
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
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Infrastructure tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'cloud' && <CloudThreatLandscape />}
        {activeTab === 'infra' && <InfraIntel />}
        {activeTab === 'webamon' && <Webamon />}
        {activeTab === 'domain' && <DomainMonitor />}
      </Suspense>
    </HubShell>
  );
}
