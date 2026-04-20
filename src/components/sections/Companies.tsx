import { motion } from 'framer-motion';
import { companies } from '../../data/content';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
};

export function Companies() {
  return (
    <section id="companies" className="mt-32 scroll-mt-24">
      {/* Header */}
      <div className="mb-12 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400"
        >
          Industry Experience
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white"
        >
          Enterprise Partnerships
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 text-lg text-slate-700 dark:text-slate-400"
        >
          Securing email infrastructure for 150+ startups and enterprises across AI, HealthTech, and SaaS.
        </motion.p>
      </div>

      {/* Companies Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="flex flex-wrap justify-start gap-4"
      >
        {companies.map((company) => (
          <motion.div
            key={company}
            variants={itemVariants}
            className="glass px-6 py-3 rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-200 transition-all hover:border-brand-500/50 hover:bg-brand-500/5 hover:-translate-y-1 cursor-default"
          >
            {company}
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
