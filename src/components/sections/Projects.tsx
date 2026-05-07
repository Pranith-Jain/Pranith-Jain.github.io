import { motion } from 'framer-motion';
import { Github, ExternalLink } from 'lucide-react';
import { projects } from '../../data/content';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function Projects() {
  return (
    <section id="projects" className="mt-20 scroll-mt-24">
      {/* Header */}
      <div className="mb-12 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400"
        >
          Projects
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900 dark:text-white"
        >
          Selected projects & initiatives
        </motion.h2>
      </div>

      {/* Projects Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="grid gap-6"
      >
        {projects.map((project) => (
          <motion.div
            key={project.title}
            variants={itemVariants}
            className="glass rounded-2xl p-6 shadow-sm transition-all hover:shadow-glow hover:border-brand-500/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="text-base font-semibold text-slate-900 dark:text-white">{project.title}</div>
              {project.badge && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {project.badge}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 line-clamp-3">{project.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 transition-transform hover:scale-105"
                >
                  <span className="text-xs">{tag}</span>
                </span>
              ))}
              {project.github && (
                <a
                  href={project.github}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 hover:bg-slate-200 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
                  aria-label="View on GitHub"
                >
                  <Github className="w-3.5 h-3.5" />
                  <span className="text-xs">Code</span>
                </a>
              )}
              {project.href && (
                <a
                  href={project.href}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 hover:bg-brand-100 dark:border-white/10 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-800/40"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="text-xs">Live</span>
                </a>
              )}
              {project.link && (
                <a
                  href={project.link}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/70 bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 shadow-sm backdrop-blur-xl transition-transform hover:scale-105 hover:bg-brand-100 dark:border-white/10 dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-800/40"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="text-xs">{project.link.startsWith('#') ? 'View Tool' : 'Live Demo'}</span>
                </a>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
