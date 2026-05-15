import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { personalInfo } from '../data/content';
import { usePageViewCounter, formatViewCount } from '../hooks';
import { PjMark } from './PjMark';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { count, isNewSession } = usePageViewCounter();

  return (
    <footer className="mt-32 pb-8" role="contentinfo">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 border-t border-slate-200/60 pt-8 dark:border-white/10 sm:flex-row sm:items-center">
          {/* Logo and Name */}
          <a
            href="#top"
            className="group inline-flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded-lg"
            aria-label={`${personalInfo.name} - Back to top`}
          >
            <span className="h-9 w-9 rounded-xl shadow-glow flex items-center justify-center overflow-hidden transition group-hover:scale-110">
              <PjMark className="h-full w-full" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
              {personalInfo.name}
            </span>
          </a>

          {/* Copyright and Tagline */}
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 order-last sm:order-none">
            © {currentYear} {personalInfo.name}. Threat Intel, Email Security & Cloud Identity.
          </p>

          {/* Page View Counter */}
          <div
            className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400"
            aria-live="polite"
            aria-atomic="true"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
            <span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{formatViewCount(count)}</span> views
              {isNewSession && <span className="sr-only"> (new session)</span>}
            </span>
          </div>
        </div>

        {/* Additional footer links */}
        <div className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-6 text-xs text-slate-500 dark:text-slate-400">
          <a
            href={`mailto:${personalInfo.email}`}
            className="hover:text-slate-600 dark:hover:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded"
          >
            Contact
          </a>
          <a
            href={personalInfo.linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn (opens in new tab)"
            className="hover:text-slate-600 dark:hover:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded"
          >
            LinkedIn
          </a>
          <a
            href={personalInfo.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub (opens in new tab)"
            className="hover:text-slate-600 dark:hover:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded"
          >
            GitHub
          </a>
          <Link
            to="/blog"
            className="hover:text-slate-600 dark:hover:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded"
          >
            Blog
          </Link>
          <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">|</span>
          <span>React + Vite + Tailwind</span>
        </div>
      </div>
    </footer>
  );
}
