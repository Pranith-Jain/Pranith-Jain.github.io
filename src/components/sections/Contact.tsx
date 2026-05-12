import { Calendar, Linkedin, Github, FileText, ArrowRight } from 'lucide-react';
import { personalInfo } from '../../data/content';
import { CopyToClipboard } from '../../components/CopyToClipboard';

/**
 * Contact — editorial open-channel. Flat surface, single primary CTA
 * (Schedule a call), plus the email + socials as a sans/mono row.
 * The dark slate panel from the previous design is gone.
 */
export function Contact() {
  return (
    <section id="contact" className="scroll-mt-24 py-16 lg:py-24" aria-labelledby="contact-heading">
      <div className="max-w-[65ch]">
        <h2
          id="contact-heading"
          className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl"
        >
          Ready to secure your digital presence?
        </h2>
        <p className="mt-5 text-base leading-[1.55] text-ink-2 sm:text-lg">
          Whether you need threat intelligence, email security hardening, or cloud identity protection — my work bridges
          technical controls with business-critical trust signals across 150+ global brands.
        </p>

        {/* Primary CTA + email row */}
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a
            href={personalInfo.calendlyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-accent px-5 py-3 text-sm font-medium text-white transition-colors duration-enter hover:bg-brand-700"
            aria-label="Schedule a 30-minute consultation call"
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            Schedule a call
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <a
            href={`mailto:${personalInfo.email}`}
            className="font-mono text-sm text-ink-2 underline decoration-rule decoration-2 underline-offset-[6px] transition-colors duration-enter hover:text-accent hover:decoration-accent"
            aria-label={`Send email to ${personalInfo.email}`}
          >
            hello@pranithjain.qzz.io
          </a>
          <CopyToClipboard text={personalInfo.email} label="Copy email address" />
        </div>

        {/* Socials row */}
        <ul
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-rule pt-8 font-mono text-sm"
          aria-label="Social media and professional links"
        >
          <li>
            <a
              href={personalInfo.linkedInUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-ink-2 transition-colors duration-enter hover:text-accent"
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
              className="inline-flex items-center gap-1.5 text-ink-2 transition-colors duration-enter hover:text-accent"
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
              className="inline-flex items-center gap-1.5 text-ink-2 transition-colors duration-enter hover:text-accent"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              resume
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
