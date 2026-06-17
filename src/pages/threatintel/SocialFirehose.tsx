import { Suspense, lazy, useState } from 'react';
import { TabLoader } from '../../components/ui/TabLoader';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Radio } from 'lucide-react';

const CybersecTelegram = lazy(() => import('./CybersecTelegram'));
const RedditFirehose = lazy(() => import('./RedditFirehose'));
const XFirehose = lazy(() => import('./XFirehose'));
const XLive = lazy(() => import('./XLive'));
const XWatch = lazy(() => import('./XWatch'));

type TabId = 'telegram' | 'reddit' | 'x-live' | 'x-watch' | 'bluesky';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'telegram', label: 'Telegram', desc: 'Cybersecurity channel firehose' },
  { id: 'reddit', label: 'Reddit', desc: '16 subreddit firehose' },
  { id: 'x-live', label: 'X (TweetFeed)', desc: 'X/Twitter via TweetFeed with fxtwitter enrichment' },
  { id: 'x-watch', label: 'X (Watch)', desc: 'X firehose from 70+ accounts with per-handle view' },
  { id: 'bluesky', label: 'Bluesky & Mastodon', desc: '16 researchers across Bluesky and Mastodon' },
];


export default function SocialFirehose(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('telegram');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Radio size={28} />}
      title="Social Media Firehose"
      description="Real-time cybersecurity social media feeds — Telegram channels, Reddit, X/Twitter, Bluesky, and Mastodon. All feeds auto-refresh."
    >
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="Social platform">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
              activeTab === t.id
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
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
          {activeTab === 'telegram' && <CybersecTelegram />}
          {activeTab === 'reddit' && <RedditFirehose />}
          {activeTab === 'x-live' && <XLive />}
          {activeTab === 'x-watch' && <XWatch />}
          {activeTab === 'bluesky' && <XFirehose />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
