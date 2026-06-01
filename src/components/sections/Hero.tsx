import { Link } from 'react-router-dom';
import type { PersonalInfo } from '../../core/entities';
import { HeroLiveSparkline } from '../HeroLiveSparkline';

interface HeroProps {
  personalInfo: PersonalInfo;
}

export function Hero({ personalInfo }: HeroProps) {
  return (
    <section className="relative pt-4 lg:pt-6">
      <div className="animate-fade-in-up max-w-3xl">
        <div className="mb-5 flex items-center gap-2.5 text-eyebrow font-mono uppercase text-brand-600 dark:text-brand-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
          </span>
          Certified Cyber Criminologist
        </div>

        <h1 className="font-display text-[2.1rem] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-5xl lg:text-[3.4rem] text-slate-900 dark:text-white">
          Investigating attacks at human scale.{' '}
          <span className="text-brand-600 dark:text-brand-400">Building defenders at AI scale.</span>
        </h1>

        <HeroLiveSparkline />

        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-500 dark:text-slate-400">
          <span>Threat Intelligence</span>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <span>Email Defense</span>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <span>DFIR &amp; Detection</span>
          <span className="text-slate-300 dark:text-slate-700">/</span>
          <span className="text-emerald-600 dark:text-emerald-400">AU Ambassador</span>
        </div>

        <p className="mt-6 max-w-2xl text-xl leading-relaxed text-slate-700 dark:text-slate-300">
          I&apos;m{' '}
          <span className="font-bold text-slate-900 dark:text-white underline decoration-brand-500/30 underline-offset-4">
            {personalInfo.name}
          </span>
          . Security analyst by day — phishing, BEC, and malware response across 150+ brands. The rest of the time I
          build CTI and DFIR tooling on the side: a{' '}
          <Link
            to="/dfir"
            className="font-semibold text-brand-700 dark:text-brand-400 underline-offset-4 hover:underline"
          >
            DFIR toolkit
          </Link>{' '}
          and a{' '}
          <Link
            to="/threatintel"
            className="font-semibold text-brand-700 dark:text-brand-400 underline-offset-4 hover:underline"
          >
            threat-intel aggregator
          </Link>{' '}
          on Cloudflare Workers, free to use, no login. Currently digging into AI security, NHI governance, and
          detection engineering.
        </p>

        <div className="mt-7 flex flex-wrap gap-2.5">
          <a
            href={personalInfo.calendlyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-5 py-3.5 sm:py-3 text-base font-semibold text-white transition hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Book strategy call
          </a>
          <Link
            to="/threatintel"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 px-5 py-3.5 sm:py-3 text-base font-semibold text-slate-700 dark:text-slate-200 transition hover:border-brand-500/60 hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            Threat intel
          </Link>
        </div>
      </div>
    </section>
  );
}
