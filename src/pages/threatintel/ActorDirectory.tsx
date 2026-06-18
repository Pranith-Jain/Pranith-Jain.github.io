import { Suspense, lazy, useState } from 'react';
import { TabLoader } from '../../components/ui/TabLoader';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Users } from 'lucide-react';

const Actors = lazy(() => import('../dfir/Actors'));
const ActorKb = lazy(() => import('./ActorKb'));
const MispGalaxyActors = lazy(() => import('./MispGalaxyActors'));

type TabId = 'platform' | 'mitre' | 'misp';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'platform', label: 'Platform DB', desc: 'APT catalogue with TTPs, tooling, MITRE mapping' },
  { id: 'mitre', label: 'MITRE ATT&CK', desc: '174 intrusion-sets searchable by name/alias/technique' },
  { id: 'misp', label: 'MISP Galaxy', desc: 'Threat-actor alias index from MISP Galaxy clusters' },
];

export default function ActorDirectory(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('platform');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Users size={28} />}
      title="Threat Actor Directory"
      description="Unified threat actor browser — platform database, MITRE ATT&CK intrusion sets, and MISP Galaxy clusters. Search across all sources."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[#1e2030] mb-6"
        aria-label="Actor sources"
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
          {activeTab === 'platform' && <Actors />}
          {activeTab === 'mitre' && <ActorKb />}
          {activeTab === 'misp' && <MispGalaxyActors />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
