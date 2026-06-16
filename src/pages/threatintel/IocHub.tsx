import { lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
const LiveIocs = lazy(() => import('./LiveIocs'));
const IocEnrichment = lazy(() => import('./IocEnrichment'));
const IocFeedsPage = lazy(() => import('./IocFeedsPage'));
const EntityResolution = lazy(() => import('./EntityResolution'));
const C2Tracker = lazy(() => import('./C2Tracker'));
const ThreatMap = lazy(() => import('../dfir/ThreatMap'));
type TabId = 'live' | 'enrichment' | 'feeds' | 'entity' | 'c2' | 'map';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'live', label: 'Live', desc: 'Real-time IOC feed' },
  { id: 'enrichment', label: 'Enrichment', desc: 'IOC enrichment and lookup' },
  { id: 'feeds', label: 'Feeds', desc: 'IOC feed catalog' },
  { id: 'entity', label: 'Entity', desc: 'Entity resolution across intel sources' },
  { id: 'c2', label: 'C2', desc: 'C2 infrastructure tracker' },
  { id: 'map', label: 'Threat Map', desc: 'Geo-visualization of IOCs by country' },
];
const HUB_PATH = 'iocs';
const DEFAULT_TAB: TabId = 'live';
export default function IocHub(): JSX.Element {
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
      ariaLabel="IOC tools"
      tone="rose"
    >
      {activeTab === 'live' && <LiveIocs />}
      {activeTab === 'enrichment' && <IocEnrichment />}
      {activeTab === 'feeds' && <IocFeedsPage />}
      {activeTab === 'entity' && <EntityResolution />}
      {activeTab === 'c2' && <C2Tracker />}
      {activeTab === 'map' && <ThreatMap />}
    </HubShell>
  );
}
