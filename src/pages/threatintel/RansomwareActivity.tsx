import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { RansomwareActivityPanel } from '../dfir/DarkWeb';
import { LiveFreshnessPill } from '../../components/LiveFreshnessPill';
import { LiveIndicator } from '../../components/LiveIndicator';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ClusterTabs, RANSOMWARE_TABS } from '../../components/threatintel/ClusterTabs';

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
    <DataPageLayout
      backTo="/threatintel"
      icon={<Activity size={28} />}
      title="Live ransomware activity"
      description={
        <>
          <p className="mb-2 max-w-3xl leading-relaxed">
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
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Refreshed hourly from upstream. See also{' '}
            <Link to="/threatintel/negotiations" className="text-brand-600 dark:text-brand-400 hover:underline">
              ransomware negotiations
            </Link>{' '}
            (demand vs. paid + transcripts).
          </p>
        </>
      }
      headerExtra={
        <div className="space-y-4">
          <ClusterTabs tabs={RANSOMWARE_TABS} ariaLabel="Ransomware intel" />
          <div className="flex flex-wrap items-center gap-3">
            <LiveFreshnessPill tone="live" />
            <LiveIndicator label="Live · ransomware telemetry" note="hourly from 6 trackers" size="md" />
          </div>
        </div>
      }
    >
      <RansomwareActivityPanel />
    </DataPageLayout>
  );
}
