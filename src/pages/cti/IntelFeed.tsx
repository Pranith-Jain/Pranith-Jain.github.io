import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, Search, FileText } from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

interface Article {
  title: string;
  url: string;
  source: string;
  published: string;
  summary: string;
  tags: string[];
  severity?: string;
}

const TAG_PILL: Record<string, string> = {
  Ransomware: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  Vuln: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  APT: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  Breach: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Malware: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  Phishing: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  CVE: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

export default function IntelFeed() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/data/threat-intel/index.json');
      if (res.ok) {
        const data = await res.json();
        if (data.cveIndex) {
          const articleData = data.cveIndex.slice(0, 50).map((c: Record<string, unknown>) => ({
            title: `${c.cveId} - ${((c.cvssV3Severity as string) || '').toUpperCase()} vulnerability`,
            url: `https://nvd.nist.gov/vuln/detail/${c.cveId}`,
            source: 'NVD',
            published: (c.publishedAt as string) || '',
            summary: (c.description as string) || '',
            tags: ['CVE', c.inKev ? 'KEV' : '', (c.cvssV3Severity as string) || ''].filter(Boolean),
            severity: c.cvssV3Severity as string,
          }));
          setArticles(articleData);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tags = useMemo(() => {
    const s = new Set<string>();
    articles.forEach((a) => a.tags?.forEach((t) => s.add(t)));
    return ['all', ...Array.from(s).sort()];
  }, [articles]);

  const filtered = useMemo(() => {
    let items = articles;
    if (tagFilter !== 'all') items = items.filter((a) => a.tags?.includes(tagFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary?.toLowerCase().includes(q) ||
          a.source?.toLowerCase().includes(q)
      );
    }
    return items;
  }, [articles, tagFilter, search]);

  return (
    <>
      <PageMeta
        title="Intel Feed"
        description="Curated security news from 28+ sources."
        canonicalPath="/cti/articles"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/cti"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50"
              >
                <ArrowLeft size={16} className="text-slate-600" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center">
                <FileText size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Intel Feed</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {filtered.length.toLocaleString()} articles · 28 sources
                </p>
              </div>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search articles..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.slice(0, 10).map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${tagFilter === t ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {t === 'all' ? 'All' : t}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.slice(0, 50).map((article, i) => (
                <a
                  key={i}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-2 mb-1">
                        {article.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">{article.summary}</p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span className="font-mono">{article.source}</span>
                        {article.published && <span>{new Date(article.published).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-slate-300 shrink-0 mt-1" />
                  </div>
                  {article.tags && article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {article.tags.map((t) => (
                        <span
                          key={t}
                          className={`px-1.5 py-0.5 text-[9px] font-mono rounded ${TAG_PILL[t] || 'bg-slate-100 text-slate-500'}`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
