import { Link } from 'react-router-dom';
import { ArrowLeft, Activity } from 'lucide-react';
import { RansomwareActivityPanel } from '../dfir/DarkWeb';

/**
 * Live ransomware activity page. Thin wrapper around the
 * `RansomwareActivityPanel` widget that also lives on the unified
 * /threatintel/darkweb view — same data (Ransomlook leak posts), just
 * presented standalone with its own page chrome so the LiveSnapshotPanel
 * "feed" link lands somewhere focused.
 */
export default function RansomwareActivity(): JSX.Element {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Activity size={28} className="text-brand-600 dark:text-brand-400" /> Live ransomware activity
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Recent ransomware leak-site claims aggregated from{' '}
          <a
            href="https://www.ransomlook.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Ransomlook
          </a>{' '}
          (~100 most-recent victim posts, refreshed hourly server-side). Per-victim screenshots when Ransomlook has
          captured one. Reference only — verify before acting.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Source: <span className="text-slate-700 dark:text-slate-300">/api/v1/ransomware-recent</span> · cached 1h
          server-side.
        </p>
      </div>

      <RansomwareActivityPanel />
    </div>
  );
}
