import { motion } from 'framer-motion';
import { Mail, Search, Users, Shield, Cloud, Zap } from 'lucide-react';
import { skills } from '../../data/content';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Mail,
  Search,
  Users,
  Shield,
  Cloud,
  Zap,
};

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

export function Skills() {
  return (
    <section id="skills" className="mt-32 scroll-mt-24">
      {/* Header */}
      <div className="mb-16 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400"
        >
          Expertise
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white"
        >
          Core Competencies
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 text-lg text-slate-700 dark:text-slate-400"
        >
          Focused on threat intelligence, cyber criminology, email security, and cloud identity defense.
        </motion.p>
      </div>

      {/* Skills Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {skills.map((skill) => {
          const IconComponent = iconMap[skill.icon];
          return (
            <motion.div
              key={skill.title}
              variants={itemVariants}
              className="group glass rounded-3xl p-8 transition-all duration-300 hover:shadow-glow hover:-translate-y-1 hover:border-brand-500/40 h-full flex flex-col"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-900/30 dark:text-brand-300">
                {IconComponent && <IconComponent className="h-6 w-6" aria-hidden="true" />}
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">{skill.title}</div>
              <ul className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-400">
                {skill.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500"></span>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
