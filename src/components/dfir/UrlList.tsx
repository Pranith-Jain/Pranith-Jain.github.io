import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

interface UrlListProps {
  urls: string[];
}

export function UrlList({ urls }: UrlListProps): JSX.Element | null {
  if (urls.length === 0) {
    return (
      <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
        <h2 className="font-display font-bold text-xl mb-2">URLs Extracted</h2>
        <p className="text-sm font-mono text-[#71717a]">No URLs found in email body.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
      <h2 className="font-display font-bold text-xl mb-4">
        URLs Extracted <span className="text-sm font-mono text-[#a1a1aa] font-normal">({urls.length})</span>
      </h2>
      <ul className="space-y-2">
        {urls.map((url) => (
          <li key={url} className="flex items-center gap-2">
            <ExternalLink size={12} className="text-[#a1a1aa] flex-shrink-0" />
            <Link
              to={`/dfir/ioc-check?indicator=${encodeURIComponent(url)}`}
              className="font-mono text-xs text-[#00fff9] hover:underline break-all"
            >
              {url}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
