import { lazy, useState } from 'react';
import { HubShell } from '../../components/HubShell';
const CveIntel = lazy(() => import('./CveIntel'));
const GithubAdvisories = lazy(() => import('./GithubAdvisories'));
const CveResourcesCatalog = lazy(() => import('../dfir/CveResourcesCatalog'));
type TabId = 'cves' | 'advisories' | 'resources';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'cves', label: 'CVE Intel', desc: 'Unified CVE intelligence hub' },
  { id: 'advisories', label: 'Advisories', desc: 'GitHub security advisories' },
  { id: 'resources', label: 'Resources', desc: 'CVE resource catalogs' },
];
export default function VulnHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('cves');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Vulnerability tools" tone="rose">
      {activeTab === 'cves' && <CveIntel />}
      {activeTab === 'advisories' && <GithubAdvisories />}
      {activeTab === 'resources' && <CveResourcesCatalog />}
    </HubShell>
  );
}
