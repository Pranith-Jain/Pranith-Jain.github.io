import { lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
const FeedCatalog = lazy(() => import('./FeedCatalog'));
const FeedSources = lazy(() => import('./FeedSources'));
const FeedQuality = lazy(() => import('./FeedQuality'));
const FeedScheduler = lazy(() => import('./FeedScheduler'));
const ThreatFeeds = lazy(() => import('../dfir/ThreatFeeds'));
type TabId = 'catalog' | 'sources' | 'quality' | 'scheduler' | 'threatfeeds';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'catalog', label: 'Catalog', desc: 'Feed file browser' },
  { id: 'sources', label: 'Sources', desc: 'Feed source registry' },
  { id: 'quality', label: 'Quality', desc: 'Feed quality metrics' },
  { id: 'scheduler', label: 'Scheduler', desc: 'Feed scheduling and orchestration' },
  { id: 'threatfeeds', label: 'Threat Feeds', desc: 'Threat intelligence feeds' },
];
const HUB_PATH = 'feeds';
const DEFAULT_TAB: TabId = 'catalog';
export default function FeedHub(): JSX.Element {
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
      ariaLabel="Feed tools"
      tone="rose"
    >
      {activeTab === 'catalog' && <FeedCatalog />}
      {activeTab === 'sources' && <FeedSources />}
      {activeTab === 'quality' && <FeedQuality />}
      {activeTab === 'scheduler' && <FeedScheduler />}
      {activeTab === 'threatfeeds' && <ThreatFeeds />}
    </HubShell>
  );
}
