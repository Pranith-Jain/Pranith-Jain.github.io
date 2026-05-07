import { motion } from 'framer-motion';
import { Search, Zap, Shield, FileText, Monitor, Mail } from 'lucide-react';
import { experiences } from '../../data/content';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Search,
  Zap,
  Shield,
  FileText,
  Monitor,
  Mail,
};

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

export function Experience() {
  return (
    <section id="experience" className="mt-20 scroll-mt-24">
      {/* Header */}
      <div className="mb-12 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400"
        >
          Experience
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900 dark:text-white"
        >
          Experience highlights
        </motion.h2>
      </div>

      {/* Experience Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="grid gap-8"
      >
        {experiences.map((exp, index) => (
          <motion.div
            key={`${exp.title}-${index}`}
            variants={itemVariants}
            className="glass rounded-2xl p-6 shadow-sm transition-all hover:shadow-md"
          >
            {/* Header */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-4">
              <div>
                <div className="text-base font-semibold text-slate-900 dark:text-white">{exp.title}</div>
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  {exp.company}
                  {exp.location && ` • ${exp.location}`} • {exp.period}
                </div>
              </div>
              {exp.badge && (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {exp.badge}
                </span>
              )}
            </div>

            {/* Sections (for main experience) */}
            {exp.sections &&
              exp.sections.map((section, sIndex) => {
                const IconComponent = iconMap[section.icon];
                const sectionId = section.title
                  .toLowerCase()
                  .replace(/[^\w\s]/g, '')
                  .replace(/\s+/g, '-');
                return (
                  <div
                    key={section.title}
                    id={
                      sIndex === 0
                        ? 'experience-email-security-operations'
                        : sIndex === 1
                          ? 'experience-infrastructure-monitoring-dashboard'
                          : sIndex === 2
                            ? 'experience-phishing--bec-investigation'
                            : sIndex === 3
                              ? 'experience-soc-automation'
                              : sIndex === 4
                                ? 'experience-domain-abuse-monitoring'
                                : `experience-${sectionId}`
                    }
                    className={`scroll-mt-28 ${sIndex < exp.sections!.length - 1 ? 'mb-5' : ''}`}
                  >
                    <h4 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-2 flex items-center gap-2">
                      {IconComponent && <IconComponent className="w-4 h-4" />}
                      {section.title}
                    </h4>
                    <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 ml-6">
                      {section.items.map((item, iIndex) => (
                        <li key={iIndex} className="relative pl-4">
                          <span className="absolute left-0 text-brand-600 dark:text-brand-300">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

            {/* Items (for other experiences) */}
            {exp.items && (
              <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                {exp.items.map((item, iIndex) => (
                  <li key={iIndex} className="relative pl-4">
                    <span className="absolute left-0 text-brand-600 dark:text-brand-300">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
