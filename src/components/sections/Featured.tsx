import { motion } from 'framer-motion';
import { featuredArticles } from '../../data/content';

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

export function Featured() {
  return (
    <section id="featured" className="mt-32 scroll-mt-24">
      {/* Header */}
      <div className="mb-16 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400"
        >
          Recognition
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900 dark:text-white"
        >
          Expert Features & Insights
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-4 text-lg text-slate-700 dark:text-slate-400"
        >
          Contributing cybersecurity expertise to industry-leading platforms.
        </motion.p>
      </div>

      {/* Articles Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
      >
        {featuredArticles.map((article) => (
          <motion.a
            key={article.title}
            href={article.url}
            target="_blank"
            rel="noreferrer"
            variants={itemVariants}
            className="glass group flex flex-col gap-6 p-8 rounded-[2rem] transition-all hover:shadow-glow hover:-translate-y-2 border-white/20 bg-white/40 dark:bg-slate-900/40 h-full"
          >
            <div className="flex items-center justify-between">
              <div
                className={`grid h-14 w-14 place-items-center rounded-2xl font-black text-xl ${
                  article.category === 'Security Specialist'
                    ? 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    : 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300'
                }`}
              >
                {article.category === 'Security Specialist' ? 'F' : 'D'}
              </div>
              <div
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                  article.category === 'Security Specialist'
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                }`}
              >
                {article.category === 'Security Specialist' ? 'Expert Profile' : 'Published Article'}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                {article.title}
              </h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {article.description}
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-bold text-slate-500">
                <span>{article.source}</span>
                <span>•</span>
                <span>{article.category}</span>
              </div>
            </div>
          </motion.a>
        ))}
      </motion.div>
    </section>
  );
}
