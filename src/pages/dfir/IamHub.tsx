import { TabLoader } from '../../components/ui/TabLoader';
import { Suspense, lazy, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Lock } from 'lucide-react';

const IamPolicyAnalyzer = lazy(() => import('./IamPolicyAnalyzer'));
const GcpIamAnalyzer = lazy(() => import('./GcpIamAnalyzer'));
const AzureRbacAnalyzer = lazy(() => import('./AzureRbacAnalyzer'));
const K8sRbacAnalyzer = lazy(() => import('./K8sRbacAnalyzer'));

type TabId = 'aws' | 'gcp' | 'azure' | 'k8s';

const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'aws', label: 'AWS IAM', desc: 'Analyze AWS IAM policies for over-permission and risk' },
  { id: 'gcp', label: 'GCP IAM', desc: 'Analyze GCP IAM bindings and service account privileges' },
  { id: 'azure', label: 'AZURE RBAC', desc: 'Analyze Azure RBAC role assignments and scope' },
  { id: 'k8s', label: 'K8S RBAC', desc: 'Analyze Kubernetes RBAC roles and bindings' },
];

export default function IamHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('aws');

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Lock size={28} />}
      title="IAM & RBAC Hub"
      description="Identity and access management analysis across AWS, GCP, Azure, and Kubernetes."
    >
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="IAM and RBAC tools"
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
          {activeTab === 'aws' && <IamPolicyAnalyzer />}
          {activeTab === 'gcp' && <GcpIamAnalyzer />}
          {activeTab === 'azure' && <AzureRbacAnalyzer />}
          {activeTab === 'k8s' && <K8sRbacAnalyzer />}
        </Suspense>
      </div>
    </DataPageLayout>
  );
}
