import { lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
const SocialFirehose = lazy(() => import('./SocialFirehose'));
const TechAiNews = lazy(() => import('../dfir/TechAiNews'));
type TabId = 'firehose' | 'news';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'firehose', label: 'Firehose', desc: 'Multi-platform social media firehose' },
  { id: 'news', label: 'Tech News', desc: 'Tech and AI news aggregation' },
];
const HUB_PATH = 'social';
const DEFAULT_TAB: TabId = 'firehose';
export default function SocialHub(): JSX.Element {
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
      ariaLabel="Social tools"
      tone="rose"
    >
      {activeTab === 'firehose' && <SocialFirehose />}
      {activeTab === 'news' && <TechAiNews />}
    </HubShell>
  );
}
