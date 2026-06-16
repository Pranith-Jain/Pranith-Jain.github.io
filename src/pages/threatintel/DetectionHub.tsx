import { lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
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
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const activeTab = tab && TABS.some(t => t.id === tab) ? (tab as TabId) : DEFAULT_TAB;
  useEffect(() => {
    if (!tab || !TABS.some(t => t.id === tab)) {
      navigate(`/threatintel/${HUB_PATH}/${DEFAULT_TAB}`, { replace: true });
    }
  }, [tab, navigate]);
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={(id) => navigate(`/threatintel/${HUB_PATH}/${id}`, { replace: true })} ariaLabel="Detection tools" tone="rose">
      {activeTab === 'detections' && <Detections />}
      {activeTab === 'disarm' && <DisarmFramework />}
      {activeTab === 'yara' && <YaraPage />}
      {activeTab === 'signal' && <ThreatSignalRss />}
    </HubShell>
  );
}
