import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Users } from 'lucide-react';

const IdentityLookup = lazy(() => import('./IdentityLookup'));
const UsernamePivot = lazy(() => import('./UsernamePivot'));
const UsernameOsnit = lazy(() => import('./UsernameOsnit'));

type TabId = 'profiles' | 'quick' | 'deep';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'profiles', label: 'Rich Profiles', desc: 'Live profile data from GitHub/GitLab/Reddit/HN/Bluesky/Dev.to' },
  { id: 'quick', label: 'Quick Pivot', desc: 'Client-side existence check across 50+ services via CORS probes' },
  { id: 'deep', label: 'Deep Scan', desc: 'Server-side HTTP checks across 60+ platforms with 15-min cache' },
];

export default function UsernameInvestigator(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>((searchParams.get('tab') as TabId) || 'profiles');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Users size={28} />}
      title="Username & Identity Investigator"
      description="Unified username investigation — rich profiles, quick existence checks, and deep server-side scans across 60+ platforms. Pick a tab based on the depth you need."
    >
      {/* Tab bar */}
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="Investigation mode"
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

      {/* Tab description */}
      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {TABS.find((t) => t.id === activeTab)?.desc}
      </p>

      {/* Tab content */}
      <div role="tabpanel">
        <Suspense fallback={<TabLoader />}>
          {activeTab === 'profiles' && <IdentityLookup />}
          {activeTab === 'quick' && <UsernamePivot />}
          {activeTab === 'deep' && <UsernameOsnit />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
