import { lazy, useState } from 'react';
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
export default function FeedHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('catalog');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Feed tools" tone="rose">
      {activeTab === 'catalog' && <FeedCatalog />}
      {activeTab === 'sources' && <FeedSources />}
      {activeTab === 'quality' && <FeedQuality />}
      {activeTab === 'scheduler' && <FeedScheduler />}
      {activeTab === 'threatfeeds' && <ThreatFeeds />}
    </HubShell>
  );
}
