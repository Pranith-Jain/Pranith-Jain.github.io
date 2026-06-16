import { Suspense, lazy, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
const Wiki = lazy(() => import('../dfir/Wiki'));
const MitreMatrix = lazy(() => import('../dfir/MitreMatrix'));
const F3ead = lazy(() => import('./F3ead'));
const InsiderThreatMatrix = lazy(() => import('./InsiderThreatMatrix'));
const OwaspAiLandscape = lazy(() => import('./OwaspAiLandscape'));
const LlmThreatAtlas = lazy(() => import('./LlmThreatAtlas'));
type TabId = 'wiki' | 'mitre' | 'f3ead' | 'insider' | 'owasp' | 'llm';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'wiki', label: 'Wiki', desc: 'Threat intelligence wiki' },
  { id: 'mitre', label: 'MITRE', desc: 'MITRE ATT&CK matrix' },
  { id: 'f3ead', label: 'F3EAD', desc: 'F3EAD intelligence framework' },
  { id: 'insider', label: 'Insider', desc: 'Insider threat matrix' },
  { id: 'owasp', label: 'OWASP AI', desc: 'OWASP AI security landscape' },
  { id: 'llm', label: 'LLM Atlas', desc: 'LLM threat atlas' },
];
const DEFAULT_TAB: TabId = 'wiki';
export default function KnowledgeHub(): JSX.Element {
  // Deep links like /threatintel/wiki?tab=mitre should land on the right
  // tab. Seed state with the default tab so the SSR/first client render
  // match the hub-base prerender; sync to the query param in a post-mount
  // effect. The ?tab= query form is used here (not /:tab) to avoid
  // colliding with /threatintel/wiki/:slug article routes.
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(DEFAULT_TAB);
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab as TabId);
    } else if (!tab) {
      setSearchParams({ tab: DEFAULT_TAB }, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const onSelect = (id: TabId) => {
    if (id === activeTab) return;
    setActiveTab(id);
    setSearchParams({ tab: id }, { replace: true });
  };
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Knowledge tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'wiki' && <Wiki />}
        {activeTab === 'mitre' && <MitreMatrix />}
        {activeTab === 'f3ead' && <F3ead />}
        {activeTab === 'insider' && <InsiderThreatMatrix />}
        {activeTab === 'owasp' && <OwaspAiLandscape />}
        {activeTab === 'llm' && <LlmThreatAtlas />}
      </Suspense>
    </HubShell>
  );
}
