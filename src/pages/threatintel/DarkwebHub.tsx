import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const DarkWeb = lazy(() => import('./DarkWebOsintTools'));
const DarknetMarketsTimeline = lazy(() => import('./DarknetMarketsTimeline'));
const BreachForums = lazy(() => import('./BreachForums'));
const DeepDarkCTI = lazy(() => import('./DeepDarkCTI'));
const CyberCrime = lazy(() => import('./CyberCrime'));
const PhysicalBitcoinAttacks = lazy(() => import('./PhysicalBitcoinAttacks'));
const Infostealer = lazy(() => import('./Infostealer'));
const SecretLeaks = lazy(() => import('./SecretLeaks'));
const BreachDisclosures = lazy(() => import('./BreachDisclosures'));
const RansomReport = lazy(() => import('./RansomReport'));
const RansomwareActivity = lazy(() => import('./RansomwareActivity'));
const RansomwareMap = lazy(() => import('./RansomwareMap'));
const Ransomwhere = lazy(() => import('./Ransomwhere'));
type TabId =
  | 'watch'
  | 'markets'
  | 'forums'
  | 'deepdark'
  | 'crime'
  | 'bitcoin'
  | 'infostealer'
  | 'leaks'
  | 'disclosures'
  | 'ransom-report'
  | 'ransom-activity'
  | 'ransom-map'
  | 'ransomwhere';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'watch', label: 'Watch', desc: 'Dark web monitoring dashboard' },
  { id: 'markets', label: 'Markets', desc: 'Darknet market timelines' },
  { id: 'forums', label: 'Forums', desc: 'Breach forum tracker' },
  { id: 'deepdark', label: 'DeepDark', desc: 'DeepDark CTI sources' },
  { id: 'crime', label: 'Crime', desc: 'Cybercrime ecosystem intelligence' },
  { id: 'bitcoin', label: 'Bitcoin', desc: 'Physical Bitcoin attack tracking' },
  { id: 'infostealer', label: 'Infostealer', desc: 'Infostealer log analysis' },
  { id: 'leaks', label: 'Secret Leaks', desc: 'Secret and credential leak monitoring' },
  { id: 'disclosures', label: 'Breach Disclosures', desc: 'Breach disclosure feed' },
  { id: 'ransom-report', label: 'Ransom Report', desc: 'Per-group CTI dossier' },
  { id: 'ransom-activity', label: 'Ransom Activity', desc: 'Live ransomware activity feed' },
  { id: 'ransom-map', label: 'Ransom Map', desc: 'Ransomware victim geo map' },
  { id: 'ransomwhere', label: 'Ransomwhere', desc: 'Crypto wallet directory' },
];
const HUB_PATH = 'darkweb';
const DEFAULT_TAB: TabId = 'watch';
export default function DarkwebHub(): JSX.Element {
  // Deep links like /threatintel/darkweb/markets should land on the right
  // tab. Seed state with the default tab so the SSR/first client render
  // match the hub-base prerender; sync to the URL param in a post-mount
  // effect.
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);
  useEffect(() => {
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
    } else if (!tab) {
      navigate(`/threatintel/${HUB_PATH}/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tab, navigate]);
  const onSelect = (id: TabId) => {
    if (id === activeTab) return;
    setActiveTab(id);
    navigate(`/threatintel/${HUB_PATH}/${id}`, { replace: true });
  };
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Dark web tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'watch' && <DarkWeb />}
        {activeTab === 'markets' && <DarknetMarketsTimeline />}
        {activeTab === 'forums' && <BreachForums />}
        {activeTab === 'deepdark' && <DeepDarkCTI />}
        {activeTab === 'crime' && <CyberCrime />}
        {activeTab === 'bitcoin' && <PhysicalBitcoinAttacks />}
        {activeTab === 'infostealer' && <Infostealer />}
        {activeTab === 'leaks' && <SecretLeaks />}
        {activeTab === 'disclosures' && <BreachDisclosures />}
        {activeTab === 'ransom-report' && <RansomReport />}
        {activeTab === 'ransom-activity' && <RansomwareActivity />}
        {activeTab === 'ransom-map' && <RansomwareMap />}
        {activeTab === 'ransomwhere' && <Ransomwhere />}
      </Suspense>
    </HubShell>
  );
}
