import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CertificationGroup, Education } from '../../core/entities';

const INITIAL_PER_CATEGORY = 6;

interface CertCardProps {
  title: string;
  issuer: string;
  year: string;
  featured?: boolean;
  type: string;
}

function CertCard({ title, issuer, year, featured, type }: CertCardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 transition hover:border-brand-500/40 h-full flex flex-col ${
        featured ? 'border-l-[3px] border-l-brand-500' : ''
      }`}
    >
      <div className="text-micro font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400 mb-1.5">
        {type}
      </div>
      <div className="text-base font-semibold text-slate-900 dark:text-white leading-snug">{title}</div>
      <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
        {issuer} · {year}
      </div>
    </div>
  );
}

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
  const [showAll, setShowAll] = useState(false);
  if (certs.length === 0) return null;
  const visible = showAll ? certs : certs.slice(0, INITIAL_PER_CATEGORY);
  const remaining = certs.length - INITIAL_PER_CATEGORY;

  return (
    <div id={id} className="scroll-mt-28">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3>
        <span className="text-mini font-mono text-slate-500">{certs.length}</span>
      </div>
      <div className="animate-fade-in-up grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((cert, index) => (
          <div key={`${cert.title}-${index}`}>
            <CertCard
              title={cert.title}
              issuer={cert.issuer}
              year={cert.year}
              featured={cert.featured}
              type={cert.type}
            />
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <div className="mt-4 flex">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition"
            aria-expanded={showAll}
          >
            {showAll ? (
              <>
                <ChevronUp size={12} aria-hidden="true" /> Show fewer
              </>
            ) : (
              <>
                <ChevronDown size={12} aria-hidden="true" /> Read more ({remaining} more)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

interface CertificationsProps {
  certifications: CertificationGroup;
  education: Education[];
}

export function Certifications({ certifications, education }: CertificationsProps) {
  const coreCerts: CertItem[] = certifications.core.map((c) => ({ ...c, type: 'Certification' }));
  const trainingCerts: CertItem[] = certifications.training.map((c) => ({
    ...c,
    type: 'Training',
    featured: undefined,
  }));
  const bootcampCerts: CertItem[] = certifications.bootcamps.map((c) => ({
    ...c,
    type: 'Bootcamp',
    featured: undefined,
  }));
  const additionalCerts: CertItem[] = certifications.additional.map((c) => ({
    ...c,
    type: 'Certification',
    featured: undefined,
  }));
  const internshipCerts: CertItem[] = certifications.internships.map((c) => ({
    ...c,
    type: 'Internship',
    featured: undefined,
  }));
  const simulationCerts: CertItem[] = certifications.simulations.map((c) => ({
    ...c,
    type: 'Job Simulation',
    featured: undefined,
  }));

  return (
    <section id="certifications" className="mt-20 scroll-mt-24">
      <div className="mb-10 max-w-2xl">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
          Credentials
        </div>
        <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
          Education, certifications &amp; coursework
        </h2>
      </div>

      {/* Education */}
      <div id="education" className="mb-10 scroll-mt-24">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Education
        </h3>
        <ul className="space-y-3">
          {education.map((e) => (
            <li
              key={e.degree}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 px-5 py-4"
            >
              <div className="font-semibold text-slate-900 dark:text-white">{e.degree}</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">{e.school}</div>
            </li>
          ))}
        </ul>
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
