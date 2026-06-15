import { lazy, useState } from 'react';
import { HubShell } from '../../components/HubShell';
const OsintFramework = lazy(() => import('../dfir/OsintFramework'));
const OsintCliTools = lazy(() => import('./OsintCliTools'));
const OsintCountryMap = lazy(() => import('./OsintCountryMap'));
const CuratedToolbox = lazy(() => import('./CuratedToolbox'));
const SecopsCatalog = lazy(() => import('../dfir/SecopsCatalog'));
type TabId = 'framework' | 'cli' | 'map' | 'toolbox' | 'secops';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'framework', label: 'Framework', desc: 'OSINT framework browser' },
  { id: 'cli', label: 'CLI Tools', desc: 'CLI tools catalog' },
  { id: 'map', label: 'Country Map', desc: 'Country-based OSINT map' },
  { id: 'toolbox', label: 'Toolbox', desc: 'Curated security toolbox' },
  { id: 'secops', label: 'SecOps', desc: 'SecOps tools catalog' },
];
export default function OsintHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('framework');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="OSINT tools" tone="rose">
      {activeTab === 'framework' && <OsintFramework />}
      {activeTab === 'cli' && <OsintCliTools />}
      {activeTab === 'map' && <OsintCountryMap />}
      {activeTab === 'toolbox' && <CuratedToolbox />}
      {activeTab === 'secops' && <SecopsCatalog />}
    </HubShell>
  );
}
