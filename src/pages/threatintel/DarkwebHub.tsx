import { lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
const HUB_PATH = 'darkweb';
const DEFAULT_TAB: TabId = 'watch';
export default function DarkwebHub(): JSX.Element {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const activeTab = tab && TABS.some((t) => t.id === tab) ? (tab as TabId) : DEFAULT_TAB;
  useEffect(() => {
    if (!tab || !TABS.some((t) => t.id === tab)) {
      navigate(`/threatintel/${HUB_PATH}/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tab, navigate]);
  return (
    <HubShell
      tabs={TABS}
      active={activeTab}
      onSelect={(id) => navigate(`/threatintel/${HUB_PATH}/${id}`, { replace: true })}
      ariaLabel="Dark web tools"
      tone="rose"
    >
      {activeTab === 'watch' && <DarkWeb />}
      {activeTab === 'markets' && <DarknetMarketsTimeline />}
      {activeTab === 'forums' && <BreachForums />}
      {activeTab === 'deepdark' && <DeepDarkCTI />}
      {activeTab === 'crime' && <CyberCrime />}
      {activeTab === 'bitcoin' && <PhysicalBitcoinAttacks />}
    </HubShell>
  );
}
