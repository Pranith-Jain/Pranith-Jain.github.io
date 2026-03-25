import { motion } from 'framer-motion';
import { certifications } from '../../data/content';

interface CertCardProps {
  title: string;
  issuer: string;
  year: string;
  featured?: boolean;
  type: string;
}

function CertCard({ title, issuer, year, featured, type }: CertCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={`glass rounded-2xl p-6 shadow-sm transition-all hover:-translate-y-1 h-full flex flex-col ${
        featured ? 'border-l-4 border-brand-500' : ''
      }`}
    >
      <div className="text-xs font-bold text-brand-600 dark:text-brand-400 mb-1 uppercase tracking-wider">
        {type}
      </div>
      <div className="text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
      <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
        {issuer} • {year}
      </div>
    </motion.div>
  );
}

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
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

interface CertItem {
  title: string;
  issuer: string;
  year: string;
  featured?: boolean;
  type: string;
}

export function Certifications() {
  const allCerts: CertItem[] = [
    ...certifications.core.map((c) => ({ ...c, type: 'Certification' })),
    ...certifications.training.map((c) => ({ ...c, type: 'Training', featured: undefined })),
    ...certifications.bootcamps.map((c) => ({ ...c, type: 'Bootcamp', featured: undefined })),
    ...certifications.additional.map((c) => ({ ...c, type: 'Certification', featured: undefined })),
    ...certifications.internships.map((c) => ({ ...c, type: 'Internship', featured: undefined })),
    ...certifications.simulations.map((c) => ({ ...c, type: 'Job Simulation', featured: undefined })),
  ];

  return (
    <section id="certifications" className="mt-20 scroll-mt-24">
      {/* Header */}
      <div className="mb-12 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-brand-700 dark:text-brand-300"
        >
          Credentials
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900 dark:text-white"
        >
          Certifications & Coursework
        </motion.h2>
      </div>

      {/* Certifications Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {allCerts.map((cert, index) => (
          <motion.div key={`${cert.title}-${index}`} variants={itemVariants}>
            <CertCard
              title={cert.title}
              issuer={cert.issuer}
              year={cert.year}
              featured={cert.featured}
              type={cert.type}
            />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
