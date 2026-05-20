import { Linkedin, Github, Mail, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { personalInfo, stats } from '../../data/content';
import { PjMark } from '../PjMark';

export function Hero() {
  return (
    <section className="relative pt-4 lg:pt-6">
      <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left Content */}
        <div className="animate-fade-in-up">
          {/* One live status pill — the rest moved to an editorial meta line
              below (chip-soup is the generic SaaS tell; this reads authored). */}
          <div className="mb-5 flex items-center gap-2.5 text-[11px] font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            Certified Cyber Criminologist
          </div>

          {/* Headline — editorial. Solid display type carries the character;
              the accent clause is a flat brand color, not a gradient-clip
              (the single most overused AI-portfolio move). */}
          <h1 className="font-display text-[2.1rem] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-5xl lg:text-[3.4rem] text-slate-900 dark:text-white">
            Investigating attacks at human scale.{' '}
            <span className="text-brand-600 dark:text-brand-400">Building defenders at AI scale.</span>
          </h1>

          {/* Discipline line — replaces the secondary chips */}
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-500 dark:text-slate-400">
            <span>Threat Intelligence</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span>Email Defense</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span>DFIR &amp; Detection</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-emerald-600 dark:text-emerald-400">AU Ambassador</span>
          </div>

          {/* Description */}
          <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate-700 dark:text-slate-300">
            I&apos;m{' '}
            <span className="font-bold text-slate-900 dark:text-white underline decoration-brand-500/30 underline-offset-4">
              Pranith Jain
            </span>
            , {personalInfo.description}
          </p>

          {/* Status block — minimal editorial typography, no card chrome.
              Three label/value pairs separated by a thin left rule (only
              on sm+) so the columns read as a clean band, not three boxes.
              The Available value carries a single emerald accent on the
              word itself — that's the only color shift, no ping, no fill. */}
          <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3 sm:[&>div+div]:border-l sm:[&>div+div]:border-slate-200/80 sm:[&>div+div]:pl-5 sm:[&>div+div]:dark:border-slate-800">
            <div>
              <dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
                Focus
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                {personalInfo.currentFocus}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
                Learning
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                {personalInfo.currentlyLearning}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
                Available
              </dt>
              <dd className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400 leading-snug">
                {personalInfo.availability}
              </dd>
            </div>
          </dl>

          {/* CTAs — one filled primary, the rest are bordered text-buttons.
              rounded-md (not rounded-2xl pill), no scale-hover, no glow.
              The visual weight comes from the typography + the single
              filled action, not from animation. */}
          <div className="mt-7 flex flex-wrap gap-2.5">
            <a
              href={personalInfo.calendlyUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Book Strategy Call (opens in new tab)"
              className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Book strategy call
            </a>
            <Link
              to="/threatintel"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-brand-500/60 hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" /> Threat intel
            </Link>
            <Link
              to="/dfir"
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-brand-500/60 hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" /> DFIR toolkit
            </Link>
            <Link
              to="/skills"
              className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 transition hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Explore focus areas →
            </Link>
          </div>

          {/* Social Links */}
          <div className="mt-6 flex items-center gap-2">
            <a
              href={personalInfo.linkedInUrl}
              target="_blank"
              rel="noreferrer"
              className="p-3 text-slate-500 transition hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-6 w-6 sm:h-5 sm:w-5" aria-hidden="true" />
            </a>
            <a
              href={personalInfo.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="p-3 text-slate-500 transition hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
              aria-label="GitHub"
            >
              <Github className="h-6 w-6 sm:h-5 sm:w-5" aria-hidden="true" />
            </a>
            <a
              href={`mailto:${personalInfo.email}`}
              className="p-3 text-slate-500 transition hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
              aria-label="Email"
            >
              <Mail className="h-6 w-6 sm:h-5 sm:w-5" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* Right Content — minimal identity card. Thin border, no glass, no
            blurred backdrop blobs, no glow. The brand mark sits centered
            with the name + role + availability marker below it. Reads as a
            calling card, not a marketing module. */}
        <div className="mt-10 lg:mt-0">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-center">
              <span className="h-24 w-24 sm:h-28 sm:w-28 flex items-center justify-center overflow-hidden">
                <PjMark className="h-full w-full" />
              </span>
            </div>

            <div className="text-center">
              <div className="text-lg font-bold text-slate-900 dark:text-white">{personalInfo.name}</div>
              <div className="mt-1 text-sm text-brand-600 dark:text-brand-400">{personalInfo.shortTitle}</div>
            </div>

            <div className="mt-6 border-t border-slate-200/70 dark:border-slate-800 pt-4 text-center text-sm text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Available for{' '}
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {personalInfo.availability}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip — minimal definition list. No glass, no scale-on-hover,
          no decorative circles. Each cell is divided from the next by a
          thin left rule on sm+ so the four facts read as a single band. */}
      <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 sm:[&>div+div]:border-l sm:[&>div+div]:border-slate-200/80 sm:[&>div+div]:pl-5 sm:[&>div+div]:dark:border-slate-800">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
              {stat.label}
            </dt>
            <dd className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{stat.value}</span>
              {stat.suffix && (
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{stat.suffix}</span>
              )}
            </dd>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-500 leading-relaxed">{stat.description}</p>
            {stat.badge && <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">{stat.badge}</div>}
            {stat.progress !== undefined && (
              <div className="mt-2 h-0.5 w-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full bg-emerald-500" style={{ width: `${stat.progress}%` }}></div>
              </div>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}
