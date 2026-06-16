import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const Detections = lazy(() => import('./Detections'));
const DisarmFramework = lazy(() => import('./DisarmFramework'));
const YaraPage = lazy(() => import('./Yarahub'));
const ThreatSignalRss = lazy(() => import('./ThreatSignalRss'));
type TabId = 'detections' | 'disarm' | 'yara' | 'signal';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'detections', label: 'Detections', desc: 'Detection rule catalog' },
  { id: 'disarm', label: 'DISARM', desc: 'DISARM framework' },
  { id: 'yara', label: 'YARA', desc: 'YARA rule browser' },
  { id: 'signal', label: 'Signal', desc: 'ThreatSignal RSS feed' },
];
const HUB_PATH = 'detections';
const DEFAULT_TAB: TabId = 'detections';
export default function DetectionHub(): JSX.Element {
  // Deep links like /threatintel/detections/yara should land on the right
  // tab. Seed state with the default tab so the SSR/first client render
  // match the hub-base prerender; sync to the URL param in a post-mount
  // effect. Direct useParams-in-render would cause a hydration mismatch
  // because the worker serves the prerender for every tab URL.
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
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Detection tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'detections' && <Detections />}
        {activeTab === 'disarm' && <DisarmFramework />}
        {activeTab === 'yara' && <YaraPage />}
        {activeTab === 'signal' && <ThreatSignalRss />}
      </Suspense>
    </HubShell>
  );
}
