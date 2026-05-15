import { Link } from 'react-router-dom';
import { ShieldCheck, Mail, Github, Linkedin } from 'lucide-react';
import { personalInfo } from '../data/content';

/**
 * Shared product footer for the /dfir and /threatintel surfaces. One
 * source of truth so hero/footer stay consistent across landings,
 * category pages and About pages. (No "Privacy" link — removed by
 * request.)
 */
export function AppFooter({ blurb, aboutTo }: { blurb: string; aboutTo?: string }): JSX.Element {
  return (
    <footer className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="font-mono text-[12px] text-slate-500 max-w-xl inline-flex items-start gap-2">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
          <span>{blurb}</span>
        </div>
        <div className="flex flex-wrap gap-4 text-[12px] font-mono">
          {aboutTo && (
            <Link
              to={aboutTo}
              className="text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
            >
              About
            </Link>
          )}
          <a
            href={`mailto:${personalInfo.email}`}
            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <Mail size={12} /> Contact
          </a>
          <a
            href={personalInfo.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <Github size={12} /> GitHub
          </a>
          <a
            href={personalInfo.linkedInUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <Linkedin size={12} /> LinkedIn
          </a>
        </div>
      </div>
      <div className="font-mono text-[11px] text-slate-400 mt-4">
        © {new Date().getFullYear()} {personalInfo.name}. Privacy-first — runs in your browser, nothing uploaded.
      </div>
    </footer>
  );
}
