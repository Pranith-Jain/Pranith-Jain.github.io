import { lazy, useState } from 'react';
import { HubShell } from '../../components/HubShell';
const SocialFirehose = lazy(() => import('./SocialFirehose'));
const TechAiNews = lazy(() => import('../dfir/TechAiNews'));
type TabId = 'firehose' | 'news';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'firehose', label: 'Firehose', desc: 'Multi-platform social media firehose' },
  { id: 'news', label: 'Tech News', desc: 'Tech and AI news aggregation' },
];
export default function SocialHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('firehose');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Social tools" tone="rose">
      {activeTab === 'firehose' && <SocialFirehose />}
      {activeTab === 'news' && <TechAiNews />}
    </HubShell>
  );
}
