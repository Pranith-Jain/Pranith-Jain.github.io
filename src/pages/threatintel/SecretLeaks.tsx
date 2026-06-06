import { useState, useMemo } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  Copy,
  FileWarning,
  Globe,
  Key,
  LayoutGrid,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trophy,
} from 'lucide-react';

type TabId = 'overview' | 'live' | 'leaderboard';
type Severity = 'critical' | 'high' | 'medium' | 'low';
type Source = 'file' | 'commit';

interface LeakEntry {
  id: string;
  provider: string;
  redactedKey: string;
  repo: string;
  owner: string;
  file: string;
  severity: Severity;
  source: Source;
  timestamp: string;
  exposureScore: number;
  secretCount: number;
}

const SEV_STYLES: Record<Severity, { text: string; chip: string; Icon: typeof ShieldAlert }> = {
  critical: {
    text: 'text-rose-700 dark:text-rose-300',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: ShieldX,
  },
  high: {
    text: 'text-orange-600 dark:text-orange-400',
    chip: 'border-orange-500/30 bg-orange-500/5 text-orange-600 dark:text-orange-400',
    Icon: ShieldAlert,
  },
  medium: {
    text: 'text-amber-700 dark:text-amber-400',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  low: {
    text: 'text-sky-700 dark:text-sky-400',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    Icon: ShieldCheck,
  },
};

const MOCK_LEAKS: LeakEntry[] = [
  {
    id: '1',
    provider: 'AWS Access Key',
    redactedKey: 'AKIA****3F7Q',
    repo: 'webapp-prod',
    owner: 'acme-corp',
    file: '.env.production',
    severity: 'critical',
    source: 'file',
    timestamp: '2026-06-05T14:23:00Z',
    exposureScore: 95,
    secretCount: 3,
  },
  {
    id: '2',
    provider: 'GitHub PAT',
    redactedKey: 'ghp_****aB3d',
    repo: 'internal-tools',
    owner: 'devteam-inc',
    file: 'config/secrets.yaml',
    severity: 'critical',
    source: 'file',
    timestamp: '2026-06-05T13:45:00Z',
    exposureScore: 92,
    secretCount: 2,
  },
  {
    id: '3',
    provider: 'Stripe Secret',
    redactedKey: 'sk_live_****xY9z',
    repo: 'ecommerce-api',
    owner: 'shopfast',
    file: 'src/config.ts',
    severity: 'critical',
    source: 'commit',
    timestamp: '2026-06-05T12:30:00Z',
    exposureScore: 90,
    secretCount: 1,
  },
  {
    id: '4',
    provider: 'OpenAI API Key',
    redactedKey: 'sk-****mN7p',
    repo: 'ai-experiments',
    owner: 'ml-researcher',
    file: 'notebooks/gpt4.ipynb',
    severity: 'high',
    source: 'file',
    timestamp: '2026-06-05T11:15:00Z',
    exposureScore: 78,
    secretCount: 1,
  },
  {
    id: '5',
    provider: 'Slack Token',
    redactedKey: 'xoxb-****9K2l',
    repo: 'slack-bot',
    owner: 'community-tools',
    file: 'bot.py',
    severity: 'high',
    source: 'commit',
    timestamp: '2026-06-05T10:00:00Z',
    exposureScore: 75,
    secretCount: 1,
  },
  {
    id: '6',
    provider: 'Google API Key',
    redactedKey: 'AIza****3R5t',
    repo: 'maps-widget',
    owner: 'geo-apps',
    file: 'index.html',
    severity: 'high',
    source: 'file',
    timestamp: '2026-06-05T09:30:00Z',
    exposureScore: 72,
    secretCount: 1,
  },
  {
    id: '7',
    provider: 'SendGrid Key',
    redactedKey: 'SG.****pQ7r',
    repo: 'mailer-service',
    owner: 'notif-team',
    file: '.env',
    severity: 'critical',
    source: 'file',
    timestamp: '2026-06-05T08:45:00Z',
    exposureScore: 88,
    secretCount: 2,
  },
  {
    id: '8',
    provider: 'Twilio SID',
    redactedKey: 'SK****aC3e',
    repo: 'voice-app',
    owner: 'telecom-dev',
    file: 'config.json',
    severity: 'medium',
    source: 'file',
    timestamp: '2026-06-05T08:00:00Z',
    exposureScore: 55,
    secretCount: 1,
  },
  {
    id: '9',
    provider: 'Mailgun Key',
    redactedKey: 'key-****mN4p',
    repo: 'email-templates',
    owner: 'marketing-eng',
    file: 'docker-compose.yml',
    severity: 'high',
    source: 'commit',
    timestamp: '2026-06-05T07:15:00Z',
    exposureScore: 70,
    secretCount: 1,
  },
  {
    id: '10',
    provider: 'Firebase Key',
    redactedKey: 'AAAA****xZ9w',
    repo: 'mobile-app',
    owner: 'app-studio',
    file: 'android/app.json',
    severity: 'medium',
    source: 'file',
    timestamp: '2026-06-05T06:30:00Z',
    exposureScore: 50,
    secretCount: 1,
  },
  {
    id: '11',
    provider: 'Heroku API Key',
    redactedKey: 'HRKU-****bD2f',
    repo: 'deploy-scripts',
    owner: 'devops-team',
    file: 'heroku.env',
    severity: 'high',
    source: 'file',
    timestamp: '2026-06-04T23:00:00Z',
    exposureScore: 73,
    secretCount: 1,
  },
  {
    id: '12',
    provider: 'Azure SAS Token',
    redactedKey: 'sv=****mK8n',
    repo: 'storage-utils',
    owner: 'cloud-arch',
    file: 'scripts/upload.sh',
    severity: 'critical',
    source: 'commit',
    timestamp: '2026-06-04T22:15:00Z',
    exposureScore: 85,
    secretCount: 2,
  },
  {
    id: '13',
    provider: 'Discord Bot Token',
    redactedKey: 'MTA****qR4s',
    repo: 'discord-bot',
    owner: 'gaming-community',
    file: 'bot.js',
    severity: 'medium',
    source: 'file',
    timestamp: '2026-06-04T21:30:00Z',
    exposureScore: 48,
    secretCount: 1,
  },
  {
    id: '14',
    provider: 'Datadog API Key',
    redactedKey: 'a1b2****c3d4',
    repo: 'monitoring',
    owner: 'sre-team',
    file: 'dd-agent.yaml',
    severity: 'medium',
    source: 'file',
    timestamp: '2026-06-04T20:45:00Z',
    exposureScore: 52,
    secretCount: 1,
  },
  {
    id: '15',
    provider: 'Algolia Key',
    redactedKey: 'alg_****eF5g',
    repo: 'search-ui',
    owner: 'frontend-team',
    file: '.env.local',
    severity: 'low',
    source: 'file',
    timestamp: '2026-06-04T20:00:00Z',
    exposureScore: 35,
    secretCount: 1,
  },
];

const PROVIDERS = [...new Set(MOCK_LEAKS.map((l) => l.provider))].sort();

const LEADERBOARD_STATS = {
  totalSecrets: 12847,
  leakedRepos: 3421,
  providers: 156,
  reposScanned: 89234,
};

const PROVIDER_RANKINGS = [
  { name: 'AWS Access Key', count: 3241, pct: 25.2 },
  { name: 'GitHub PAT', count: 2156, pct: 16.8 },
  { name: 'Google API Key', count: 1567, pct: 12.2 },
  { name: 'Stripe Secret', count: 1234, pct: 9.6 },
  { name: 'OpenAI Key', count: 987, pct: 7.7 },
  { name: 'Slack Token', count: 876, pct: 6.8 },
  { name: 'SendGrid Key', count: 654, pct: 5.1 },
  { name: 'Twilio SID', count: 543, pct: 4.2 },
  { name: 'Firebase Key', count: 432, pct: 3.4 },
  { name: 'Azure SAS', count: 321, pct: 2.5 },
];

const REPO_RANKINGS = [
  { name: 'acme-corp/webapp-prod', secrets: 47, owner: 'acme-corp' },
  { name: 'devteam-inc/internal-tools', secrets: 34, owner: 'devteam-inc' },
  { name: 'shopfast/ecommerce-api', secrets: 28, owner: 'shopfast' },
  { name: 'ml-researcher/ai-experiments', secrets: 23, owner: 'ml-researcher' },
  { name: 'cloud-arch/storage-utils', secrets: 19, owner: 'cloud-arch' },
  { name: 'notif-team/mailer-service', secrets: 17, owner: 'notif-team' },
  { name: 'app-studio/mobile-app', secrets: 15, owner: 'app-studio' },
  { name: 'devops-team/deploy-scripts', secrets: 14, owner: 'devops-team' },
  { name: 'gaming-community/discord-bot', secrets: 12, owner: 'gaming-community' },
  { name: 'sre-team/monitoring', secrets: 11, owner: 'sre-team' },
];

const OWNER_RANKINGS = [
  { name: 'acme-corp', repos: 12, totalSecrets: 89 },
  { name: 'devteam-inc', repos: 8, totalSecrets: 67 },
  { name: 'shopfast', repos: 6, totalSecrets: 52 },
  { name: 'ml-researcher', repos: 5, totalSecrets: 43 },
  { name: 'cloud-arch', repos: 4, totalSecrets: 38 },
  { name: 'notif-team', repos: 4, totalSecrets: 34 },
  { name: 'app-studio', repos: 3, totalSecrets: 28 },
  { name: 'devops-team', repos: 3, totalSecrets: 25 },
  { name: 'gaming-community', repos: 2, totalSecrets: 18 },
  { name: 'sre-team', repos: 2, totalSecrets: 15 },
];

const SEV_MIX = { critical: 3241, high: 4567, medium: 3456, low: 1583 };

export default function SecretLeaks(): JSX.Element {
  const [tab, setTab] = useState<TabId>('overview');
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | Source>('all');
  const [sortBy, setSortBy] = useState<'score' | 'secrets' | 'repo' | 'scan'>('score');
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);
  const perPage = 8;

  const filtered = useMemo(() => {
    let items = [...MOCK_LEAKS];
    if (query) {
      const q = query.toLowerCase();
      items = items.filter(
        (l) =>
          l.repo.toLowerCase().includes(q) ||
          l.owner.toLowerCase().includes(q) ||
          l.provider.toLowerCase().includes(q) ||
          l.file.toLowerCase().includes(q)
      );
    }
    if (severityFilter !== 'all') items = items.filter((l) => l.severity === severityFilter);
    if (providerFilter !== 'all') items = items.filter((l) => l.provider === providerFilter);
    if (sourceFilter !== 'all') items = items.filter((l) => l.source === sourceFilter);
    items.sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return b.exposureScore - a.exposureScore;
        case 'secrets':
          return b.secretCount - a.secretCount;
        case 'repo':
          return a.repo.localeCompare(b.repo);
        case 'scan':
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
    });
    return items;
  }, [query, severityFilter, providerFilter, sourceFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const tabs: Array<{ id: TabId; label: string; icon: typeof LayoutGrid }> = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'live', label: 'Live Keys', icon: Key },
    { id: 'leaderboard', label: 'Leaderboards', icon: Trophy },
  ];

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="max-w-full px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="max-w-7xl mx-auto">
        <BackLink
          to="/threatintel"
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> back to Threat Intel
        </BackLink>

        {/* Header */}
        <div className="animate-fade-in-up mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Key className="text-brand-500" size={28} />
            <h1 className="text-3xl sm:text-4xl font-display font-bold">Secret Leak Dashboard</h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl">
            Real-time monitoring of exposed API keys, tokens, and credentials in public repositories. Inspired by{' '}
            <a
              href="https://x3r0day.me/WebShame/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline"
            >
              WebShame
            </a>{' '}
            &mdash; public metadata only, keys always masked.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-slate-200 dark:border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-mono border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-8 animate-fade-in-up">
            {/* Mission */}
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
                <p className="text-[10px] font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-2">
                  The Mission
                </p>
                <h2 className="text-xl font-display font-bold mb-3">Visibility that helps teams defend fast.</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  We surface public metadata so defenders can respond quickly without retaining code.
                </p>
                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                  {[
                    'Secrets leak to public repos daily.',
                    'Attackers exploit instantly. Visibility enables defense.',
                    'No code retention. Public metadata only. Keys are always masked.',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Shield size={14} className="text-brand-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-display font-semibold">Leak Anatomy</h3>
                {[
                  { label: 'Provider', desc: 'Service or API type detected.' },
                  { label: 'Redacted Key', desc: 'Masked preview only.' },
                  { label: 'Repository', desc: 'Repo and owner details when public.' },
                  { label: 'Timestamp', desc: 'Most recent scan time for context.' },
                  { label: 'Source Link', desc: 'Public link for responsible follow-up.' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                  >
                    <span className="text-xs font-mono font-semibold text-brand-600 dark:text-brand-400 w-24 flex-shrink-0">
                      {item.label}
                    </span>
                    <span className="text-sm text-slate-600 dark:text-slate-400">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Leaks Found', value: LEADERBOARD_STATS.totalSecrets.toLocaleString(), icon: Bug },
                { label: 'Repos Affected', value: LEADERBOARD_STATS.leakedRepos.toLocaleString(), icon: FileWarning },
                { label: 'Providers', value: LEADERBOARD_STATS.providers.toString(), icon: Globe },
                { label: 'Repos Scanned', value: LEADERBOARD_STATS.reposScanned.toLocaleString(), icon: Search },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <s.icon size={14} className="text-slate-400" />
                    <span className="text-[10px] font-mono uppercase text-slate-400">{s.label}</span>
                  </div>
                  <div className="text-2xl font-mono font-bold">{s.value}</div>
                </div>
              ))}
            </div>

            {/* CTA to Live tab */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => setTab('live')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white rounded-lg font-mono text-sm hover:bg-brand-700 transition-colors"
              >
                <Key size={16} /> View Live Leaks
              </button>
            </div>
          </div>
        )}

        {/* ── Live Keys Tab ───────────────────────────────────────────── */}
        {tab === 'live' && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-slate-400">Search</span>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Repo, file, provider..."
                    className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-slate-400">Severity</span>
                <select
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value as Severity | 'all');
                    setPage(1);
                  }}
                  className="py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
                >
                  <option value="all">All levels</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-slate-400">Provider</span>
                <select
                  value={providerFilter}
                  onChange={(e) => {
                    setProviderFilter(e.target.value);
                    setPage(1);
                  }}
                  className="py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
                >
                  <option value="all">All providers</option>
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-slate-400">Source</span>
                <select
                  value={sourceFilter}
                  onChange={(e) => {
                    setSourceFilter(e.target.value as 'all' | Source);
                    setPage(1);
                  }}
                  className="py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
                >
                  <option value="all">Files and commits</option>
                  <option value="file">Files only</option>
                  <option value="commit">Commit history</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-slate-400">Sort</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="py-2 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
                >
                  <option value="score">Exposure score</option>
                  <option value="secrets">Secret count</option>
                  <option value="repo">Repo name</option>
                  <option value="scan">Fastest scan</option>
                </select>
              </label>
            </div>

            {/* Results */}
            <div className="flex items-center justify-between text-xs font-mono text-slate-500">
              <span>{filtered.length} results</span>
              <span>
                Page {page} of {totalPages}
              </span>
            </div>

            {paged.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="text-lg font-display font-semibold text-slate-400">No matches.</h3>
              </div>
            ) : (
              <div className="space-y-3">
                {paged.map((leak) => {
                  const sev = SEV_STYLES[leak.severity];
                  const SevIcon = sev.Icon;
                  return (
                    <div
                      key={leak.id}
                      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:border-brand-500/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${sev.chip}`}
                            >
                              <SevIcon size={10} />
                              {leak.severity}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">{leak.provider}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                              {leak.source === 'file' ? 'File' : 'Commit'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {leak.owner}/{leak.repo}
                            </span>
                            <span className="text-xs text-slate-400">/</span>
                            <span className="text-xs font-mono text-slate-500">{leak.file}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs font-mono text-slate-500">
                            <span>
                              Key:{' '}
                              <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                {leak.redactedKey}
                              </code>
                            </span>
                            <button
                              type="button"
                              onClick={() => copyKey(leak.redactedKey)}
                              className="inline-flex items-center gap-1 text-slate-400 hover:text-brand-500 transition-colors"
                              title="Copy redacted key"
                            >
                              <Copy size={10} />
                              {copied === leak.redactedKey ? 'Copied!' : 'Copy'}
                            </button>
                            <span>{new Date(leak.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div
                            className="text-2xl font-mono font-bold"
                            style={{
                              color:
                                leak.exposureScore >= 80
                                  ? '#F44336'
                                  : leak.exposureScore >= 60
                                    ? '#FF9800'
                                    : leak.exposureScore >= 40
                                      ? '#FFC107'
                                      : '#66BB6A',
                            }}
                          >
                            {leak.exposureScore}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">exposure</div>
                          <div className="text-xs font-mono text-slate-500 mt-1">
                            {leak.secretCount} secret{leak.secretCount > 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs font-mono text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 hover:border-brand-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-400 hover:border-brand-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Leaderboard Tab ─────────────────────────────────────────── */}
        {tab === 'leaderboard' && (
          <div className="space-y-8 animate-fade-in-up">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: 'Leaks Found',
                  value: LEADERBOARD_STATS.totalSecrets.toLocaleString(),
                  sub: 'Total exposed secrets',
                  icon: Bug,
                },
                {
                  label: 'Repos With Leaks',
                  value: LEADERBOARD_STATS.leakedRepos.toLocaleString(),
                  sub: 'Repositories affected',
                  icon: FileWarning,
                },
                {
                  label: 'Providers Detected',
                  value: LEADERBOARD_STATS.providers.toString(),
                  sub: 'Unique secret types',
                  icon: Globe,
                },
                {
                  label: 'Repos Scanned',
                  value: LEADERBOARD_STATS.reposScanned.toLocaleString(),
                  sub: 'Latest crawl size',
                  icon: Search,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <s.icon size={14} className="text-slate-400" />
                    <span className="text-[10px] font-mono uppercase text-slate-400">{s.label}</span>
                  </div>
                  <div className="text-3xl font-mono font-bold mb-1">{s.value}</div>
                  <div className="text-[10px] font-mono text-slate-400">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Severity Mix */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-display font-semibold">Leak Mix</h3>
                  <p className="text-[10px] font-mono text-slate-400">Severity share in the latest scan</p>
                </div>
                <span className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {LEADERBOARD_STATS.totalSecrets.toLocaleString()} secrets
                </span>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden mb-3">
                <span
                  style={{ width: `${(SEV_MIX.critical / LEADERBOARD_STATS.totalSecrets) * 100}%` }}
                  className="bg-rose-500"
                />
                <span
                  style={{ width: `${(SEV_MIX.high / LEADERBOARD_STATS.totalSecrets) * 100}%` }}
                  className="bg-orange-500"
                />
                <span
                  style={{ width: `${(SEV_MIX.medium / LEADERBOARD_STATS.totalSecrets) * 100}%` }}
                  className="bg-amber-500"
                />
                <span
                  style={{ width: `${(SEV_MIX.low / LEADERBOARD_STATS.totalSecrets) * 100}%` }}
                  className="bg-sky-500"
                />
              </div>
              <div className="flex flex-wrap gap-4 text-xs font-mono">
                {[
                  { label: 'Critical', count: SEV_MIX.critical, color: 'bg-rose-500' },
                  { label: 'High', count: SEV_MIX.high, color: 'bg-orange-500' },
                  { label: 'Medium', count: SEV_MIX.medium, color: 'bg-amber-500' },
                  { label: 'Low', count: SEV_MIX.low, color: 'bg-sky-500' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${s.color}`} />
                    <span className="text-slate-500">{s.label}</span>
                    <strong className="text-slate-700 dark:text-slate-300">{s.count.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Rankings */}
            <div className="grid sm:grid-cols-3 gap-6">
              {/* Top Providers */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-display font-semibold">Most Exposed Providers</h3>
                  <p className="text-[10px] font-mono text-slate-400">Top secret types by count</p>
                </div>
                <ol className="space-y-2">
                  {PROVIDER_RANKINGS.map((p, i) => (
                    <li key={p.name} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-400 w-4 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.name}</div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-1">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${p.pct}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-mono text-slate-500 flex-shrink-0">{p.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Top Repos */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-display font-semibold">Top Repos</h3>
                  <p className="text-[10px] font-mono text-slate-400">Highest number of secrets found</p>
                </div>
                <ol className="space-y-2">
                  {REPO_RANKINGS.map((r, i) => (
                    <li key={r.name} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-400 w-4 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{r.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{r.owner}</div>
                      </div>
                      <span className="text-xs font-mono font-semibold text-rose-600 dark:text-rose-400">
                        {r.secrets}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Top Users */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <div className="mb-4">
                  <h3 className="text-sm font-display font-semibold">Top Users</h3>
                  <p className="text-[10px] font-mono text-slate-400">Owners with the most leaked repos</p>
                </div>
                <ol className="space-y-2">
                  {OWNER_RANKINGS.map((o, i) => (
                    <li key={o.name} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-slate-400 w-4 text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{o.name}</div>
                        <div className="text-[10px] font-mono text-slate-400">{o.repos} repos</div>
                      </div>
                      <span className="text-xs font-mono font-semibold text-orange-600 dark:text-orange-400">
                        {o.totalSecrets}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
