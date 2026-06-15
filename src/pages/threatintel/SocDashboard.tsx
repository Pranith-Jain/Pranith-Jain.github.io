import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Loader2 } from 'lucide-react';

const SocRansomware = lazy(() => import('./SocRansomware'));
const SocVulns = lazy(() => import('./SocVulns'));
const SocIocs = lazy(() => import('./SocIocs'));

type TabId = 'ransomware' | 'vulns' | 'iocs';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'ransomware', label: 'Ransomware', desc: 'Red DEFCON-style ransomware activity panel' },
  { id: 'vulns', label: 'Vulnerabilities', desc: 'Cyan vulnerability intelligence panel' },
  { id: 'iocs', label: 'IOC Stream', desc: 'Purple IOC stream panel' },
];

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
      <span className="text-sm font-mono text-slate-500">Loading…</span>
    </div>
  );
}

export default function SocDashboard(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('ransomware');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="SOC Dashboard"
      description="Unified tactical SOC view — ransomware activity, vulnerability intelligence, and IOC stream. All panels auto-refresh."
    >
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-6" aria-label="SOC panels">
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
        <Suspense fallback={<TabFallback />}>
          {activeTab === 'ransomware' && <SocRansomware />}
          {activeTab === 'vulns' && <SocVulns />}
          {activeTab === 'iocs' && <SocIocs />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
