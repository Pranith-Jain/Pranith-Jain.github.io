import { lazy, useState } from 'react';
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
export default function DetectionHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('detections');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Detection tools" tone="rose">
      {activeTab === 'detections' && <Detections />}
      {activeTab === 'disarm' && <DisarmFramework />}
      {activeTab === 'yara' && <YaraPage />}
      {activeTab === 'signal' && <ThreatSignalRss />}
    </HubShell>
  );
}
