import { lazy, useState } from 'react';
import { HubShell } from '../../components/HubShell';
const DarkWeb = lazy(() => import('./DarkWebOsintTools'));
const DarknetMarketsTimeline = lazy(() => import('./DarknetMarketsTimeline'));
const BreachForums = lazy(() => import('./BreachForums'));
const DeepDarkCTI = lazy(() => import('./DeepDarkCTI'));
const CyberCrime = lazy(() => import('./CyberCrime'));
const PhysicalBitcoinAttacks = lazy(() => import('./PhysicalBitcoinAttacks'));
type TabId = 'watch' | 'markets' | 'forums' | 'deepdark' | 'crime' | 'bitcoin';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'watch', label: 'Watch', desc: 'Dark web monitoring dashboard' },
  { id: 'markets', label: 'Markets', desc: 'Darknet market timelines' },
  { id: 'forums', label: 'Forums', desc: 'Breach forum tracker' },
  { id: 'deepdark', label: 'DeepDark', desc: 'DeepDark CTI sources' },
  { id: 'crime', label: 'Crime', desc: 'Cybercrime ecosystem intelligence' },
  { id: 'bitcoin', label: 'Bitcoin', desc: 'Physical Bitcoin attack tracking' },
];
export default function DarkwebHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('watch');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Dark web tools" tone="rose">
      {activeTab === 'watch' && <DarkWeb />}
      {activeTab === 'markets' && <DarknetMarketsTimeline />}
      {activeTab === 'forums' && <BreachForums />}
      {activeTab === 'deepdark' && <DeepDarkCTI />}
      {activeTab === 'crime' && <CyberCrime />}
      {activeTab === 'bitcoin' && <PhysicalBitcoinAttacks />}
    </HubShell>
  );
}
