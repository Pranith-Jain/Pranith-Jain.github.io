import { Linkedin, Github, Mail, Terminal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { personalInfo, stats } from '../../data/content';
import { PjMark } from '../PjMark';

export function Hero() {
  return (
    <section className="relative pt-6 lg:pt-10">
      <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left Content */}
        <div className="animate-fade-in-up">
          {/* One live status pill — the rest moved to an editorial meta line
              below (chip-soup is the generic SaaS tell; this reads authored). */}
          <div className="mb-7 flex items-center gap-2.5 text-[11px] font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
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
          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-500 dark:text-slate-400">
            <span>Threat Intelligence</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span>Email Defense</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span>DFIR &amp; Detection</span>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="text-emerald-600 dark:text-emerald-400">AU Ambassador</span>
          </div>

          {/* Description */}
          <p className="mt-8 max-w-2xl text-xl leading-relaxed text-slate-700 dark:text-slate-300">
            I&apos;m{' '}
            <span className="font-bold text-slate-900 dark:text-white underline decoration-brand-500/30 underline-offset-4">
              Pranith Jain
            </span>
            , {personalInfo.description}
          </p>

          {/* Current Focus */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400">
              <span className="flex h-2 w-2 rounded-full bg-brand-500"></span>
              <span>
                Current Focus:{' '}
                <span className="text-slate-900 dark:text-white font-semibold italic">{personalInfo.currentFocus}</span>
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400">
              <span className="flex h-2 w-2 rounded-full bg-cyan-500"></span>
              <span>
                Currently Learning:{' '}
                <span className="text-slate-900 dark:text-white font-semibold italic">
                  {personalInfo.currentlyLearning}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-400">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
              <span>
                Availability:{' '}
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">{personalInfo.availability}</span>
              </span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href={personalInfo.calendlyUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Book Strategy Call (opens in new tab)"
              className="inline-flex items-center justify-center rounded-2xl bg-brand-600 px-8 py-4 text-base font-bold text-white shadow-glow transition hover:bg-brand-500 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              Book Strategy Call
            </a>
            <Link
              to="/threatintel"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-300/60 bg-rose-50/70 px-8 py-4 text-base font-bold text-rose-700 shadow-sm transition hover:shadow-md hover:scale-105 active:scale-95 dark:border-rose-700/60 dark:bg-rose-900/30 dark:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              <Terminal className="h-4 w-4" aria-hidden="true" /> Live Threat Intel
            </Link>
            <Link
              to="/dfir"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-brand-300/60 bg-brand-50/70 px-8 py-4 text-base font-bold text-brand-700 shadow-sm transition hover:shadow-md hover:scale-105 active:scale-95 dark:border-brand-700/60 dark:bg-brand-900/30 dark:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              <Terminal className="h-4 w-4" aria-hidden="true" /> DFIR Toolkit
            </Link>
            <Link
              to="/skills"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200/60 bg-white/70 px-8 py-4 text-base font-bold text-slate-800 shadow-sm transition hover:shadow-md hover:scale-105 active:scale-95 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              Explore Focus Areas
            </Link>
          </div>

          {/* Social Links */}
          <div className="mt-8 flex items-center gap-2">
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

        {/* Right Content - Profile Card */}
        <div className="animate-fade-in-up relative mt-12 lg:mt-0">
          <div className="glass relative z-10 overflow-hidden rounded-[2.5rem] border-white/20 bg-white/40 shadow-2xl backdrop-blur-3xl dark:border-white/10 dark:bg-slate-900/40">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-brand-500/10"></div>

            <div className="relative p-8 sm:p-10">
              {/* PJ Logo */}
              <div className="mb-8 flex items-center justify-center">
                <span className="h-32 w-32 sm:h-36 sm:w-36 rounded-3xl shadow-glow animate-pulse-slow flex items-center justify-center overflow-hidden">
                  <PjMark className="h-full w-full" />
                </span>
              </div>

              <div className="flex items-center gap-5">
                <div className="relative">
                  <span className="h-16 w-16 rounded-2xl shadow-lg flex items-center justify-center overflow-hidden">
                    <PjMark className="h-full w-full" />
                  </span>
                  <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-white bg-emerald-500 dark:border-slate-900"></div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">{personalInfo.name}</div>
                  <div className="text-sm font-medium text-brand-600 dark:text-brand-400">
                    {personalInfo.shortTitle}
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-200/60 pt-6 text-sm text-slate-600 dark:border-white/10 dark:text-slate-400">
                Available for{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {personalInfo.availability}
                </span>{' '}
                — reach me below.
              </div>
            </div>
          </div>

          {/* Decorative Background Elements */}
          <div className="absolute -right-12 -top-12 -z-10 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl"></div>
          <div className="absolute -bottom-8 -left-8 -z-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-2xl"></div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="animate-fade-in-up mt-20 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="group glass relative overflow-hidden rounded-3xl p-8 transition-all hover:shadow-glow hover:-translate-y-1"
          >
            <div className="absolute right-0 top-0 -mr-4 -mt-4 h-24 w-24 rounded-full bg-brand-500/5 transition-transform group-hover:scale-150"></div>
            <div className="relative">
              <div className="text-sm font-bold uppercase tracking-[0.15em] text-slate-600 dark:text-slate-400">
                {stat.label}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">{stat.value}</span>
                {stat.suffix && <span className="text-sm font-bold text-emerald-500">{stat.suffix}</span>}
              </div>
              <p className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
                {stat.description}
              </p>
              {stat.badge && (
                <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{stat.badge}</span>
                </div>
              )}
              {stat.progress !== undefined && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                    style={{ width: `${stat.progress}%` }}
                  ></div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
