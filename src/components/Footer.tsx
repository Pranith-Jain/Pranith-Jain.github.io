import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Linkedin, Github, Mail } from 'lucide-react';
import { usePageViewCounter, formatViewCount } from '../hooks';
import { PjMark } from './PjMark';
import type { PersonalInfo } from '../core/entities';

interface FooterProps {
  personalInfo: PersonalInfo;
}

/**
 * Three-column footer sitemap:
 *   1. Brand — logo + name + one-line tagline + social icons
 *   2. Site  — portfolio destinations (About / Skills / Experience / Projects)
 *   3. Build — platform destinations (DFIR / Threat Intel / Blog / Briefings)
 * with a slim bottom strip carrying © / view counter / stack credit.
 *
 * Three columns reads as a real sitemap, not a single-row outro, and keeps
 * each surface one click away from any page in the SPA.
 */

const SITE_LINKS: Array<{ label: string; href: string }> = [
  { label: 'About', href: '/about' },
  { label: 'Skills', href: '/skills' },
  { label: 'Experience', href: '/experience' },
  { label: 'Projects', href: '/projects' },
];

const BUILD_LINKS: Array<{ label: string; href: string }> = [
  { label: 'DFIR Toolkit', href: '/dfir' },
  { label: 'Threat Intel', href: '/threatintel' },
  { label: 'Briefings', href: '/threatintel/briefings' },
  { label: 'Most Wanted', href: '/threatintel/most-wanted' },
  { label: 'Live Center', href: '/threatintel/live-center' },
  { label: 'Blog', href: '/blog' },
];

export const Footer = memo(function Footer({ personalInfo }: FooterProps) {
  const currentYear = new Date().getFullYear();
  const { count, isNewSession } = usePageViewCounter();

  return (
    <footer className="mt-24 pb-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" role="contentinfo">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 border-t border-slate-200/60 pt-10 dark:border-white/10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr]">
          {/* Brand column */}
          <div>
            <Link
              to="/"
              className="group inline-flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-xl"
              aria-label={`${personalInfo.name} - Back to home`}
            >
              <span className="h-9 w-9 rounded-xl flex items-center justify-center overflow-hidden transition">
                <PjMark className="h-full w-full" />
              </span>
              <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                {personalInfo.name}
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Threat intel, email defense, and edge-native security tooling. Reference only — verify indicators in your
              own environment.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <a
                href={personalInfo.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn (opens in new tab)"
                className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/10 dark:hover:text-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Linkedin className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href={personalInfo.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub (opens in new tab)"
                className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/10 dark:hover:text-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Github className="h-4 w-4" aria-hidden="true" />
              </a>
              <a
                href={`mailto:${personalInfo.email}`}
                aria-label="Email"
                className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-white/10 dark:hover:text-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Site column */}
          <div>
            <div className="text-eyebrow font-mono uppercase text-slate-400">Site</div>
            <ul className="mt-3 space-y-2">
              {SITE_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="text-sm text-slate-600 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Build column */}
          <div>
            <div className="text-eyebrow font-mono uppercase text-slate-400">Build</div>
            <ul className="mt-3 space-y-2">
              {BUILD_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="text-sm text-slate-600 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom strip — copyright, view counter, stack credit */}
        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-slate-200/60 pt-5 text-mini text-slate-500 dark:border-white/10 dark:text-slate-400 sm:flex-row sm:items-center">
          <span>
            © {currentYear} {personalInfo.name}. All rights reserved.
          </span>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5" aria-live="polite" aria-atomic="true">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{formatViewCount(count)}</span> views
                {isNewSession && <span className="sr-only"> (new session)</span>}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">React + Vite + Tailwind</span>
          </div>
        </div>
      </div>
    </footer>
  );
});
