import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { BreachDisclosuresPanel } from '../dfir/DarkWeb';

/**
 * Live breach disclosures page. Thin wrapper around the
 * `BreachDisclosuresPanel` widget that also lives on the unified
 * /threatintel/darkweb view — same data (Have I Been Pwned public breach
 * corpus via /api/v1/breach-disclosures), presented standalone so each
 * surface has its own focused entry point.
 */
export default function BreachDisclosures(): JSX.Element {
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
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> Live breach disclosures
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Disclosed breaches from the{' '}
          <a
            href="https://haveibeenpwned.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Have I Been Pwned
          </a>{' '}
          public corpus, with verification flags, sensitivity markers, and exposed data classes. Reference for
          incident-response triage; verify in your environment before acting.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Source: <span className="text-slate-700 dark:text-slate-300">/api/v1/breach-disclosures</span> · cached
          server-side.
        </p>
      </div>

      <BreachDisclosuresPanel />
    </div>
  );
}
