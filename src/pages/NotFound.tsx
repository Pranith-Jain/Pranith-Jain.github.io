import { Link } from 'react-router-dom';
import { Home, Terminal } from 'lucide-react';

export default function NotFound(): JSX.Element {
  return (
    <div className="max-w-2xl mx-auto px-8 py-24 text-center text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          404 · Not Found
        </div>
        <h1 className="text-5xl font-display font-bold mb-4">That page is off-grid.</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-10">
          The URL you followed doesn't match anything on this site. The link may be old, mistyped, or the page has
          moved.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 dark:bg-brand-500 text-white px-5 py-3 text-sm font-mono font-semibold hover:bg-brand-700 dark:hover:bg-brand-400 transition-colors"
          >
            <Home size={14} /> Home
          </Link>
          <Link
            to="/dfir"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-5 py-3 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/40 transition-colors"
          >
            <Terminal size={14} /> DFIR Toolkit
          </Link>
        </div>
      </div>
    </div>
  );
}
