import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Key,
  Shield,
  Globe,
  Server,
  FileSearch,
  Cpu,
  Book,
  Bug,
  Terminal,
  ExternalLink,
} from 'lucide-react';

interface ProviderKeyInfo {
  provider: string;
  envVar: string;
  source: string;
  icon: typeof Key;
  freeTier: string;
}

const PROVIDERS: ProviderKeyInfo[] = [
  {
    provider: 'VirusTotal',
    envVar: 'VIRUSTOTAL_API_KEY',
    source: 'virustotal.com/gui/my-apikey',
    icon: Shield,
    freeTier: '500 req/day, 4 req/min',
  },
  {
    provider: 'Shodan',
    envVar: 'SHODAN_API_KEY',
    source: 'account.shodan.io',
    icon: Server,
    freeTier: 'Restricted (membership required for host data)',
  },
  {
    provider: 'Censys',
    envVar: 'CENSYS_API_ID / CENSYS_API_SECRET',
    source: 'search.censys.io/account/api',
    icon: Globe,
    freeTier: '250 credits/mo',
  },
  {
    provider: 'Netlas',
    envVar: 'NETLAS_API_KEY',
    source: 'app.netlas.io/profile/',
    icon: Globe,
    freeTier: '50 req/day (community)',
  },
  {
    provider: 'AbuseIPDB',
    envVar: 'ABUSEIPDB_API_KEY',
    source: 'abuseipdb.com/account/api',
    icon: Shield,
    freeTier: '1000 req/day',
  },
  {
    provider: 'AlienVault OTX',
    envVar: 'OTX_API_KEY',
    source: 'otx.alienvault.com/api',
    icon: Bug,
    freeTier: 'Unlimited (public API)',
  },
  {
    provider: 'GreyNoise',
    envVar: 'GREYNOISE_API_KEY',
    source: 'portal.greynoise.io',
    icon: FileSearch,
    freeTier: '500 req/mo (community)',
  },
  {
    provider: 'Hybrid Analysis',
    envVar: 'HYBRIDANALYSIS_API_KEY',
    source: 'hybrid-analysis.com/apikey',
    icon: FileSearch,
    freeTier: 'Limited (registration)',
  },
  {
    provider: 'EmailRep',
    envVar: 'EMAILREP_API_KEY',
    source: 'emailrep.io',
    icon: Bug,
    freeTier: '10 req/hr (free tier), 1 req/s',
  },
  {
    provider: 'BinaryEdge',
    envVar: 'BINARYEDGE_API_KEY',
    source: 'app.binaryedge.io',
    icon: Globe,
    freeTier: '100 req/mo',
  },
  {
    provider: 'ransomware.live PRO',
    envVar: 'RL_PRO_API_KEY',
    source: 'ransomware.live',
    icon: Bug,
    freeTier: 'Paid API',
  },
  { provider: 'Pulsedive', envVar: 'PULSEDIVE_API_KEY', source: 'pulsedive.com', icon: Shield, freeTier: 'Limited' },
  {
    provider: 'X API (Twitter)',
    envVar: 'X_API_BEARER_TOKEN',
    source: 'developer.twitter.com',
    icon: Terminal,
    freeTier: 'Free tier: 1500 posts/mo',
  },
  {
    provider: 'Reddit',
    envVar: 'REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET',
    source: 'reddit.com/prefs/apps',
    icon: Terminal,
    freeTier: 'Unlimited (OAuth2)',
  },
  { provider: 'IntelX', envVar: 'INTELX_API_KEY', source: 'intelx.io', icon: Book, freeTier: 'Limited' },
  {
    provider: 'Criminal IP',
    envVar: 'CRIMINALIP_API_KEY',
    source: 'criminalip.io',
    icon: Server,
    freeTier: '1000 req/mo',
  },
  {
    provider: 'NVD 2.0',
    envVar: 'NVD_API_KEY',
    source: 'nvd.nist.gov/developers',
    icon: Shield,
    freeTier: '50 req/sec (with key)',
  },
  {
    provider: 'Cert spotter',
    envVar: 'CERTSPOTTER_API_KEY',
    source: 'certspotter.com',
    icon: Globe,
    freeTier: 'Limited',
  },
  {
    provider: 'Claroty (Team82)',
    envVar: 'CLAROTY_API_KEY',
    source: 'claroty.com/team82',
    icon: Cpu,
    freeTier: 'Restricted',
  },
  {
    provider: 'URLScan.io',
    envVar: 'URLSCAN_API_KEY',
    source: 'urlscan.io/user/api',
    icon: FileSearch,
    freeTier: '100 req/mo, 10 concurrent',
  },
  {
    provider: 'OpenTelemetry (Otel)',
    envVar: 'OTEL_EXPORTER_OTLP_HEADERS',
    source: 'honeycomb.io / any OTLP provider',
    icon: Terminal,
    freeTier: 'Free tier available',
  },
];

const ADDITIONAL_ENV: Array<{ var: string; description: string }> = [
  {
    var: 'KV_CACHE',
    description: 'Workers KV namespace for caching aggregator responses, IOC results, and Telegram feed',
  },
  { var: 'KV_SHARES', description: 'Separate KV namespace for share links' },
  { var: 'KV_CASE_STUDIES', description: 'Separate KV namespace for case study storage' },
  { var: 'KV_CVE', description: 'Separate KV namespace for CVE detail cache' },
  { var: 'KV_TG_ARCHIVE', description: 'D1 database binding for Telegram message archiving' },
  { var: 'DB_CVE', description: 'D1 database binding for CVE metadata' },
  { var: 'APIFY_TOKEN', description: 'Apify API token for Telegram scraping' },
  { var: 'AI_GATEWAY_NAME', description: 'Cloudflare AI Gateway slug for OpenAI/Anthropic proxy' },
  { var: 'AI_GATEWAY_API_KEY', description: 'Cloudflare AI Gateway auth token' },
];

export default function Settings(): JSX.Element {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Key size={26} className="text-brand-600 dark:text-brand-400" /> API Keys &amp; Configuration
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 max-w-2xl">
          Reference for all configurable environment variables and API keys. Providers without a key are skipped at
          runtime. All keys are set server-side as Cloudflare Workers secrets or environment variables.
        </p>
      </div>

      <section className="mb-10 animate-fade-in-up">
        <h2 className="font-display font-semibold text-base mb-4 inline-flex items-center gap-2">
          <Key size={16} className="text-brand-600 dark:text-brand-400" /> Provider API Keys
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-900/60">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Environment variable</th>
                <th className="px-4 py-3">Get it at</th>
                <th className="px-4 py-3">Free tier</th>
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.map((p) => {
                const Icon = p.icon;
                return (
                  <tr key={p.provider} className="border-t border-slate-200/70 dark:border-slate-800/70">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                        <Icon size={14} className="text-slate-500" />
                        {p.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                        {p.envVar}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://${p.source}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                      >
                        {p.source} <ExternalLink size={9} />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono text-slate-500">{p.freeTier}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10 animate-fade-in-up">
        <h2 className="font-display font-semibold text-base mb-4 inline-flex items-center gap-2">
          <Terminal size={16} className="text-brand-600 dark:text-brand-400" /> Additional Bindings &amp; Environment
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] font-mono uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-900/60">
              <tr>
                <th className="px-4 py-3">Binding</th>
                <th className="px-4 py-3">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {ADDITIONAL_ENV.map((e) => (
                <tr key={e.var} className="border-t border-slate-200/70 dark:border-slate-800/70">
                  <td className="px-4 py-3">
                    <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                      {e.var}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-[12px] font-mono text-slate-600 dark:text-slate-400">
                    {e.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="animate-fade-in-up">
        <h2 className="font-display font-semibold text-base mb-4 inline-flex items-center gap-2">
          <Book size={16} className="text-brand-600 dark:text-brand-400" /> Provider source code
        </h2>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
            All 30+ enrichment providers live in{' '}
            <code className="text-slate-700 dark:text-slate-300">api/src/providers/</code>. Each exports a{' '}
            <code className="text-slate-700 dark:text-slate-300">check</code> function that takes the indicator value
            and returns verdict + raw_summary. To add a new provider, create a file in that directory and register it in{' '}
            <code className="text-slate-700 dark:text-slate-300">api/src/providers/index.ts</code>.
          </p>
          <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
            Keys are set via <code className="text-slate-700 dark:text-slate-300">wrangler secret put</code> for Workers
            or <code className="text-slate-700 dark:text-slate-300">.dev.vars</code> for local dev. If a provider's env
            var is unset, the provider is silently skipped during IOC checks.
          </p>
        </div>
      </section>
    </div>
  );
}
