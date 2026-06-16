import { lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
const ActorDirectory = lazy(() => import('./ActorDirectory'));
const ActorTimeline = lazy(() => import('./ActorTimeline'));
const ActorDNA = lazy(() => import('./ActorDNA'));
const ActorUsernameSearch = lazy(() => import('./ActorUsernameSearch'));
const Attribution = lazy(() => import('./AttributionFramework'));
type TabId = 'directory' | 'timeline' | 'dna' | 'usernames' | 'attribution';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'directory', label: 'Directory', desc: 'Actor directory across MITRE, MISP Galaxy, and platform DB' },
  { id: 'timeline', label: 'Timeline', desc: 'Actor posting activity and operational tempo' },
  { id: 'dna', label: 'DNA', desc: 'TTP signatures and infrastructure fingerprints' },
  { id: 'usernames', label: 'Usernames', desc: 'Search forum handles across 2M+ records' },
  { id: 'attribution', label: 'Attribution', desc: 'Attribution framework and analysis' },
];
const DEFAULT_TAB: TabId = 'directory';
export default function ActorHub(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const activeTab = tab && TABS.some((t) => t.id === tab) ? (tab as TabId) : DEFAULT_TAB;
  return (
    <HubShell
      tabs={TABS}
      active={activeTab}
      onSelect={(id) => setSearchParams({ tab: id }, { replace: true })}
      ariaLabel="Actor tools"
      tone="rose"
    >
      {activeTab === 'directory' && <ActorDirectory />}
      {activeTab === 'timeline' && <ActorTimeline />}
      {activeTab === 'dna' && <ActorDNA />}
      {activeTab === 'usernames' && <ActorUsernameSearch />}
      {activeTab === 'attribution' && <Attribution />}
    </HubShell>
  );
}
