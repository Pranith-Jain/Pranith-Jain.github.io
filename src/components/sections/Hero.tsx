import { Linkedin, Github, Mail, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { personalInfo, stats } from '../../data/content';
import { FiledTag } from '../editorial';

/**
 * Hero — editorial subject brief. Single-column type stack:
 *   eyebrow → "open for work" pill → display headline → lede →
 *   focus / learning bullets → one primary CTA → socials.
 *
 * The right-side anime-cyber illustration plate is a follow-up — when
 * /public/portrait.png (or .svg) exists, it slots into a 5/12 right
 * column at lg+. For now Phase 2 ships type-only.
 */
export function Hero() {
  return (
    <section className="relative pt-10 pb-24 sm:pt-16">
      <FiledTag number="01" subject="Welcome — Subject Profile" />

      {/* Live status — one small pill, semantic green (open / available) */}
      <div className="mb-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        Open for consultations &amp; strategy calls
      </div>

      {/* Display headline — upright Newsreader, clamped for mobile */}
      <h1
        className="max-w-[18ch] font-serif font-medium leading-[1.05] tracking-[-0.01em] text-ink-1"
        style={{ fontSize: 'clamp(2.25rem, 6vw, 3.5rem)' }}
      >
        Investigating attacks at human scale. Building defenders at AI scale.
      </h1>

      <p className="mt-8 max-w-[60ch] text-lg leading-[1.55] text-ink-2">
        I&rsquo;m <span className="text-ink-1">{personalInfo.name}</span>, {personalInfo.description}
      </p>

      {/* Focus / learning — mono labels, ink hierarchy */}
      <dl className="mt-8 space-y-2 text-sm">
        <div className="flex items-baseline gap-3">
          <dt className="min-w-[5.5rem] font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">Focus</dt>
          <dd className="text-ink-1">{personalInfo.currentFocus}</dd>
        </div>
        <div className="flex items-baseline gap-3">
          <dt className="min-w-[5.5rem] font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">Learning</dt>
          <dd className="text-ink-1">{personalInfo.currentlyLearning}</dd>
        </div>
      </dl>

      {/* CTAs — one primary, two secondary text-links */}
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        <a
          href={personalInfo.calendlyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 bg-accent px-5 py-3 text-sm font-medium text-white transition-colors duration-enter hover:bg-brand-700"
        >
          Book a call <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <Link
          to="/threatintel"
          className="inline-flex items-center gap-1 font-mono text-[13px] text-ink-2 underline decoration-rule decoration-2 underline-offset-[6px] transition-colors duration-enter hover:text-accent hover:decoration-accent"
        >
          /threatintel <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
        <Link
          to="/dfir"
          className="inline-flex items-center gap-1 font-mono text-[13px] text-ink-2 underline decoration-rule decoration-2 underline-offset-[6px] transition-colors duration-enter hover:text-accent hover:decoration-accent"
        >
          /dfir <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Socials */}
      <div className="mt-10 flex items-center gap-6">
        <a
          href={personalInfo.linkedInUrl}
          target="_blank"
          rel="noreferrer"
          className="text-ink-3 transition-colors duration-enter hover:text-accent"
          aria-label="LinkedIn"
        >
          <Linkedin className="h-5 w-5" aria-hidden="true" />
        </a>
        <a
          href={personalInfo.githubUrl}
          target="_blank"
          rel="noreferrer"
          className="text-ink-3 transition-colors duration-enter hover:text-accent"
          aria-label="GitHub"
        >
          <Github className="h-5 w-5" aria-hidden="true" />
        </a>
        <a
          href={`mailto:${personalInfo.email}`}
          className="text-ink-3 transition-colors duration-enter hover:text-accent"
          aria-label="Email"
        >
          <Mail className="h-5 w-5" aria-hidden="true" />
        </a>
      </div>

      {/* Stats — hairline-bordered cards, four across at lg */}
      <div className="mt-20 grid grid-cols-2 gap-4 border-t border-rule pt-10 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{stat.label}</dt>
            <dd className="mt-2 flex items-baseline gap-1.5">
              <span className="font-serif text-3xl font-medium tracking-tight text-ink-1 sm:text-4xl">
                {stat.value}
              </span>
              {stat.suffix && <span className="font-mono text-xs text-ink-3">{stat.suffix}</span>}
            </dd>
            <p className="mt-2 text-sm leading-snug text-ink-2">{stat.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
