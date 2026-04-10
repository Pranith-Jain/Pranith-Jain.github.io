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

interface CertCategoryProps {
  id: string;
  title: string;
  certs: CertItem[];
}

function CertCategory({ id, title, certs }: CertCategoryProps) {
  if (certs.length === 0) return null;

  return (
    <div id={id} className="scroll-mt-28">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
        {title}
      </h3>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {certs.map((cert, index) => (
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
    </div>
  );
}

export function Certifications() {
  const coreCerts: CertItem[] = certifications.core.map((c) => ({ ...c, type: 'Certification' }));
  const trainingCerts: CertItem[] = certifications.training.map((c) => ({ ...c, type: 'Training', featured: undefined }));
  const bootcampCerts: CertItem[] = certifications.bootcamps.map((c) => ({ ...c, type: 'Bootcamp', featured: undefined }));
  const additionalCerts: CertItem[] = certifications.additional.map((c) => ({ ...c, type: 'Certification', featured: undefined }));
  const internshipCerts: CertItem[] = certifications.internships.map((c) => ({ ...c, type: 'Internship', featured: undefined }));
  const simulationCerts: CertItem[] = certifications.simulations.map((c) => ({ ...c, type: 'Job Simulation', featured: undefined }));

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

      {/* Certification Categories */}
      <div className="space-y-10">
        <CertCategory id="certifications-core" title="Core Certifications" certs={coreCerts} />
        <CertCategory id="certifications-training" title="Training" certs={trainingCerts} />
        <CertCategory id="certifications-bootcamps" title="Bootcamps" certs={bootcampCerts} />
        <CertCategory id="certifications-additional" title="Additional Certifications" certs={additionalCerts} />
        <CertCategory id="certifications-internships" title="Internships" certs={internshipCerts} />
        <CertCategory id="certifications-simulations" title="Job Simulations" certs={simulationCerts} />
      </div>
    </section>
  );
}
