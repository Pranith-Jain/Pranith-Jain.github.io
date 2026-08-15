import { Suspense, lazy, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TabLoader } from '../../components/ui/TabLoader';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Radio } from 'lucide-react';

const TelegramFirehose = lazy(() => import('./TelegramFirehose'));
const RedditFirehose = lazy(() => import('./RedditFirehose'));
const XFirehose = lazy(() => import('./XFirehose'));
const XLive = lazy(() => import('./XLive'));
const XWatch = lazy(() => import('./XWatch'));

type TabId = 'telegram' | 'reddit' | 'x-live' | 'x-watch' | 'bluesky';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'telegram', label: 'Telegram', desc: 'Cybersecurity channel firehose' },
  { id: 'reddit', label: 'Reddit', desc: '16 subreddit firehose' },
  {
    id: 'x-live',
    label: 'X (Live)',
    desc: 'Live X tweets + ransomware/breach claims from 70+ cybersec accounts (TweetFeed + fxtwitter, no auth needed)',
  },
  { id: 'x-watch', label: 'X (Profiles)', desc: 'Per-handle profile view (requires X cookies — often down)' },
  { id: 'bluesky', label: 'Bluesky & Mastodon', desc: '16 researchers across Bluesky and Mastodon' },
];

const VALID_TABS = new Set<TabId>(['telegram', 'reddit', 'x-live', 'x-watch', 'bluesky']);

export default function SocialFirehose(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && VALID_TABS.has(tabParam) ? tabParam : 'telegram');

  // Sync tab changes to the URL so deep-links and back/forward work.
  useEffect(() => {
    const current = searchParams.get('tab') ?? 'telegram';
    if (current !== activeTab) {
      const next = new URLSearchParams(searchParams);
      if (activeTab === 'telegram') next.delete('tab');
      else next.set('tab', activeTab);
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Radio size={28} />}
      title="Social Media Firehose"
      description="Real-time cybersecurity social media feeds - Telegram channels, Reddit, X/Twitter, Bluesky, and Mastodon. All feeds auto-refresh."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Social platform"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
              activeTab === t.id
                ? 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            aria-selected={activeTab === t.id}
            role="tab"
          >
            {t.label}
          </button>
        ))}
      </nav>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {TABS.find((t) => t.id === activeTab)?.desc}
      </p>

      <div role="tabpanel">
        <Suspense fallback={<TabLoader />}>
          {activeTab === 'telegram' && <TelegramFirehose bare />}
          {activeTab === 'reddit' && <RedditFirehose />}
          {activeTab === 'x-live' && <XLive />}
          {activeTab === 'x-watch' && <XWatch />}
          {activeTab === 'bluesky' && <XFirehose />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
