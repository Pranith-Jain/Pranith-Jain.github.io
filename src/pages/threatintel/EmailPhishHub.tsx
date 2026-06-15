import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Mail, Loader2 } from 'lucide-react';
const PhishFeed = lazy(() => import('./PhishFeed'));
const PhishingUrls = lazy(() => import('./PhishingWordlists'));
const ScamWatch = lazy(() => import('../dfir/ScamWatch'));
type TabId = 'phish' | 'urls' | 'scam';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'phish', label: 'Phish Feed', desc: 'Phishing feed aggregation' },
  { id: 'urls', label: 'URLs', desc: 'Phishing URL database' },
  { id: 'scam', label: 'Scam Watch', desc: 'Scam watch and monitoring' },
];
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}
export default function EmailPhishHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('phish');
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Mail size={28} />}
      title="Email & Phishing Intelligence"
      description="Phishing feeds, URL tracking, and scam monitoring."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6"
        aria-label="Email tools"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${activeTab === t.id ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
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
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'phish' && <PhishFeed />}
          {activeTab === 'urls' && <PhishingUrls />}
          {activeTab === 'scam' && <ScamWatch />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
