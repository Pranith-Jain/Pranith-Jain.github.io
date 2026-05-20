import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, Globe, Loader2 } from 'lucide-react';

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query';

async function resolveWithLimit(domain: string): Promise<{ a: string[]; mx: boolean; ns: boolean }> {
  try {
    const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=A`;
    const r = await fetch(url, { headers: { accept: 'application/dns-json' } });
    if (!r.ok) return { a: [], mx: false, ns: false };
    const j = (await r.json()) as { Answer?: Array<{ data: string }>; Status?: number };
    if (j.Status === 3) return { a: [], mx: false, ns: false };
    const ips = (j.Answer ?? []).map((a) => a.data).filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
    return { a: ips.slice(0, 3), mx: false, ns: false };
  } catch {
    return { a: [], mx: false, ns: false };
  }
}

async function batchResolve(domains: string[], batchSize = 6): Promise<Array<{ domain: string; ips: string[] }>> {
  const results: Array<{ domain: string; ips: string[] }> = [];
  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (d) => {
        const { a } = await resolveWithLimit(d);
        return { domain: d, ips: a };
      })
    );
    results.push(...batchResults);
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < domains.length) await new Promise((r) => setTimeout(r, 200));
  }
  return results;
}

const TLD_SWAPS = ['.com', '.net', '.org', '.co', '.io', '.ai', '.app', '.dev', '.xyz', '.top', '.club', '.online'];
const AFFIXES = [
  '-login',
  '-secure',
  '-verify',
  '-auth',
  '-support',
  '-help',
  '-account',
  '-admin',
  'mail.',
  'vpn.',
  'secure.',
  'login.',
  'account.',
  'support.',
  'verify.',
  'auth.',
];

function typosquats(domain: string): string[] {
  const out = new Set<string>();
  const [name, tld] = domain.includes('.')
    ? [domain.slice(0, domain.lastIndexOf('.')), domain.slice(domain.lastIndexOf('.'))]
    : [domain, ''];
  if (!name) return [];
  const n = name.toLowerCase();
  for (let i = 0; i < n.length; i++) out.add(n.slice(0, i) + n.slice(i + 1) + tld);
  for (let i = 0; i < n.length; i++) out.add(n.slice(0, i) + n[i] + n[i] + n.slice(i + 1) + tld);
  for (let i = 0; i < n.length - 1; i++) {
    const arr = [...n];
    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    out.add(arr.join('') + tld);
  }
  for (const [from, to] of [
    ['e', 'a'],
    ['a', 'e'],
    ['i', 'e'],
    ['e', 'i'],
    ['o', 'u'],
    ['u', 'o'],
    ['c', 'k'],
    ['k', 'c'],
    ['s', 'c'],
    ['c', 's'],
    ['ph', 'f'],
    ['f', 'ph'],
  ] as [string, string][]) {
    if (n.includes(from)) out.add(n.replace(from, to) + tld);
  }
  return [...out].filter((s) => s !== domain).slice(0, 30);
}

export default function DomainMonitor(): JSX.Element {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<
    Array<{ domain: string; type: 'typo' | 'homoglyph' | 'affix' | 'tld-swap'; ips: string[] }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const cleanDomain = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  const scan = useCallback(async () => {
    if (!cleanDomain) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const candidates = typosquats(cleanDomain);
      const homoglyph = cleanDomain
        .replace(/[a]/g, 'а')
        .replace(/[e]/g, 'е')
        .replace(/[o]/g, 'о')
        .replace(/[p]/g, 'р')
        .replace(/[c]/g, 'с');
      let allDomains = [
        ...candidates,
        ...TLD_SWAPS.filter((t) => t !== '.' + cleanDomain.split('.').pop()).map((t) => name(cleanDomain) + t),
        ...AFFIXES.map((a) => (a.startsWith('-') ? name(cleanDomain) + a + ext(cleanDomain) : a + cleanDomain)),
      ];
      if (homoglyph !== cleanDomain) allDomains.push(homoglyph + ext(cleanDomain));
      allDomains = [...new Set(allDomains)].slice(0, 60);
      if (signal.aborted) return;

      setProgress(`Resolving DNS for ${allDomains.length} variants (batches of 6)…`);
      const resolved = await batchResolve(allDomains);
      if (signal.aborted) return;

      const squatResults = resolved.map((r) => {
        const type = TLD_SWAPS.some((t) => r.domain.endsWith(t) && t !== '.' + ext(cleanDomain))
          ? ('tld-swap' as const)
          : AFFIXES.some((a) => r.domain.startsWith(a) || r.domain.includes(a))
            ? ('affix' as const)
            : homoglyph !== cleanDomain && r.domain.includes(homoglyph)
              ? ('homoglyph' as const)
              : ('typo' as const);
        return { domain: r.domain, type, ips: r.ips };
      });

      setResults(squatResults);
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : 'scan failed');
    } finally {
      if (!signal.aborted) setLoading(false);
      setProgress('');
    }
  }, [cleanDomain]);

  useEffect(() => {
    if (cleanDomain) void scan();
    return () => abortRef.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const g: Record<string, typeof results> = {};
    for (const r of results) {
      (g[r.type] ??= []).push(r);
    }
    return g;
  }, [results]);

  const resolveCount = useMemo(() => results.filter((r) => r.ips.length > 0).length, [results]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> Domain Monitor
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Typosquatting and domain impersonation scanner. Generates lookalike variants of your domain — character swaps,
          TLD swaps, homoglyphs, common prefix/suffix abuses — then resolves DNS in batches to identify registered
          lookalikes. Inspired by haveibeensquatted.com.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void scan();
        }}
        className="mb-6"
      >
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="acmecorp.com"
              className="w-full pl-9 pr-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Domain to scan"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !cleanDomain}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin inline" />
            ) : (
              <Search size={16} className="inline mr-1" />
            )}{' '}
            Scan
          </button>
        </div>
      </form>

      {loading && <p className="text-xs font-mono text-slate-500 animate-pulse mb-4">{progress}</p>}
      {error && (
        <p role="alert" className="text-xs font-mono text-rose-600 dark:text-rose-400 mb-4">
          {error}
        </p>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h2 className="font-display font-bold text-lg">{cleanDomain}</h2>
              <span className="text-xs font-mono text-slate-500">{results.length} variants</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-mono">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                {resolveCount} resolve DNS
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30">
                {results.length - resolveCount} no DNS
              </span>
              {resolveCount === 0 && (
                <span className="text-xs font-mono text-slate-500 ml-2">
                  None of the generated lookalike domains appear to be registered. This is common for less common brand
                  names.
                </span>
              )}
            </div>
          </section>

          {(['typo', 'tld-swap', 'affix', 'homoglyph'] as const).map((type) => {
            const items = grouped[type];
            if (!items?.length) return null;
            const resolveInGroup = items.filter((r) => r.ips.length > 0);
            return (
              <section
                key={type}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
              >
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                  {type === 'typo'
                    ? 'Typo variants'
                    : type === 'tld-swap'
                      ? 'TLD swaps'
                      : type === 'affix'
                        ? 'Prefix/suffix additions'
                        : 'Homoglyph'}
                  <span className="ml-2 text-slate-500">({items.length})</span>
                  {resolveInGroup.length > 0 && (
                    <span className="ml-2 text-[10px] font-mono text-sky-600 dark:text-sky-400">
                      {resolveInGroup.length} resolve
                    </span>
                  )}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((r) => (
                    <div
                      key={r.domain}
                      className={`rounded border p-3 transition-colors hover:border-brand-500/40 ${r.ips.length > 0 ? 'border-sky-500/30 bg-sky-50/50 dark:bg-sky-950/20' : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <code className="font-mono text-sm break-all text-slate-900 dark:text-slate-100 font-semibold">
                          {r.domain}
                        </code>
                        {r.ips.length > 0 ? (
                          <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                            DNS
                          </span>
                        ) : (
                          <span className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500 border border-slate-500/30">
                            unregistered
                          </span>
                        )}
                      </div>
                      {r.ips.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {r.ips.slice(0, 2).map((ip) => (
                            <span
                              key={ip}
                              className="text-[10px] font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded"
                            >
                              {ip}
                            </span>
                          ))}
                          {r.ips.length > 2 && (
                            <span className="text-[10px] font-mono text-slate-500">+{r.ips.length - 2}</span>
                          )}
                        </div>
                      )}
                      <div className="mt-1.5 flex gap-1.5 flex-wrap">
                        <Link
                          to={`/dfir/domain?domain=${encodeURIComponent(r.domain)}`}
                          className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          lookup
                        </Link>
                        <Link
                          to={`/dfir/url-preview?url=${encodeURIComponent('https://' + r.domain)}`}
                          className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          preview
                        </Link>
                        <Link
                          to={`/dfir/ioc-check?indicator=${encodeURIComponent(r.domain)}`}
                          className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          ioc
                        </Link>
                        <Link
                          to={`/dfir/domain-rep?domain=${encodeURIComponent(r.domain)}`}
                          className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          bl
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function name(d: string): string {
  return d.includes('.') ? d.slice(0, d.lastIndexOf('.')) : d;
}
function ext(d: string): string {
  return d.includes('.') ? d.slice(d.lastIndexOf('.')) : '';
}
