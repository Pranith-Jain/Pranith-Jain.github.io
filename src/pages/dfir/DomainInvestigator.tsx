import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Globe } from 'lucide-react';

const Domain = lazy(() => import('./Domain'));
const DomainReputation = lazy(() => import('./DomainReputation'));
const DomainWebcheck = lazy(() => import('./DomainWebcheck'));
const Exposure = lazy(() => import('./Exposure'));
const FullSpectrum = lazy(() => import('./FullSpectrum'));

type TabId = 'dns' | 'reputation' | 'web' | 'surface' | 'full';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'dns', label: 'DNS & WHOIS', desc: 'WHOIS, DNS records, email auth (SPF/DKIM/DMARC), CT logs' },
  { id: 'reputation', label: 'Reputation', desc: 'DNSBL blacklist checks across 11 sources for domain/IP' },
  { id: 'web', label: 'Web & TLS', desc: 'HTTP probe, TLS inspection, security headers, tech fingerprint' },
  { id: 'surface', label: 'Attack Surface', desc: 'Internet-facing assets, exposed hosts, open ports' },
  { id: 'full', label: 'Full Scan', desc: 'Orchestrator: runs all checks in parallel with composite scoring' },
];

export default function DomainInvestigator(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('dns');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Globe size={28} />}
      title="Domain Security Investigator"
      description="Comprehensive domain security analysis — DNS, reputation, web security, attack surface, and full automated scans. Pick the depth you need."
    >
      {/* Tab bar */}
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[#1e2030] mb-6"
        aria-label="Domain analysis"
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
          {activeTab === 'dns' && <Domain />}
          {activeTab === 'reputation' && <DomainReputation />}
          {activeTab === 'web' && <DomainWebcheck />}
          {activeTab === 'surface' && <Exposure />}
          {activeTab === 'full' && <FullSpectrum />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
