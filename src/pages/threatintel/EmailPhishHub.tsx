import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { HubShell } from '../../components/HubShell';
import { TabLoader } from '../../components/ui/TabLoader';
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
  // Deep links like /threatintel/phishing/urls should land on the right tab.
  // Seed state with the default tab so the SSR/first client render match
  // the hub-base prerender; sync to the URL param in a post-mount effect.
  // Direct useParams-in-render would cause a hydration mismatch because
  // the worker serves the prerender for every tab URL.
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
    <HubShell tabs={TABS} active={activeTab} onSelect={onSelect} ariaLabel="Phishing tools" tone="rose">
      <Suspense fallback={<TabLoader />}>
        {activeTab === 'phish' && <PhishFeed />}
        {activeTab === 'urls' && <PhishingWordlists />}
        {activeTab === 'scam' && <ScamWatch />}
      </Suspense>
    </HubShell>
  );
}
