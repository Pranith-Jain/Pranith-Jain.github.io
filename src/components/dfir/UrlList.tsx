import { Link } from 'react-router-dom';
import { ExternalLink, Eye, Globe, ShieldAlert } from 'lucide-react';

interface UrlListProps {
  urls: string[];
}

/**
 * Extract the hostname from a URL string. Returns null for malformed
 * URLs (which are still rendered with the IOC-check / preview pivots
 * since those accept the raw URL form).
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function UrlList({ urls }: UrlListProps): JSX.Element | null {
  if (urls.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 className="font-display font-bold text-xl mb-2">URLs Extracted</h2>
        <p className="text-sm font-mono text-slate-500">No URLs found in email body.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <h2 className="font-display font-bold text-xl mb-4">
        URLs Extracted{' '}
        <span className="text-sm font-mono text-slate-600 dark:text-slate-400 font-normal">({urls.length})</span>
      </h2>
      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-3">
        Each row pivots to per-tool analysis. Hover for the pivot label.
      </p>
      <ul className="space-y-2">
        {urls.map((url) => {
          const host = hostOf(url);
          return (
            <li key={url} className="border-b border-slate-200 dark:border-slate-800 pb-2 last:border-0 last:pb-0">
              <div className="flex items-baseline gap-2 mb-1">
                <ExternalLink size={12} className="text-slate-600 dark:text-slate-400 flex-shrink-0" />
                <span className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all flex-1">{url}</span>
              </div>
              <div className="flex flex-wrap gap-2 ml-5">
                <Link
                  to={`/dfir/ioc-check?indicator=${encodeURIComponent(url)}`}
                  className="text-[10px] font-mono inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
                  title="Multi-provider IOC reputation check"
                >
                  <ShieldAlert size={9} /> IOC check
                </Link>
                <Link
                  to={`/dfir/url-preview?url=${encodeURIComponent(url)}`}
                  className="text-[10px] font-mono inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  title="Server-side preview of the page (SSRF-guarded)"
                >
                  <Eye size={9} /> preview
                </Link>
                {host && (
                  <>
                    <Link
                      to={`/dfir/domain?d=${encodeURIComponent(host)}`}
                      className="text-[10px] font-mono inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/5 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10"
                      title="WHOIS, DNS, email-auth records for the host"
                    >
                      <Globe size={9} /> {host}
                    </Link>
                    <Link
                      to={`/dfir/cert-search?domain=${encodeURIComponent(host)}`}
                      className="text-[10px] font-mono inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
                      title="Certificate Transparency log enumeration for the host"
                    >
                      certs
                    </Link>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
