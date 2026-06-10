import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';

interface F {
  terms: string;
  site: string;
  filetype: string;
  intitle: string;
  inurl: string;
  exact: string;
  exclude: string;
}

const PRESETS: Array<{ label: string; patch: Partial<F> }> = [
  { label: 'Exposed docs', patch: { filetype: 'pdf', terms: 'confidential' } },
  { label: 'Index listings', patch: { intitle: 'index of', terms: 'backup' } },
  { label: 'Login panels', patch: { inurl: 'admin', intitle: 'login' } },
  { label: 'Env / secrets', patch: { filetype: 'env', terms: 'DB_PASSWORD' } },
];

export default function DorkBuilder(): JSX.Element {
  const [f, setF] = useState<F>({
    terms: '',
    site: '',
    filetype: '',
    intitle: '',
    inurl: '',
    exact: '',
    exclude: '',
  });
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const query = useMemo(() => {
    const p: string[] = [];
    if (f.terms.trim()) p.push(f.terms.trim());
    if (f.exact.trim()) p.push(`"${f.exact.trim()}"`);
    if (f.site.trim()) p.push(`site:${f.site.trim()}`);
    if (f.filetype.trim()) p.push(`filetype:${f.filetype.trim()}`);
    if (f.intitle.trim()) p.push(`intitle:"${f.intitle.trim()}"`);
    if (f.inurl.trim()) p.push(`inurl:${f.inurl.trim()}`);
    if (f.exclude.trim())
      p.push(
        ...f.exclude
          .trim()
          .split(/\s+/)
          .map((x) => `-${x}`)
      );
    return p.join(' ');
  }, [f]);

  const engines: Array<[string, string]> = [
    ['Google', `https://www.google.com/search?q=${encodeURIComponent(query)}`],
    ['Bing', `https://www.bing.com/search?q=${encodeURIComponent(query)}`],
    ['DuckDuckGo', `https://duckduckgo.com/?q=${encodeURIComponent(query)}`],
    ['Yandex', `https://yandex.com/search/?text=${encodeURIComponent(query)}`],
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir/tools/osint"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> OSINT tools
      </Link>
      <h1 className="font-display font-bold text-2xl flex items-center gap-2">
        <Search size={22} className="text-brand-600 dark:text-brand-400" />
        Google Dork Builder
      </h1>
      <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 mb-6">
        Compose advanced search operators to surface exposed files, panels and sensitive content. Query is built
        locally; you choose which engine to open.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['terms', 'Keywords'],
            ['exact', 'Exact phrase'],
            ['site', 'site: (domain)'],
            ['filetype', 'filetype: (pdf, env, sql…)'],
            ['intitle', 'intitle:'],
            ['inurl', 'inurl:'],
            ['exclude', 'exclude (space-separated)'],
          ] as Array<[keyof F, string]>
        ).map(([k, ph]) => (
          <input
            key={k}
            value={f[k]}
            onChange={set(k)}
            placeholder={ph}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 font-mono text-sm focus:border-brand-500 focus:outline-none"
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-mini font-mono">
        <span className="self-center text-slate-500">presets:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setF({ ...f, ...p.patch })}
            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
        <code className="font-mono text-sm break-all text-slate-900 dark:text-slate-100">{query || '—'}</code>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-meta font-mono">
        {engines.map(([name, url]) => (
          <a
            key={name}
            href={query ? url : undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`px-3 py-1.5 rounded border ${query ? 'border-slate-200 dark:border-slate-800 hover:border-brand-500/40' : 'opacity-40 pointer-events-none border-slate-200 dark:border-slate-800'}`}
          >
            Open in {name}
          </a>
        ))}
        <button
          type="button"
          disabled={!query}
          onClick={() => void navigator.clipboard?.writeText(query)}
          className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 disabled:opacity-40"
        >
          copy query
        </button>
      </div>
    </div>
  );
}
