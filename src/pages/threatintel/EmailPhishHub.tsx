import { lazy, useState } from 'react';
import { HubShell } from '../../components/HubShell';
const PhishFeed = lazy(() => import('./PhishFeed'));
const PhishingWordlists = lazy(() => import('./PhishingWordlists'));
const ScamWatch = lazy(() => import('../dfir/ScamWatch'));
type TabId = 'phish' | 'urls' | 'scam';
const TABS: Array<{ id: TabId; label: string; desc: string }> = [
  { id: 'phish', label: 'Phish Feed', desc: 'Phishing feed aggregation' },
  { id: 'urls', label: 'Wordlists', desc: 'Phishing wordlists' },
  { id: 'scam', label: 'Scam Watch', desc: 'Scam watch and monitoring' },
];
export default function EmailPhishHub(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('phish');
  return (
    <HubShell tabs={TABS} active={activeTab} onSelect={setActiveTab} ariaLabel="Email tools" tone="rose">
      {activeTab === 'phish' && <PhishFeed />}
      {activeTab === 'urls' && <PhishingWordlists />}
      {activeTab === 'scam' && <ScamWatch />}
    </HubShell>
  );
}
