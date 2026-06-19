import { Suspense, lazy, useState } from 'react';
import { TabLoader } from '../../components/ui/TabLoader';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Bug } from 'lucide-react';

const CveList = lazy(() => import('./CveList'));
const ExploitableCves = lazy(() => import('./ExploitableCves'));
const CisaKevCatalog = lazy(() => import('./CisaKevCatalog'));
const K8sCve = lazy(() => import('./K8sCve'));

type TabId = 'all' | 'exploitable' | 'kev' | 'k8s';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'all', label: 'All Recent', desc: 'NVD feed + KEV + Microsoft Threat Intelligence + cvefeed.io' },
  {
    id: 'exploitable',
    label: 'Exploitable',
    desc: 'CVEs with known exploits from vendor labs, security research, and KEV',
  },
  { id: 'kev', label: 'CISA KEV', desc: 'CISA Known Exploited Vulnerabilities catalog with filtering and CSV export' },
  { id: 'k8s', label: 'Kubernetes', desc: 'Kubernetes-specific CVE feed from official security advisories' },
];

export default function CveIntel(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('all');

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Bug size={28} />}
      title="CVE Intelligence"
      description="Unified CVE intelligence — recent vulnerabilities, exploitable CVEs, CISA KEV catalog, and Kubernetes-specific advisories. All feeds updated regularly."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="CVE intelligence"
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
          {activeTab === 'all' && <CveList />}
          {activeTab === 'exploitable' && <ExploitableCves />}
          {activeTab === 'kev' && <CisaKevCatalog />}
          {activeTab === 'k8s' && <K8sCve bare />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
