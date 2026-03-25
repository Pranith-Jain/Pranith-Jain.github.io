import { motion } from 'framer-motion';

interface SectionTitleProps {
  label: string;
  title: string;
  description?: string;
  className?: string;
}

export function SectionTitle({ label, title, description, className = '' }: SectionTitleProps) {
  return (
    <div className={`mb-12 max-w-3xl ${className}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400"
      >
        {label}
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white"
      >
        {title}
      </motion.h2>
      {description && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 text-lg text-slate-700 dark:text-slate-400"
        >
          {description}
        </motion.p>
      )}
    </div>
  );
}
