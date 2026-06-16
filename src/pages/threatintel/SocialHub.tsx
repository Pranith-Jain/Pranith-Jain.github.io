import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const SocialFirehose = lazy(() => import('./SocialFirehose'));
const TechAiNews = lazy(() => import('../dfir/TechAiNews'));
const TelegramLeaks = lazy(() => import('./TelegramLeaks'));
const TelegramLeakStats = lazy(() => import('./TelegramLeakStats'));
const TelegramDiscoveredChannels = lazy(() => import('./TelegramDiscoveredChannels'));
const TelegramSettings = lazy(() => import('./TelegramSettings'));
const CryptoScamFeed = lazy(() => import('./CryptoScamFeed'));
const RedditFirehose = lazy(() => import('./RedditFirehose'));
const XFirehose = lazy(() => import('./XFirehose'));
const XLive = lazy(() => import('./XLive'));
const XWatch = lazy(() => import('./XWatch'));
const ScrapedIntelUsernames = lazy(() => import('./ScrapedIntelUsernames'));
type TabId =
  | 'firehose'
  | 'news'
  | 'telegram-leaks'
  | 'telegram-stats'
  | 'telegram-channels'
  | 'telegram-settings'
  | 'crypto-scam'
  | 'reddit'
  | 'x-firehose'
  | 'x-live'
  | 'x-watch'
  | 'scraped-intel';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'firehose', label: 'Firehose', desc: 'Multi-platform social media firehose' },
  { id: 'news', label: 'Tech News', desc: 'Tech and AI news aggregation' },
  { id: 'telegram-leaks', label: 'Telegram Leaks', desc: 'Telegram credential leak feed' },
  { id: 'telegram-stats', label: 'Telegram Stats', desc: 'Telegram leak statistics' },
  { id: 'telegram-channels', label: 'Telegram Channels', desc: 'Auto-discovered Telegram channels' },
  { id: 'telegram-settings', label: 'Telegram Settings', desc: 'Custom channel management' },
  { id: 'crypto-scam', label: 'Crypto Scam', desc: 'Crypto scam feed' },
  { id: 'reddit', label: 'Reddit', desc: 'Reddit security subreddits firehose' },
  { id: 'x-firehose', label: 'X Firehose', desc: 'Bluesky and Mastodon firehose' },
  { id: 'x-live', label: 'X Live', desc: 'X/Twitter live feed via TweetFeed' },
  { id: 'x-watch', label: 'X Watch', desc: 'X/Twitter firehose from 70+ accounts' },
  { id: 'scraped-intel', label: 'Scraped Intel', desc: 'Scraped intelligence usernames' },
];
const HUB_PATH = 'social';
const DEFAULT_TAB: TabId = 'firehose';
export default function SocialHub(): JSX.Element {
  // Deep links like /threatintel/social/reddit should land on the right tab.
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
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Social tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'firehose' && <SocialFirehose />}
        {activeTab === 'news' && <TechAiNews />}
        {activeTab === 'telegram-leaks' && <TelegramLeaks />}
        {activeTab === 'telegram-stats' && <TelegramLeakStats />}
        {activeTab === 'telegram-channels' && <TelegramDiscoveredChannels />}
        {activeTab === 'telegram-settings' && <TelegramSettings />}
        {activeTab === 'crypto-scam' && <CryptoScamFeed />}
        {activeTab === 'reddit' && <RedditFirehose />}
        {activeTab === 'x-firehose' && <XFirehose />}
        {activeTab === 'x-live' && <XLive />}
        {activeTab === 'x-watch' && <XWatch />}
        {activeTab === 'scraped-intel' && <ScrapedIntelUsernames />}
      </Suspense>
    </HubShell>
  );
}
