import { Suspense, lazy, useState } from 'react';
import { TabLoader } from '../../components/ui/TabLoader';
import { DataPageLayout } from '../../components/DataPageLayout';
import { MessageSquare } from 'lucide-react';

const TelegramLeaks = lazy(() => import('./TelegramLeaks'));
const TelegramLeakStats = lazy(() => import('./TelegramLeakStats'));
const TelegramDiscoveredChannels = lazy(() => import('./TelegramDiscoveredChannels'));
const TelegramSettings = lazy(() => import('./TelegramSettings'));

type TabId = 'leaks' | 'stats' | 'channels' | 'settings';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'leaks', label: 'Leak Feed', desc: 'Credential leak entries from monitored channels' },
  { id: 'stats', label: 'Statistics', desc: 'KPIs, severity distribution, top channels' },
  { id: 'channels', label: 'Channel Discovery', desc: 'Auto-discovered channels — approve or reject' },
  { id: 'settings', label: 'Settings', desc: 'Custom channel management and configuration' },
];

export default function TelegramMonitor(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('leaks');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<MessageSquare size={28} />}
      title="Telegram Leak Monitor"
      description="Unified Telegram leak monitoring — credential leak feed, channel discovery, statistics, and settings. All powered by monitored Telegram channels."
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
          {activeTab === 'leaks' && <TelegramLeaks />}
          {activeTab === 'stats' && <TelegramLeakStats />}
          {activeTab === 'channels' && <TelegramDiscoveredChannels />}
          {activeTab === 'settings' && <TelegramSettings />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
