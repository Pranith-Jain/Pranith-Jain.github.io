import { lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const activeTab = tab && TABS.some((t) => t.id === tab) ? (tab as TabId) : DEFAULT_TAB;
  return (
    <HubShell
      tabs={TABS}
      active={activeTab}
      onSelect={(id) => setSearchParams({ tab: id }, { replace: true })}
      ariaLabel="Knowledge tools"
      tone="rose"
    >
      {activeTab === 'wiki' && <Wiki />}
      {activeTab === 'mitre' && <MitreMatrix />}
      {activeTab === 'f3ead' && <F3ead />}
      {activeTab === 'insider' && <InsiderThreatMatrix />}
      {activeTab === 'owasp' && <OwaspAiLandscape />}
      {activeTab === 'llm' && <LlmThreatAtlas />}
    </HubShell>
  );
}
