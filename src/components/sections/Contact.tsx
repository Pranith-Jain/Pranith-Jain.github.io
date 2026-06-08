import { Mail, Calendar, Linkedin, Github, FileText } from 'lucide-react';
import type { PersonalInfo } from '../../core/entities';
import { CopyToClipboard } from '../../components/CopyToClipboard';

interface ContactProps {
  personalInfo: PersonalInfo;
}

export function Contact({ personalInfo }: ContactProps) {
  return (
    <section id="contact" className="mt-20 scroll-mt-24" aria-labelledby="contact-heading">
      {/* Dark CTA panel — keeps its hero-y character (dark fill stands out
          from the rest of the page) but drops the blurred blobs and
          rounded-[3rem]; uses the same rounded-2xl + thin chrome the rest
          of the design system uses. */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 px-5 py-10 dark:bg-brand-950 sm:px-10 sm:py-14 lg:py-16">
        {/* Subtle dot grid — kept because it gives the dark panel texture
            without ringing the AI-design bell. The blurred radial blobs
            were removed. */}
        <div
          className="absolute inset-0 opacity-15 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]"
          aria-hidden="true"
        >
          <div
            className="h-full w-full"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
        </div>

        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-3 text-eyebrow font-bold uppercase text-brand-300">Get in touch</div>
          <h2 id="contact-heading" className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white">
            Ready to secure your digital presence?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-300 leading-relaxed">
            Whether you need threat intelligence, email security hardening, or cloud identity protection, I&apos;m here
            to help. My work bridges technical controls with business-critical trust signals across 150+ global brands.
          </p>

          {/* CTAs — rounded-md (not rounded-2xl pill), no scale-hover. The
              primary action is the brand-filled one; the secondary uses a
              white border to read clearly against the dark panel. */}
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <a
              href={personalInfo.calendlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-label="Schedule a 30-minute consultation call"
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Schedule call
            </a>
            <a
              href={`mailto:${personalInfo.email}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/30 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-900"
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

          {/* Social Links — compact icon row, no per-link bg chips */}
          <ul
            className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 border-t border-white/10 pt-8"
            aria-label="Social media and professional links"
          >
            <li>
              <a
                href={personalInfo.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 sm:text-sm text-xs font-bold text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-lg px-3 py-3 min-h-[48px]"
                aria-label="Visit LinkedIn profile (opens in new tab)"
              >
                <span className="rounded-md bg-white/5 p-2 transition group-hover:bg-white/10">
                  <Linkedin className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" />
                </span>
                LinkedIn
              </a>
            </li>
            <li>
              <a
                href={personalInfo.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 sm:text-sm text-xs font-bold text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-lg px-3 py-3 min-h-[48px]"
                aria-label="Visit GitHub profile (opens in new tab)"
              >
                <span className="rounded-md bg-white/5 p-2 transition group-hover:bg-white/10">
                  <Github className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" />
                </span>
                GitHub
              </a>
            </li>
            <li>
              <a
                href={personalInfo.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 sm:text-sm text-xs font-bold text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-lg px-3 py-3 min-h-[48px]"
                aria-label="View resume (opens in new tab)"
              >
                <span className="rounded-md bg-white/5 p-2 transition group-hover:bg-white/10">
                  <FileText className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden="true" />
                </span>
                Resume
              </a>
            </li>
            <li>
              <a
                href={personalInfo.featuredUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 sm:text-sm text-xs font-bold text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-lg px-3 py-3 min-h-[48px]"
                aria-label="View Featured Experts profile (opens in new tab)"
              >
                <span className="rounded-md bg-white/5 p-2 transition group-hover:bg-white/10">
                  <svg className="h-5 w-5 sm:h-4 sm:w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </span>
                Featured Experts
              </a>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
