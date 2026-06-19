import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TabLoader } from '../../components/ui/TabLoader';
import { DataPageLayout } from '../../components/DataPageLayout';
import { MessageSquare } from 'lucide-react';

const TelegramFirehose = lazy(() => import('./TelegramFirehose'));
const TelegramLeaks = lazy(() => import('./TelegramLeaks'));
const TelegramLeakStats = lazy(() => import('./TelegramLeakStats'));
const TelegramDiscoveredChannels = lazy(() => import('./TelegramDiscoveredChannels'));
const TelegramSettings = lazy(() => import('./TelegramSettings'));
const TelegramChannelSearch = lazy(() => import('./TelegramChannelSearch'));
const TelegramLinkedActors = lazy(() => import('./TelegramLinkedActors'));

type TabId = 'firehose' | 'leaks' | 'search' | 'stats' | 'channels' | 'actors' | 'settings';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  {
    id: 'firehose',
    label: 'Firehose',
    desc: 'Unified cross-source stream — t.me/s firehose + leak monitor + live IOCs, auto-refreshed every 60s.',
  },
  { id: 'leaks', label: 'Leak Feed', desc: 'Credential leak entries from monitored channels' },
  { id: 'search', label: 'Channel Search', desc: 'Keyword search via tgstat.com + actor correlation' },
  { id: 'stats', label: 'Statistics', desc: 'KPIs, severity distribution, top channels' },
  { id: 'channels', label: 'Channel Discovery', desc: 'Auto-discovered channels — approve or reject' },
  {
    id: 'actors',
    label: 'Linked Actors',
    desc: 'Channel → actor pivot across in-repo catalog, deepdarkCTI, MISP Galaxy, and 30d leak activity.',
  },
  { id: 'settings', label: 'Settings', desc: 'Custom channel management and configuration' },
];

const TAB_IDS: TabId[] = TABS.map((t) => t.id);

export default function TelegramMonitor(): JSX.Element {
  const [searchParams] = useSearchParams();
  const paramTab = searchParams.get('tab') as TabId | null;
  const initialTab: TabId = paramTab && TAB_IDS.includes(paramTab) ? paramTab : 'firehose';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    const t = searchParams.get('tab') as TabId | null;
    if (t && TAB_IDS.includes(t) && t !== activeTab) {
      setActiveTab(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<MessageSquare size={28} />}
      title="Telegram Leak Monitor"
      description="Unified Telegram leak monitoring — firehose, credential leak feed, channel search, statistics, channel discovery, linked actors, and settings. All powered by monitored Telegram channels."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Telegram monitor"
      >
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
          {activeTab === 'firehose' && <TelegramFirehose />}
          {activeTab === 'leaks' && <TelegramLeaks />}
          {activeTab === 'search' && <TelegramChannelSearch />}
          {activeTab === 'stats' && <TelegramLeakStats />}
          {activeTab === 'channels' && <TelegramDiscoveredChannels />}
          {activeTab === 'actors' && <TelegramLinkedActors />}
          {activeTab === 'settings' && <TelegramSettings />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
