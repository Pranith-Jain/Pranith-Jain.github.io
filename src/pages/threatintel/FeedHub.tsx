import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const FeedCatalog = lazy(() => import('./FeedCatalog'));
const FeedSources = lazy(() => import('./FeedSources'));
const FeedQuality = lazy(() => import('./FeedQuality'));
const FeedScheduler = lazy(() => import('./FeedScheduler'));
const ThreatFeeds = lazy(() => import('../dfir/ThreatFeeds'));
const FeedStatus = lazy(() => import('./FeedStatus'));
const SourceReliability = lazy(() => import('./SourceReliability'));
const MyThreatIntel = lazy(() => import('./MyThreatIntel'));
type TabId =
  | 'catalog'
  | 'sources'
  | 'quality'
  | 'scheduler'
  | 'threatfeeds'
  | 'status'
  | 'reliability'
  | 'mythreatintel';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'catalog', label: 'Catalog', desc: 'Feed file browser' },
  { id: 'sources', label: 'Sources', desc: 'Feed source registry' },
  { id: 'quality', label: 'Quality', desc: 'Feed quality metrics' },
  { id: 'scheduler', label: 'Scheduler', desc: 'Feed scheduling and orchestration' },
  { id: 'threatfeeds', label: 'Threat Feeds', desc: 'Threat intelligence feeds' },
  { id: 'status', label: 'Status', desc: 'Feed health status' },
  { id: 'reliability', label: 'Reliability', desc: 'Source reliability grades' },
  { id: 'mythreatintel', label: 'MyThreatIntel', desc: 'MyThreatIntel feed' },
];
const HUB_PATH = 'feeds';
const DEFAULT_TAB: TabId = 'catalog';
export default function FeedHub(): JSX.Element {
  // Deep links like /threatintel/feeds/sources should land on the right tab.
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
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Feed tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'catalog' && <FeedCatalog />}
        {activeTab === 'sources' && <FeedSources />}
        {activeTab === 'quality' && <FeedQuality />}
        {activeTab === 'scheduler' && <FeedScheduler />}
        {activeTab === 'threatfeeds' && <ThreatFeeds />}
        {activeTab === 'status' && <FeedStatus />}
        {activeTab === 'reliability' && <SourceReliability />}
        {activeTab === 'mythreatintel' && <MyThreatIntel />}
      </Suspense>
    </HubShell>
  );
}
