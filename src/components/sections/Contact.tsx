import { Mail, Calendar, Linkedin, Github, FileText } from 'lucide-react';
import type { PersonalInfo } from '../../core/entities';
import { CopyToClipboard } from '../../components/CopyToClipboard';

interface ContactProps {
  personalInfo: PersonalInfo;
}

export function Contact({ personalInfo }: ContactProps) {
  return (
    <section id="contact" className="scroll-mt-24" aria-labelledby="contact-heading">
      {/* CTA panel — light surface, brand-text accent on the heading.
          The previous dark-on-dark panel was heavy and read as a code
          block. Geist treats CTAs as a final surface, not a separate
          "hero island" — so we use the same `bg-white` + gray-alpha
          border as the cards above, then highlight the eyebrow with
          the brand text accent to give it presence. */}
      <div className="relative overflow-hidden rounded-lg border border-black/10 bg-white px-5 py-10 dark:border-white/10 dark:bg-[rgb(var(--surface-200))] sm:px-10 sm:py-14 lg:py-16">
        {/* Single faint radial wash at the top gives the panel a touch of
            presence without crossing into the AI-pillow look. */}
        <div
          className="absolute inset-x-0 top-0 h-32 [mask-image:radial-gradient(ellipse_at_top,white,transparent)]"
          aria-hidden="true"
        >
          <div
            className="h-full w-full opacity-60"
            style={{
              backgroundImage: 'radial-gradient(at 50% 0%, rgba(44, 62, 229, 0.08) 0px, transparent 70%)',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-3 text-eyebrow font-mono uppercase text-brand-600 dark:text-brand-400">Get in touch</div>
          <h2
            id="contact-heading"
            className="font-display text-3xl font-semibold tracking-[-1.28px] text-slate-900 dark:text-white sm:text-4xl"
          >
            Investigating an incident, or building detections before one happens?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base sm:text-lg leading-relaxed text-muted">
            I work with security teams on phishing, BEC, and malware cases — and on the detection engineering,
            threat-intel feeds, and email-defense work that prevents the next one. Available for short engagements and
            strategy calls.
          </p>

          {/* CTAs — Geist h-48 (48px) height. Primary in light mode is
              slate-900 fill (one important action per view). In dark
              mode the panel is rgb(18,18,24); a pure white button
              there read as a stark slab with no relationship to the
              secondary, so we step the primary up to surface-300
              (rgb(28,28,36)) with a thin white/10 ring — still the
              single most important action, but visually integrated.
              Secondary uses a translucent gray-alpha border + hover
              wash (the 100→200 step). NOTE: we use dark:bg-[rgb(28,28,36)]
              instead of dark:bg-white because the global CSS override
              (.dark .bg-white → #12121a) would make the button invisible. */}
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <a
              href={personalInfo.calendlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center gap-1.5 rounded-md bg-slate-900 px-5 text-base font-medium text-white transition-colors hover:bg-slate-800 dark:bg-[rgb(28,28,36)] dark:text-white dark:hover:bg-[rgb(38,38,48)] dark:ring-1 dark:ring-white/10 focus-visible:outline-none"
              aria-label="Schedule a 30-minute consultation call"
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Schedule call
            </a>
            <a
              href={`mailto:${personalInfo.email}`}
              className="inline-flex h-12 items-center gap-1.5 rounded-md border border-black/15 bg-white px-5 text-base font-medium text-slate-900 transition-colors hover:bg-black/5 hover:border-black/25 dark:bg-transparent dark:text-slate-100 dark:border-white/20 dark:hover:bg-white/5 dark:hover:border-white/30 focus-visible:outline-none"
              aria-label={`Send email to ${personalInfo.email}`}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Email me
            </a>
          </div>

          {/* Email Copy Feature */}
          <div className="mt-6 flex justify-center">
            <CopyToClipboard text={personalInfo.email} label="Copy email address" />
          </div>

          {/* Social Links — compact mono row on a light divider, no
              per-link bg chips. Panel is now light, so the row uses
              slate-500 default and slate-900 hover. */}
          <ul
            className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-black/10 pt-6 font-mono text-mini uppercase tracking-[0.1em] text-slate-500 dark:border-white/10 dark:text-slate-400"
            aria-label="Social media and professional links"
          >
            <li>
              <a
                href={personalInfo.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-1 transition hover:text-slate-900 dark:hover:text-white focus-visible:outline-none rounded"
                aria-label="LinkedIn profile (opens in new tab)"
              >
                <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
                LinkedIn
              </a>
            </li>
            <li>
              <a
                href={personalInfo.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-1 transition hover:text-slate-900 dark:hover:text-white focus-visible:outline-none rounded"
                aria-label="GitHub profile (opens in new tab)"
              >
                <Github className="h-3.5 w-3.5" aria-hidden="true" />
                GitHub
              </a>
            </li>
            <li>
              <a
                href={personalInfo.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-1 transition hover:text-slate-900 dark:hover:text-white focus-visible:outline-none rounded"
                aria-label="Resume (opens in new tab)"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Resume
              </a>
            </li>
            <li>
              <a
                href={personalInfo.featuredUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-1 transition hover:text-slate-900 dark:hover:text-white focus-visible:outline-none rounded"
                aria-label="Featured Experts profile (opens in new tab)"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                Featured
              </a>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
