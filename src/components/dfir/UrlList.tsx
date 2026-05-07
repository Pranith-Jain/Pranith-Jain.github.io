import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

interface UrlListProps {
  urls: string[];
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
      <ul className="space-y-2">
        {urls.map((url) => (
          <li key={url} className="flex items-center gap-2">
            <ExternalLink size={12} className="text-slate-600 dark:text-slate-400 flex-shrink-0" />
            <Link
              to={`/dfir/ioc-check?indicator=${encodeURIComponent(url)}`}
              className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline break-all"
            >
              {url}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
