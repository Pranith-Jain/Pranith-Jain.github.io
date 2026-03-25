import { motion } from 'framer-motion';
import { Mail, Calendar, Linkedin, Github, FileText } from 'lucide-react';
import { personalInfo } from '../../data/content';

export function Contact() {
  return (
    <section id="contact" className="mt-32 scroll-mt-24">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-[3rem] bg-slate-900 px-6 py-20 dark:bg-brand-950 sm:px-12 lg:py-28"
      >
        {/* Background patterns */}
        <div className="absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]">
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          ></div>
        </div>
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl"></div>
        <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-brand-400/20 blur-3xl"></div>

        <div className="relative mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            Ready to secure your <br /> digital presence?
          </h2>
          <p className="mx-auto mt-8 max-w-2xl text-lg text-slate-300">
            Whether you need threat intelligence, email security hardening, or cloud identity protection,
            I&apos;m here to help.
          </p>

          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <a
              href={`mailto:${personalInfo.email}`}
              className="inline-flex items-center gap-3 rounded-2xl bg-white px-8 py-4 text-base font-bold text-slate-900 transition hover:bg-slate-100 hover:scale-105 active:scale-95"
            >
              <Mail className="h-5 w-5" />
              Email Me
            </a>
            <a
              href={personalInfo.calendlyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-3 rounded-2xl bg-brand-600 px-8 py-4 text-base font-bold text-white transition hover:bg-brand-500 hover:scale-105 active:scale-95"
            >
              <Calendar className="h-5 w-5" />
              Schedule Call
            </a>
          </div>

          <div className="mt-16 flex flex-wrap justify-center gap-8 border-t border-white/10 pt-12">
            <a
              href={personalInfo.linkedInUrl}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 text-sm font-bold text-slate-500 transition hover:text-white"
            >
              <span className="rounded-lg bg-white/5 p-2 transition group-hover:bg-white/10">
                <Linkedin className="h-4 w-4" />
              </span>
              LinkedIn
            </a>
            <a
              href={personalInfo.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 text-sm font-bold text-slate-500 transition hover:text-white"
            >
              <span className="rounded-lg bg-white/5 p-2 transition group-hover:bg-white/10">
                <Github className="h-4 w-4" />
              </span>
              GitHub
            </a>
            <a
              href={personalInfo.resumeUrl}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 text-sm font-bold text-slate-500 transition hover:text-white"
            >
              <span className="rounded-lg bg-white/5 p-2 transition group-hover:bg-white/10">
                <FileText className="h-4 w-4" />
              </span>
              Resume
            </a>
            <a
              href={personalInfo.featuredUrl}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 text-sm font-bold text-slate-500 transition hover:text-white"
            >
              <span className="rounded-lg bg-white/5 p-2 transition group-hover:bg-white/10">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </span>
              Featured Experts
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
