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
    <div
      className={`flex h-full flex-col border border-rule bg-surface-raised p-5 transition-colors duration-enter hover:border-ink-1 ${
        featured ? 'border-l-2 border-l-accent' : ''
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{type}</div>
      <div className="mt-2 text-sm font-medium text-ink-1">{title}</div>
      <div className="mt-1 text-sm text-ink-2">
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
  if (certs.length === 0) return null;
  return (
    <div id={id} className="scroll-mt-28">
      <h3 className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {certs.map((cert, index) => (
          <CertCard
            key={`${cert.title}-${index}`}
            title={cert.title}
            issuer={cert.issuer}
            year={cert.year}
            featured={cert.featured}
            type={cert.type}
          />
        ))}
      </div>
    </div>
  );
}

export function Certifications() {
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
    <section id="certifications" className="scroll-mt-24 py-16 lg:py-24">
      <div className="mb-10 max-w-[65ch]">
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Certifications &amp; coursework
        </h2>
      </div>

      <div className="space-y-12">
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
