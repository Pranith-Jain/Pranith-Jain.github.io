import { Mail, Calendar, Linkedin, Github, FileText } from 'lucide-react';
import { personalInfo } from '../../data/content';
import { CopyToClipboard } from '../../components/CopyToClipboard';

/**
 * Contact — dark slate panel restored with dot-grid texture + subtle
 * blur blobs. Same CTAs, same socials, calmer typographic rhythm than
 * the prior 6xl-mega-heading version.
 */
export function Contact() {
  return (
    <section id="contact" className="mt-24 scroll-mt-24" aria-labelledby="contact-heading">
      <div className="animate-fade-in-up relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-16 sm:px-12 sm:py-20 dark:bg-brand-950">
        {/* Dot grid texture */}
        <div
          className="absolute inset-0 opacity-15 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]"
          aria-hidden="true"
        >
          <div
            className="h-full w-full"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-300">07 — Contact</div>
          <h2
            id="contact-heading"
            className="font-serif text-3xl font-normal italic tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            Ready to secure your <br className="hidden sm:inline" />
            digital presence?
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Whether you need threat intelligence, email security hardening, or cloud identity protection, I&apos;m here
            to help. My work bridges technical controls with business-critical trust signals across 150+ global brands.
          </p>

          {/* Primary CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            {/* ONE primary CTA */}
            <a
              href={personalInfo.calendlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition-all duration-200 ease-spring hover:-translate-y-0.5 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              aria-label="Schedule a 30-minute consultation call"
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Schedule Call
            </a>
            {/* Secondary actions as quiet text-links */}
            <a
              href={`mailto:${personalInfo.email}`}
              className="inline-flex items-center gap-1.5 font-mono text-[12px] text-slate-300 underline decoration-brand-400 decoration-1 underline-offset-4 transition-colors hover:text-white"
              aria-label={`Send email to ${personalInfo.email}`}
            >
              <Mail className="h-3 w-3" aria-hidden="true" />
              hello@pranithjain.qzz.io
            </a>
            <CopyToClipboard text={personalInfo.email} label="Copy email address" />
          </div>

          {/* Socials row */}
          <ul
            className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/10 pt-6 font-mono text-[12px]"
            aria-label="Social media and professional links"
          >
            <li>
              <a
                href={personalInfo.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
                aria-label="LinkedIn (opens in new tab)"
              >
                <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
                linkedin
              </a>
            </li>
            <li>
              <a
                href={personalInfo.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
                aria-label="GitHub (opens in new tab)"
              >
                <Github className="h-3.5 w-3.5" aria-hidden="true" />
                github
              </a>
            </li>
            <li>
              <a
                href={personalInfo.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
                aria-label="Resume (opens in new tab)"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                resume
              </a>
            </li>
            <li>
              <a
                href={personalInfo.featuredUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
                aria-label="Featured Experts profile (opens in new tab)"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                featured
              </a>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
