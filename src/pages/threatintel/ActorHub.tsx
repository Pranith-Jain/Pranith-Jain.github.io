import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const ActorDirectory = lazy(() => import('./ActorDirectory'));
const ActorTimeline = lazy(() => import('./ActorTimeline'));
const ActorDNA = lazy(() => import('./ActorDNA'));
const ActorUsernameSearch = lazy(() => import('./ActorUsernameSearch'));
const Attribution = lazy(() => import('./AttributionFramework'));
const ThreatActorCatalog = lazy(() => import('./ThreatActorCatalog'));
const ActorKb = lazy(() => import('./ActorKb'));
const RelationshipGraph = lazy(() => import('./RelationshipGraph'));
type TabId = 'directory' | 'timeline' | 'dna' | 'usernames' | 'attribution' | 'catalog' | 'kb' | 'graph';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'directory', label: 'Directory', desc: 'Actor directory across MITRE, MISP Galaxy, and platform DB' },
  { id: 'timeline', label: 'Timeline', desc: 'Actor posting activity and operational tempo' },
  { id: 'dna', label: 'DNA', desc: 'TTP signatures and infrastructure fingerprints' },
  { id: 'usernames', label: 'Usernames', desc: 'Search forum handles across 2M+ records' },
  { id: 'attribution', label: 'Attribution', desc: 'Attribution framework and analysis' },
  { id: 'catalog', label: 'Catalog', desc: 'Threat actor catalog with profiles' },
  { id: 'kb', label: 'Knowledge Base', desc: 'Actor knowledge base with MITRE mapping' },
  { id: 'graph', label: 'Graph', desc: 'Relationship graph visualization' },
];
const DEFAULT_TAB: TabId = 'directory';
export default function ActorHub(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);
  useEffect(() => {
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
    }
  }, [tab]);
  const onSelect = (id: TabId) => {
    if (id === activeTab) return;
    setActiveTab(id);
    setSearchParams(id === DEFAULT_TAB ? {} : { tab: id }, { replace: true });
  };
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Actor tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'directory' && <ActorDirectory />}
        {activeTab === 'timeline' && <ActorTimeline />}
        {activeTab === 'dna' && <ActorDNA />}
        {activeTab === 'usernames' && <ActorUsernameSearch />}
        {activeTab === 'attribution' && <Attribution />}
        {activeTab === 'catalog' && <ThreatActorCatalog />}
        {activeTab === 'kb' && <ActorKb />}
        {activeTab === 'graph' && <RelationshipGraph />}
      </Suspense>
    </HubShell>
  );
}
