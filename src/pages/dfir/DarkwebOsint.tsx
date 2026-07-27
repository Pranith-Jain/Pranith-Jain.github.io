import { useState, useEffect } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Search as SearchIcon, Loader2, ExternalLink, Globe, Eye, Clock, X } from 'lucide-react';

type Tool = 'multi-search' | 'onion-lookup' | 'crawl' | 'scrape-deep' | 'tor-exit' | 'url-preview';

const TOOLS: { id: Tool; label: string; desc: string; placeholder: string }[] = [
  { id: 'url-preview', label: 'URL Preview', desc: 'Preview any .onion site via tor2web gateway iframe', placeholder: '.onion URL to preview, e.g. abc123.onion' },
  { id: 'multi-search', label: 'Multi-Engine Search', desc: 'Query Ahmia, OnionLand, Tor66, DarkWebLink, Torch, DuckDuckGo simultaneously (darkdump)', placeholder: 'e.g. marketplace, leak, forum, carding…' },
  { id: 'crawl', label: 'Crawl & Link Tree', desc: 'BFS crawl from a .onion URL, builds link tree with email harvesting (TorBot)', placeholder: '.onion URL to crawl (BFS link tree)' },
  { id: 'scrape-deep', label: 'Deep Scrape', desc: 'Fetch single .onion page with metadata, email extraction, keyword parsing (darkdump -s)', placeholder: '.onion URL to deep-scrape' },
  { id: 'onion-lookup', label: 'Onion Lookup', desc: 'CIRCL AIL hidden service metadata - status, tags, ports, BTC addresses', placeholder: '.onion address to look up metadata' },
  { id: 'tor-exit', label: 'Tor Exit Check', desc: 'Check if an IP is a known Tor exit node', placeholder: 'IP address to check, e.g. 185.220.101.1' },
];

const CARD = 'surface-card';

function ResultMultiSearch({ data, onPreview }: { data: { query: string; engines_queried: string[]; total_results: number; results: Array<{ engine: string; title: string; url: string; description: string }>; errors: Array<{ engine: string; error: string }> }; onPreview?: (url: string) => void }) {
  const counts = data.results.reduce((a, r) => { a[r.engine] = (a[r.engine] || 0) + 1; return a; }, {} as Record<string, number>);
  return (
    <div className="space-y-3">
      <div className={`${CARD} p-3`}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="text-slate-500 dark:text-slate-400">{data.total_results} result{data.total_results !== 1 ? 's' : ''} for &ldquo;{data.query}&rdquo;</span>
          {Object.entries(counts).map(([e, c]) => (
            <span key={e} className="px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">{e}: {c}</span>
          ))}
          {data.errors.length > 0 && <span className="text-amber-600 dark:text-amber-400">{data.errors.length} engine{data.errors.length !== 1 ? 's' : ''} failed</span>}
        </div>
      </div>
      {data.results.length === 0 ? (
        <div className={`${CARD} p-6 text-center text-sm text-slate-500 dark:text-slate-400`}>No .onion results found across queried engines</div>
      ) : data.results.map((r, i) => (
        <div key={i} className={`${CARD} p-3 hover:border-brand-400 dark:hover:border-brand-600 transition-colors`}>
          <div className="flex items-center justify-between mb-1">
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">
              {r.title || 'Untitled'}<ExternalLink className="h-3 w-3 opacity-60" />
            </a>
            <div className="flex items-center gap-2">
              <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400">{r.engine}</span>
              {/\.onion/i.test(r.url) && onPreview && (
                <button onClick={() => onPreview(r.url)} className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/40 inline-flex items-center gap-1" title="Preview via tor2web gateway">
                  <Eye className="h-3 w-3" /> preview
                </button>
              )}
            </div>
          </div>
          {r.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{r.description}</p>}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate font-mono">{r.url}</p>
        </div>
      ))}
    </div>
  );
}

function ResultCrawl({ data }: { data: { seed_url: string; pages_crawled: number; pages: Array<{ url: string; title: string; status_code: number; body_text: string; links: Array<{ text: string; href: string; is_onion: boolean }>; emails: string[]; depth: number }>; all_emails: string[]; all_onion_refs: string[]; link_tree: Array<{ parent: string; children: Array<{ href: string; text: string }> }> } }) {
  return (
    <div className="space-y-3">
      <div className={`${CARD} p-3`}>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <span className="text-emerald-700 dark:text-emerald-300 font-semibold">{data.pages_crawled} page{data.pages_crawled !== 1 ? 's' : ''} crawled</span>
          <span className="text-slate-500 dark:text-slate-400">seed: {data.seed_url}</span>
          {data.all_emails.length > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">{data.all_emails.length} email{data.all_emails.length !== 1 ? 's' : ''}</span>}
          {data.all_onion_refs.length > 0 && <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">{data.all_onion_refs.length} onion ref{data.all_onion_refs.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>
      {data.all_emails.length > 0 && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Harvested Emails ({data.all_emails.length})</h4>
          <div className="flex flex-wrap gap-1">{data.all_emails.map((e) => <span key={e} className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">{e}</span>)}</div>
        </div>
      )}
      {data.link_tree.length > 0 && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Link Tree ({data.link_tree.length} parent{data.link_tree.length !== 1 ? 's' : ''})</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {data.link_tree.map((node, i) => (
              <div key={i} className="text-xs">
                <span className="text-emerald-600 dark:text-emerald-400 font-mono">{node.parent}</span>
                <span className="text-slate-500 dark:text-slate-400 mx-1">&rarr;</span>
                <span className="text-slate-500 dark:text-slate-400">{node.children.length} child{node.children.length !== 1 ? 'ren' : ''}</span>
                {node.children.slice(0, 3).map((ch, j) => <div key={j} className="ml-4 text-slate-500 dark:text-slate-400 truncate">&rarr; {ch.text || ch.href}</div>)}
                {node.children.length > 3 && <div className="ml-4 text-slate-500 dark:text-slate-400">&hellip;and {node.children.length - 3} more</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.pages.map((p, i) => (
        <div key={i} className={`${CARD} p-3`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{p.title || 'Untitled'}</span>
            <div className="flex items-center gap-2">
              <span className="text-micro font-mono text-slate-500 dark:text-slate-400">depth {p.depth}</span>
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${p.status_code >= 200 && p.status_code < 300 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'}`}>{p.status_code || 'ERR'}</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate mb-1">{p.url}</p>
          {p.emails.length > 0 && <div className="flex flex-wrap gap-1 mb-1">{p.emails.map((e) => <span key={e} className="text-micro font-mono text-amber-600 dark:text-amber-400">{e}</span>)}</div>}
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{p.body_text}</p>
        </div>
      ))}
    </div>
  );
}

function ResultScrapeDeep({ data }: { data: { url: string; title: string; status_code: number; fetched_via: string; body_text: string; links: Array<{ text: string; href: string; is_onion: boolean }>; emails: string[]; onion_refs: string[]; metadata: { description: string | null; keywords: string[]; og_title: string | null; og_description: string | null; language: string | null } } }) {
  const host = data.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.onion$/i, '');
  const prefix = host.replace(/\.onion$/i, '');
  const gatewayUrl = data.fetched_via.includes('FAILED') ? `https://${prefix}.tor2web.io/` : null;
  return (
    <div className="space-y-3">
      <div className={`${CARD} p-3`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{data.title || 'Untitled page'}</h3>
          <span className={`text-xs font-mono px-2 py-0.5 rounded ${data.status_code >= 200 && data.status_code < 300 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'}`}>HTTP {data.status_code}</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-1">{data.url}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Fetched via: {data.fetched_via}</p>
        {gatewayUrl && (
          <div className="mt-2 p-2 rounded bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800">
            <p className="text-xs text-brand-700 dark:text-brand-300 mb-1">The Worker cannot reach tor2web gateways. Open directly in your browser:</p>
            <a href={gatewayUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline break-all">{gatewayUrl}</a>
          </div>
        )}
      </div>
      {(data.metadata.description || data.metadata.og_title || data.metadata.keywords.length > 0) && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Metadata</h4>
          {data.metadata.og_title && <p className="text-xs text-slate-600 dark:text-slate-300 mb-1"><span className="text-slate-500 dark:text-slate-400">og:title:</span> {data.metadata.og_title}</p>}
          {data.metadata.description && <p className="text-xs text-slate-600 dark:text-slate-300 mb-1 line-clamp-2"><span className="text-slate-500 dark:text-slate-400">description:</span> {data.metadata.description}</p>}
          {data.metadata.og_description && <p className="text-xs text-slate-600 dark:text-slate-300 mb-1 line-clamp-2"><span className="text-slate-500 dark:text-slate-400">og:desc:</span> {data.metadata.og_description}</p>}
          {data.metadata.keywords.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{data.metadata.keywords.map((kw) => <span key={kw} className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300">{kw}</span>)}</div>}
        </div>
      )}
      {data.emails.length > 0 && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Emails ({data.emails.length})</h4>
          <div className="flex flex-wrap gap-1">{data.emails.map((e) => <span key={e} className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">{e}</span>)}</div>
        </div>
      )}
      {data.body_text && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Page content <span className="font-normal text-slate-500 dark:text-slate-400">(truncated)</span></h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-8 whitespace-pre-wrap">{data.body_text}</p>
        </div>
      )}
      {data.links.length > 0 && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Links <span className="font-normal text-slate-500 dark:text-slate-400">({data.links.length})</span></h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.links.slice(0, 30).map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {l.is_onion && <span className="text-micro font-mono px-1 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400">.onion</span>}
                <span className="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{l.text}</span>
                <span className="text-slate-500 dark:text-slate-400">&rarr;</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono truncate">{l.href}</span>
              </div>
            ))}
            {data.links.length > 30 && <p className="text-xs text-slate-500 dark:text-slate-400">&hellip;and {data.links.length - 30} more links</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultOnionLookup({ data }: { data: { address: string; status: string | null; first_seen: string | null; last_seen: string | null; title: string | null; tags?: string[]; ports?: number[]; bitcoin_addresses?: string[] } }) {
  const tags = data.tags ?? [];
  const ports = data.ports ?? [];
  const btcAddrs = data.bitcoin_addresses ?? [];
  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-mono px-2 py-0.5 rounded ${data.status === 'online' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' : data.status === 'offline' ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800' : 'bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-[rgb(var(--border-400))]'}`}>{data.status ?? 'unknown'}</span>
        <span className="text-sm text-slate-800 dark:text-slate-200 font-mono">{data.address}</span>
      </div>
      {(data.first_seen || data.last_seen) && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          {data.first_seen && <div><span className="text-slate-500 dark:text-slate-400">First seen</span><p className="text-slate-700 dark:text-slate-300 mt-0.5 font-mono">{data.first_seen}</p></div>}
          {data.last_seen && <div><span className="text-slate-500 dark:text-slate-400">Last seen</span><p className="text-slate-700 dark:text-slate-300 mt-0.5 font-mono">{data.last_seen}</p></div>}
        </div>
      )}
      {data.title && <div><span className="text-xs text-slate-500 dark:text-slate-400">Title</span><p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5">{data.title}</p></div>}
      {tags.length > 0 && (
        <div><span className="text-xs text-slate-500 dark:text-slate-400">Tags</span>
          <div className="flex flex-wrap gap-1 mt-1">{tags.map((t, i) => <span key={i} className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300">{t}</span>)}</div>
        </div>
      )}
      {ports.length > 0 && (
        <div><span className="text-xs text-slate-500 dark:text-slate-400">Open ports</span>
          <div className="flex flex-wrap gap-1 mt-1">{ports.map((p) => <span key={p} className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300">{p}</span>)}</div>
        </div>
      )}
      {btcAddrs.length > 0 && (
        <div><span className="text-xs text-slate-500 dark:text-slate-400">BTC addresses</span>
          {btcAddrs.map((a) => <p key={a} className="text-xs text-amber-700 dark:text-amber-400 font-mono mt-0.5">{a}</p>)}
        </div>
      )}
      {tags.length === 0 && ports.length === 0 && btcAddrs.length === 0 && !data.first_seen && !data.last_seen && !data.title && (
        <p className="text-xs text-slate-500 dark:text-slate-400">No metadata available for this address.</p>
      )}
    </div>
  );
}

function ResultTorExit({ data }: { data: { isTorExit: boolean; ip: string } }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-3">
        <span className={`text-sm font-mono px-3 py-1 rounded-xl ${data.isTorExit ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'}`}>
          {data.isTorExit ? 'TOR EXIT NODE' : 'NOT A TOR EXIT NODE'}
        </span>
        <span className="text-sm text-slate-700 dark:text-slate-300 font-mono">{data.ip}</span>
      </div>
    </div>
  );
}

export default function DarkwebOsint() {
  const [tool, setTool] = useState<Tool>('multi-search');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [results, setResults] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/v1/darkweb-osint/history')
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {});
  }, []);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const q = query.trim();
      let url: string;
      switch (tool) {
        case 'url-preview': {
          // Build tor2web URL directly - browser can reach gateways
          const host = q.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.onion$/i, '');
          const prefix = host.replace(/\.onion$/i, '');
          setPreviewUrl(`https://${prefix}.tor2web.io/`);
          setPreviewTitle(q);
          setLoading(false);
          return;
        }
        case 'multi-search': url = `/api/v1/darkweb-osint/search?q=${encodeURIComponent(q)}&limit=30`; break;
        case 'onion-lookup': url = `/api/v1/darkweb-osint/onion-lookup?address=${encodeURIComponent(q)}`; break;
        case 'crawl': url = `/api/v1/darkweb-osint/crawl?url=${encodeURIComponent(q)}&depth=2&pages=10`; break;
        case 'scrape-deep': url = `/api/v1/darkweb-osint/scrape?url=${encodeURIComponent(q)}`; break;
        case 'tor-exit': url = `/api/v1/darkweb-osint/tor-exit?ip=${encodeURIComponent(q)}`; break;
        default: return;
      }
      const res = await fetch(url);
      if (!res.ok) { setError(`Request failed: HTTP ${res.status}`); return; }
      setResults(await res.json());
      // refresh history
      fetch('/api/v1/darkweb-osint/history').then((r) => r.json()).then((d) => setHistory(d.history ?? [])).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = (onionUrl: string) => {
    // Build tor2web URL directly - your browser can reach gateways, the Worker can't
    const host = onionUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.onion$/i, '');
    const prefix = host.replace(/\.onion$/i, '');
    setPreviewUrl(`https://${prefix}.tor2web.io/`);
    setPreviewTitle(onionUrl);
  };

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR Toolkit"
      icon={<Globe size={20} />}
      title="Dark Web OSINT"
      description="Native TorBot + darkdump equivalents - multi-engine .onion search, depth-limited BFS crawl, deep scraping with email/metadata harvest, onion service lookup, Tor exit node verification."
    >
      {/* Tool selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TOOLS.map((t) => (
          <button key={t.id} onClick={() => { setTool(t.id); setResults(null); setError(null); }}
            className={`text-xs font-mono px-3 py-1.5 rounded-xl border transition-colors ${tool === t.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'}`}
            title={t.desc}
          >{t.label}</button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-4">
        <input type="text" placeholder={TOOLS.find((t) => t.id === tool)?.placeholder}
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
          className="flex-1 px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
        />
        <button onClick={run} disabled={loading || !query.trim()}
          className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >{loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching&hellip;</> : <><SearchIcon className="h-3.5 w-3.5" /> Search</>}</button>
      </div>

      {/* Search History */}
      {history.length > 0 && !results && (
        <div className={`${CARD} p-3 mb-4`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5"><Clock className="h-3 w-3" /> Recent Searches</h4>
          <div className="flex flex-wrap gap-1.5">
            {history.slice(0, 10).map((h, i) => (
              <button key={i} onClick={() => { setQuery(h.query); setTool('multi-search'); }}
                className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
              >{h.query} <span className="text-slate-500 dark:text-slate-400">({h.resultCount})</span></button>
            ))}
          </div>
        </div>
      )}

      {/* Preview Iframe */}
      {previewUrl && (tool === 'url-preview' || results) && (
        <div className={`${CARD} mb-4 overflow-hidden`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">Preview: {previewTitle}</span>
            <button onClick={() => { setPreviewUrl(null); setPreviewTitle(''); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
          </div>
          <iframe src={previewUrl} title="Onion preview" className="w-full h-96 bg-white dark:bg-slate-900" sandbox="allow-scripts allow-same-origin" />
          <div className="px-3 py-1.5 text-micro text-slate-500 dark:text-slate-400 font-mono border-t border-slate-200 dark:border-slate-700">
            Routed through tor2web gateway &mdash; not anonymous
          </div>
        </div>
      )}

      {/* Results */}
      {error && <div className={`${CARD} p-4 border-rose-300 dark:border-rose-800 mb-4`}><p className="text-sm text-rose-600 dark:text-rose-400">{error}</p></div>}

      {!loading && !results && !error && (
        <div className={`${CARD} p-6 text-sm text-slate-500 dark:text-slate-400 space-y-3`}>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
            <strong>Search limitation:</strong> Dark web search engines block cloud/datacenter IPs. Multi-engine search returns 0 results from Workers. Use <strong>Scrape</strong> or <strong>Crawl</strong> with a known .onion URL, or run locally with Tor for full search.
          </div>
          <p><strong>Multi-Engine Search</strong> &mdash; query Ahmia, OnionLand, Tor66, DarkWebLink, Torch, DuckDuckGo (requires residential IP or local Tor).</p>
          <p><strong>Crawl &amp; Link Tree</strong> &mdash; BFS crawl from a .onion URL with email harvesting (works via tor2web gateways).</p>
          <p><strong>Deep Scrape</strong> &mdash; fetch a single .onion page with metadata, emails, keywords (works via tor2web gateways).</p>
          <p><strong>Onion Lookup</strong> &mdash; CIRCL AIL metadata for hidden services (status, tags, ports, BTC).</p>
          <p><strong>Tor Exit Check</strong> &mdash; verify if an IP is a known Tor exit node.</p>
        </div>
      )}

      {results && tool === 'multi-search' && <ResultMultiSearch data={results} onPreview={handlePreview} />}
      {results && tool === 'crawl' && <ResultCrawl data={results} />}
      {results && tool === 'scrape-deep' && <ResultScrapeDeep data={results} />}
      {results && tool === 'onion-lookup' && <ResultOnionLookup data={results} />}
      {results && tool === 'tor-exit' && <ResultTorExit data={results} />}
    </DataPageLayout>
  );
}
