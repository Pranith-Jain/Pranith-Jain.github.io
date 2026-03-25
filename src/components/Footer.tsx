import { Eye } from 'lucide-react';
import { personalInfo } from '../data/content';
import { usePageViewCounter, formatViewCount } from '../hooks';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { count, isNewSession } = usePageViewCounter();

  return (
    <footer className="mt-32 pb-12" role="contentinfo">
      <div className="flex flex-col items-center justify-between gap-6 border-t border-slate-200/60 pt-12 dark:border-white/10 md:flex-row">
        {/* Logo and Name */}
        <a
          href="#top"
          className="group inline-flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded-lg"
          aria-label={`${personalInfo.name} - Back to top`}
        >
          <span className="h-10 w-10 rounded-xl shadow-glow flex items-center justify-center overflow-hidden transition group-hover:scale-110">
            <svg viewBox="0 0 36 36" className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <linearGradient id="pjGradientFooter" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2c3ee5" />
                  <stop offset="100%" stopColor="#435ef1" />
                </linearGradient>
              </defs>
              <rect width="36" height="36" rx="8" fill="url(#pjGradientFooter)" />
              <text
                x="50%"
                y="50%"
                dominantBaseline="central"
                textAnchor="middle"
                fill="white"
                fontFamily="Poppins, sans-serif"
                fontWeight="800"
                fontSize="16"
              >
                PJ
              </text>
            </svg>
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">{personalInfo.name}</span>
        </a>

        {/* Copyright and Tagline */}
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 text-center md:text-left">
          © {currentYear} {personalInfo.name}. Focused on Threat Intel, Email Security & Cloud Identity.
        </p>

        {/* Page View Counter */}
        <div
          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
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

      {/* Additional footer links for accessibility */}
      <div className="mt-6 flex flex-wrap justify-center gap-6 text-xs text-slate-400 dark:text-slate-500">
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
          className="hover:text-slate-600 dark:hover:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded"
        >
          LinkedIn
        </a>
        <a
          href={personalInfo.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-600 dark:hover:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 rounded"
        >
          GitHub
        </a>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <span>Built with React + Vite + Tailwind</span>
      </div>
    </footer>
  );
}
