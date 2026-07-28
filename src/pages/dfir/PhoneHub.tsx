import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Phone } from 'lucide-react';

const PhoneOsint = lazy(() => import('./PhoneOsint'));
const PhoneOsintNew = lazy(() => import('./PhoneOsintNew'));

type TabId = 'osint' | 'ai';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'osint', label: 'PHONE OSINT', desc: 'Phone number OSINT lookup across public sources' },
  { id: 'ai', label: 'AI PHONE INTEL', desc: 'AI-assisted phone number intelligence and analysis' },
];

export default function PhoneHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('osint');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Phone size={28} />}
      title="Phone Intelligence"
      description="Phone number OSINT and AI-assisted intelligence gathering."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Phone intelligence tools"
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
          {activeTab === 'osint' && <PhoneOsint />}
          {activeTab === 'ai' && <PhoneOsintNew />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
