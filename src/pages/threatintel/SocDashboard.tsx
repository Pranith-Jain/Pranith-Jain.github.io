import { Suspense, lazy, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TabLoader } from '../../components/ui/TabLoader';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield } from 'lucide-react';

const SocRansomware = lazy(() => import('./SocRansomware'));
const SocVulns = lazy(() => import('./SocVulns'));
const SocIocs = lazy(() => import('./SocIocs'));

type TabId = 'ransomware' | 'vulns' | 'iocs';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'ransomware', label: 'Ransomware', desc: 'Red DEFCON-style ransomware activity panel' },
  { id: 'vulns', label: 'Vulnerabilities', desc: 'Cyan vulnerability intelligence panel' },
  { id: 'iocs', label: 'IOC Stream', desc: 'Purple IOC stream panel' },
];

export default function SocDashboard(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    paramTab && TABS.some((t) => t.id === paramTab) ? paramTab : 'ransomware'
  );

  useEffect(() => {
    const t = searchParams.get('tab') as TabId | null;
    if (t && TABS.some((tt) => tt.id === t)) {
      setActiveTab(t);
    }
  }, [searchParams]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="SOC Dashboard"
      description="Unified tactical SOC view — ransomware activity, vulnerability intelligence, and IOC stream. All panels auto-refresh."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="SOC panels"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
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
          {activeTab === 'ransomware' && <SocRansomware />}
          {activeTab === 'vulns' && <SocVulns />}
          {activeTab === 'iocs' && <SocIocs />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
