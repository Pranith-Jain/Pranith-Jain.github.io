import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, ExternalLink, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

interface OgData {
  title?: string;
  description?: string;
  image?: string;
  site_name?: string;
  type?: string;
}

interface TwitterData {
  title?: string;
  description?: string;
  image?: string;
  card?: string;
}

interface UrlPreviewResult {
  url: string;
  final_url: string;
  status: number;
  content_type?: string;
  title?: string;
  description?: string;
  og?: OgData;
  twitter?: TwitterData;
  canonical?: string;
  bytes_read: number;
  redirect_blocked?: { location: string };
}

function hasOgData(og?: OgData): boolean {
  return !!og && Object.values(og).some(Boolean);
}

function hasTwitterData(tw?: TwitterData): boolean {
  return !!tw && Object.values(tw).some(Boolean);
}

function StatusBadge({ status }: { status: number }) {
  const isOk = status >= 200 && status < 300;
  const isRedirect = status >= 300 && status < 400;
  const isError = status >= 400;
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-bold border',
        isOk &&
          'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
        isRedirect &&
          'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
        isError &&
          'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      HTTP {status}
    </span>
  );
}

export default function UrlPreview(): JSX.Element {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UrlPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isValidUrl = (() => {
    try {
      const p = new URL(input.trim());
      return p.protocol === 'http:' || p.protocol === 'https:';
    } catch {
      return false;
    }
  })();

  const canSubmit = isValidUrl && !loading;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/url-preview?url=${encodeURIComponent(input.trim())}`);
      const body = (await r.json()) as UrlPreviewResult & { error?: string };
      if (!r.ok) {
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'preview failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-4xl font-display font-bold mb-2">URL Preview</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Fetch metadata from a URL server-side — title, meta description, Open Graph, and Twitter Card tags. No
          JavaScript execution, no rendering.
        </p>
      </motion.div>

      {/* Security note */}
      <div className="flex gap-3 p-4 mb-8 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 text-sm font-mono text-amber-800 dark:text-amber-300">
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <span className="font-bold">Privacy &amp; Security:</span> URLs resolving to private/loopback IPs are refused.
          Redirects are NOT followed. Body capped at 128KB. Only{' '}
          <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">&lt;head&gt;</code> metadata is parsed — the
          page is not rendered.
        </div>
      </div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="url"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="https://www.cisa.gov/"
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Eye size={16} className="inline mr-2" />
            Preview
          </button>
        </div>
        {input && !isValidUrl && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Enter a valid http:// or https:// URL
          </p>
        )}
      </form>

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Fetching metadata…</p>}
      {error && <p className="font-mono text-rose-600 dark:text-rose-400">error: {error}</p>}

      {result && (
        <div className="space-y-5">
          {/* Header */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <StatusBadge status={result.status} />
              {result.content_type && (
                <span className="font-mono text-xs text-slate-500">{result.content_type.split(';')[0]}</span>
              )}
              <span className="font-mono text-xs text-slate-500">{(result.bytes_read / 1024).toFixed(1)} KB read</span>
            </div>
            <a
              href={result.final_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline font-mono text-sm break-all flex items-center gap-1"
            >
              {result.final_url}
              <ExternalLink size={12} className="flex-shrink-0" />
            </a>
          </section>

          {/* Redirect blocked */}
          {result.redirect_blocked && (
            <section className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 p-6">
              <h3 className="font-display font-semibold text-lg mb-2 text-amber-800 dark:text-amber-300">
                Redirect Blocked
              </h3>
              <p className="text-sm font-mono text-amber-700 dark:text-amber-400">
                The server returned a {result.status} redirect. Following redirects is disabled to prevent SSRF chains.
              </p>
              {result.redirect_blocked.location && (
                <div className="mt-2 text-sm font-mono text-slate-600 dark:text-slate-400">
                  Location:{' '}
                  <span className="text-slate-800 dark:text-slate-200">{result.redirect_blocked.location}</span>
                </div>
              )}
            </section>
          )}

          {/* Page title */}
          {result.title && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-1">Page Title</div>
              <p className="text-slate-900 dark:text-slate-100 font-semibold">{result.title}</p>
            </section>
          )}

          {/* Meta description */}
          {result.description && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-1">Meta Description</div>
              <p className="text-slate-700 dark:text-slate-300 text-sm">{result.description}</p>
            </section>
          )}

          {/* Canonical */}
          {result.canonical && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-1">Canonical URL</div>
              <a
                href={result.canonical}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline font-mono text-sm break-all"
              >
                {result.canonical}
              </a>
            </section>
          )}

          {/* Open Graph */}
          {hasOgData(result.og) && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-4">Open Graph</h3>
              {result.og?.image && (
                <div className="mb-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-2">Image</div>
                  <img
                    src={result.og.image}
                    alt="og:image"
                    className="max-w-full max-h-48 rounded-lg border border-slate-200 dark:border-slate-700 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <p className="mt-1 text-[11px] font-mono text-slate-400">
                    Note: image loaded from the queried site — referer may be visible to that server.
                  </p>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4 font-mono text-sm">
                {result.og?.title && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">og:title</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.og.title}</div>
                  </div>
                )}
                {result.og?.description && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">og:description</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.og.description}</div>
                  </div>
                )}
                {result.og?.site_name && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">og:site_name</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.og.site_name}</div>
                  </div>
                )}
                {result.og?.type && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">og:type</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.og.type}</div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Twitter Card */}
          {hasTwitterData(result.twitter) && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-4">Twitter Card</h3>
              {result.twitter?.image && (
                <div className="mb-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 font-mono mb-2">Image</div>
                  <img
                    src={result.twitter.image}
                    alt="twitter:image"
                    className="max-w-full max-h-48 rounded-lg border border-slate-200 dark:border-slate-700 object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4 font-mono text-sm">
                {result.twitter?.card && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">twitter:card</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.twitter.card}</div>
                  </div>
                )}
                {result.twitter?.title && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">twitter:title</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.twitter.title}</div>
                  </div>
                )}
                {result.twitter?.description && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">twitter:description</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.twitter.description}</div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
