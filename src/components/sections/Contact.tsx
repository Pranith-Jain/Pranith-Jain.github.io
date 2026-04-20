import { motion } from 'framer-motion';
import { Mail, Calendar, Linkedin, Github, FileText } from 'lucide-react';
import { personalInfo } from '../../data/content';
import { CopyToClipboard } from '../../components/CopyToClipboard';

export function Contact() {
  return (
    <section id="contact" className="mt-32 scroll-mt-24" aria-labelledby="contact-heading">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-[3rem] bg-slate-900 px-6 py-20 dark:bg-brand-950 sm:px-12 lg:py-28"
      >
        {/* Background patterns */}
        <div
          className="absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]"
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
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
        <div
          className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-brand-400/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-4xl text-center">
          <h2 id="contact-heading" className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            Ready to secure your <br /> digital presence?
          </h2>
          <p className="mx-auto mt-8 max-w-2xl text-lg text-slate-300">
            Whether you need threat intelligence, email security hardening, or cloud identity protection, I&apos;m here
            to help. My work bridges technical controls with business-critical trust signals across 150+ global brands.
          </p>

          {/* Primary CTA Buttons */}
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <a
              href={`mailto:${personalInfo.email}`}
              className="inline-flex items-center gap-3 rounded-2xl bg-white px-8 py-4 text-base font-bold text-slate-900 transition hover:bg-slate-100 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-label={`Send email to ${personalInfo.email}`}
            >
              <Mail className="h-5 w-5" aria-hidden="true" />
              Email Me
            </a>
            <a
              href={personalInfo.calendlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-2xl bg-brand-600 px-8 py-4 text-base font-bold text-white transition hover:bg-brand-500 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 focus:ring-offset-slate-900"
              aria-label="Schedule a 30-minute consultation call"
            >
              <Calendar className="h-5 w-5" aria-hidden="true" />
              Schedule Call
            </a>
          </div>

          {/* Email Copy Feature */}
          <div className="mt-6 flex justify-center">
            <CopyToClipboard text={personalInfo.email} label="Copy email address" />
          </div>

          {/* Social Links */}
          <ul
            className="mt-16 flex flex-wrap justify-center gap-8 border-t border-white/10 pt-12"
            aria-label="Social media and professional links"
          >
            <li>
              <a
                href={personalInfo.linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 text-sm font-bold text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-lg px-2 py-1"
                aria-label="Visit LinkedIn profile (opens in new tab)"
              >
                <span className="rounded-lg bg-white/5 p-2 transition group-hover:bg-white/10">
                  <Linkedin className="h-4 w-4" aria-hidden="true" />
                </span>
                LinkedIn
              </a>
            </li>
            <li>
              <a
                href={personalInfo.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 text-sm font-bold text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-lg px-2 py-1"
                aria-label="Visit GitHub profile (opens in new tab)"
              >
                <span className="rounded-lg bg-white/5 p-2 transition group-hover:bg-white/10">
                  <Github className="h-4 w-4" aria-hidden="true" />
                </span>
                GitHub
              </a>
            </li>
            <li>
              <a
                href={personalInfo.resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 text-sm font-bold text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-lg px-2 py-1"
                aria-label="View resume (opens in new tab)"
              >
                <span className="rounded-lg bg-white/5 p-2 transition group-hover:bg-white/10">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                </span>
                Resume
              </a>
            </li>
            <li>
              <a
                href={personalInfo.featuredUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 text-sm font-bold text-slate-500 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-slate-900 rounded-lg px-2 py-1"
                aria-label="View Featured Experts profile (opens in new tab)"
              >
                <span className="rounded-lg bg-white/5 p-2 transition group-hover:bg-white/10">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </span>
                Featured Experts
              </a>
            </li>
          </ul>
        </div>
      </motion.div>
    </section>
  );
}
