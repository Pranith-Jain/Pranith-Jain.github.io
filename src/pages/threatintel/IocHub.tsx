import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const LiveIocs = lazy(() => import('./LiveIocs'));
const IocEnrichment = lazy(() => import('./IocEnrichment'));
const IocFeedsPage = lazy(() => import('./IocFeedsPage'));
const EntityResolution = lazy(() => import('./EntityResolution'));
const C2Tracker = lazy(() => import('./C2Tracker'));
const ThreatMap = lazy(() => import('../dfir/ThreatMap'));
const CrossCorrelate = lazy(() => import('./CrossCorrelate'));
const IocCorrelation = lazy(() => import('./IocCorrelation'));
const AggregatedFeeds = lazy(() => import('./AggregatedFeeds'));
const SocIocs = lazy(() => import('./SocIocs'));
const ObservableDb = lazy(() => import('./ObservableDb'));
type TabId =
  | 'live'
  | 'enrichment'
  | 'feeds'
  | 'entity'
  | 'c2'
  | 'map'
  | 'cross'
  | 'correlation'
  | 'aggregated'
  | 'soc'
  | 'observable';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'live', label: 'Live', desc: 'Real-time IOC feed' },
  { id: 'enrichment', label: 'Enrichment', desc: 'IOC enrichment and lookup' },
  { id: 'feeds', label: 'Feeds', desc: 'IOC feed catalog' },
  { id: 'entity', label: 'Entity', desc: 'Entity resolution across intel sources' },
  { id: 'c2', label: 'C2', desc: 'C2 infrastructure tracker' },
  { id: 'map', label: 'Threat Map', desc: 'Geo-visualization of IOCs by country' },
  { id: 'cross', label: 'Cross-Correlate', desc: 'Cross-source IOC correlation' },
  { id: 'correlation', label: 'Correlation', desc: 'IOC correlation analysis' },
  { id: 'aggregated', label: 'Aggregated', desc: 'Aggregated feed browser' },
  { id: 'soc', label: 'SOC IOCs', desc: 'SOC IOC dashboard' },
  { id: 'observable', label: 'Observable DB', desc: 'Observable database' },
];
const HUB_PATH = 'iocs';
const DEFAULT_TAB: TabId = 'live';
export default function IocHub(): JSX.Element {
  // Deep links like /threatintel/iocs/c2 should land on the right tab. To
  // keep SSR/first client render identical (the worker serves the hub-base
  // prerender for every tab URL), seed state with the default tab and sync
  // to the URL param in a post-mount effect.
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
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="IOC tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'live' && <LiveIocs />}
        {activeTab === 'enrichment' && <IocEnrichment />}
        {activeTab === 'feeds' && <IocFeedsPage />}
        {activeTab === 'entity' && <EntityResolution />}
        {activeTab === 'c2' && <C2Tracker />}
        {activeTab === 'map' && <ThreatMap />}
        {activeTab === 'cross' && <CrossCorrelate />}
        {activeTab === 'correlation' && <IocCorrelation />}
        {activeTab === 'aggregated' && <AggregatedFeeds />}
        {activeTab === 'soc' && <SocIocs />}
        {activeTab === 'observable' && <ObservableDb />}
      </Suspense>
    </HubShell>
  );
}
