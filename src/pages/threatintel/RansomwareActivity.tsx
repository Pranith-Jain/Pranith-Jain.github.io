import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Activity } from 'lucide-react';
import { RansomwareActivityPanel } from '../dfir/DarkWeb';

/**
 * Live ransomware activity page. Thin wrapper around the
 * `RansomwareActivityPanel` widget that also lives on the unified
 * /threatintel/darkweb view. Backend merges victim claims across
 * multiple trackers (Ransomlook, mythreatintel, ransomfeed.it,
 * ransomwatch, ransomware.live, Andrea Fortuna); the panel dedupes by
 * (group + victim + day) and surfaces ~60 most recent rows.
 */
export default function RansomwareActivity(): JSX.Element {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Activity size={28} className="text-brand-600 dark:text-brand-400" /> Live ransomware activity
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Recent ransomware leak-site claims merged across multiple trackers —{' '}
          <a
            href="https://www.ransomlook.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Ransomlook
          </a>
          ,{' '}
          <a
            href="https://t.me/mythreatintel"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            mythreatintel
          </a>
          ,{' '}
          <a
            href="https://www.ransomfeed.it/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ransomfeed.it
          </a>
          ,{' '}
          <a
            href="https://github.com/joshhighet/ransomwatch"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ransomwatch
          </a>
          ,{' '}
          <a
            href="https://www.ransomware.live/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            ransomware.live
          </a>
          , and{' '}
          <a
            href="https://ctifeeds.andreafortuna.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Andrea Fortuna
          </a>
          . Deduped by (group + victim + day), newest first. Per-victim screenshots when Ransomlook has captured one;
          the other trackers fill coverage gaps and keep the page populated when any single source is degraded.
          Reference only; verify before acting.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Refreshed hourly from upstream. See also{' '}
          <Link to="/threatintel/negotiations" className="text-brand-600 dark:text-brand-400 hover:underline">
            ransomware negotiations
          </Link>{' '}
          (demand vs. paid + transcripts).
        </p>
      </div>

      <RansomwareActivityPanel />
    </div>
  );
}
