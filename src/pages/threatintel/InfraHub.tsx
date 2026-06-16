import { lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
const HUB_PATH = 'infra';
const DEFAULT_TAB: TabId = 'cloud';
export default function InfraHub(): JSX.Element {
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
      ariaLabel="Infrastructure tools"
      tone="rose"
    >
      {activeTab === 'cloud' && <CloudThreatLandscape />}
      {activeTab === 'infra' && <InfraIntel />}
      {activeTab === 'webamon' && <Webamon />}
      {activeTab === 'domain' && <DomainMonitor />}
    </HubShell>
  );
}
