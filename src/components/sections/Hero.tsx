import { motion } from 'framer-motion';
import { Linkedin, Github, Mail } from 'lucide-react';
import { personalInfo, stats } from '../../data/content';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function Hero() {
  return (
    <section className="relative pt-6 lg:pt-10">
      <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left Content */}
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
          {/* Badges */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200/50 bg-brand-50/50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-700 backdrop-blur-md dark:border-brand-800/50 dark:bg-brand-900/30 dark:text-brand-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
              </span>
              Certified AI Security Expert
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200">
              Threat Intelligence
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-4 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200">
              Email Defense
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-4 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm backdrop-blur-xl dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-300">
              AU Ambassador Program
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-3xl font-extrabold leading-[1.2] tracking-tight sm:text-4xl lg:text-5xl text-slate-900 dark:text-white">
            &quot;Most phishing investigations end at the alert.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-brand-400 dark:from-brand-400 dark:to-brand-200">
              Mine start there.
            </span>
            &quot;
          </h1>

          {/* Description */}
          <p className="mt-8 max-w-2xl text-xl leading-relaxed text-slate-700 dark:text-slate-300">
            I&apos;m{' '}
            <span className="font-bold text-slate-900 dark:text-white underline decoration-brand-500/30 underline-offset-4">
              Pranith Jain
            </span>{' '}
            — {personalInfo.description}
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
              className="inline-flex items-center justify-center rounded-2xl bg-brand-600 px-8 py-4 text-base font-bold text-white shadow-glow transition hover:bg-brand-500 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              Book Strategy Call
            </a>
            <a
              href="#skills"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200/60 bg-white/70 px-8 py-4 text-base font-bold text-slate-800 shadow-sm transition hover:shadow-md hover:scale-105 active:scale-95 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            >
              Explore Focus Areas
            </a>
          </div>

          {/* Social Links */}
          <div className="mt-8 flex items-center gap-6">
            <a
              href={personalInfo.linkedInUrl}
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 transition hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
              aria-label="LinkedIn"
            >
              <Linkedin className="h-6 w-6" aria-hidden="true" />
            </a>
            <a
              href={personalInfo.githubUrl}
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 transition hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
              aria-label="GitHub"
            >
              <Github className="h-6 w-6" aria-hidden="true" />
            </a>
            <a
              href={`mailto:${personalInfo.email}`}
              className="text-slate-500 transition hover:text-brand-600 dark:hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
              aria-label="Email"
            >
              <Mail className="h-6 w-6" aria-hidden="true" />
            </a>
          </div>
        </motion.div>

        {/* Right Content - Profile Card */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative mt-12 lg:mt-0"
        >
          <div className="glass relative z-10 overflow-hidden rounded-[2.5rem] border-white/20 bg-white/40 shadow-2xl backdrop-blur-3xl dark:border-white/10 dark:bg-slate-900/40">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-brand-500/10"></div>

            <div className="relative p-8 sm:p-10">
              {/* PJ Logo */}
              <div className="mb-8 flex items-center justify-center">
                <span className="h-32 w-32 sm:h-36 sm:w-36 rounded-3xl shadow-glow animate-pulse-slow flex items-center justify-center overflow-hidden">
                  <svg viewBox="0 0 36 36" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="pjGradientHero" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2c3ee5" />
                        <stop offset="100%" stopColor="#435ef1" />
                      </linearGradient>
                    </defs>
                    <rect width="36" height="36" rx="8" fill="url(#pjGradientHero)" />
                    <text
                      x="50%"
                      y="50%"
                      dominantBaseline="central"
                      textAnchor="middle"
                      fill="white"
                      fontFamily="Poppins, sans-serif"
                      fontWeight="800"
                      fontSize="16"
                    >
                      PJ
                    </text>
                  </svg>
                </span>
              </div>

              <div className="flex items-center gap-5">
                <div className="relative">
                  <span className="h-16 w-16 rounded-2xl shadow-lg flex items-center justify-center overflow-hidden">
                    <svg viewBox="0 0 36 36" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="pjGradientAvatar" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#2c3ee5" />
                          <stop offset="100%" stopColor="#435ef1" />
                        </linearGradient>
                      </defs>
                      <rect width="36" height="36" rx="8" fill="url(#pjGradientAvatar)" />
                      <text
                        x="50%"
                        y="50%"
                        dominantBaseline="central"
                        textAnchor="middle"
                        fill="white"
                        fontFamily="Poppins, sans-serif"
                        fontWeight="800"
                        fontSize="16"
                      >
                        PJ
                      </text>
                    </svg>
                  </span>
                  <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-4 border-white bg-emerald-500 dark:border-slate-900"></div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white">{personalInfo.name}</div>
                  <div className="text-sm font-medium text-brand-600 dark:text-brand-400">{personalInfo.title}</div>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-200/60 pt-6 dark:border-white/10">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">Quick Links</div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`mailto:${personalInfo.email}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    Email
                  </a>
                  <a
                    href="#contact"
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    Contact
                  </a>
                  <a
                    href={personalInfo.linkedInUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    LinkedIn
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative Background Elements */}
          <div className="absolute -right-12 -top-12 -z-10 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl"></div>
          <div className="absolute -bottom-8 -left-8 -z-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-2xl"></div>
        </motion.div>
      </div>

      {/* Stats Section */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="mt-20 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            variants={itemVariants}
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
              <p className="mt-3 text-xs font-medium text-slate-600 leading-relaxed">{stat.description}</p>
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
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
