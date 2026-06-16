import { lazy, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
const HUB_PATH = 'phishing';
const DEFAULT_TAB: TabId = 'phish';
export default function EmailPhishHub(): JSX.Element {
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
      ariaLabel="Email tools"
      tone="rose"
    >
      {activeTab === 'phish' && <PhishFeed />}
      {activeTab === 'urls' && <PhishingWordlists />}
      {activeTab === 'scam' && <ScamWatch />}
    </HubShell>
  );
}
