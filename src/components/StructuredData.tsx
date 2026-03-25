import { personalInfo, stats } from '../data/content';

export function StructuredData() {
  // Extract numeric values from stats for schema
  const domainsSecured = stats.find((s) => s.label === 'Domains Secured')?.target || 1000;
  const startupsProtected = stats.find((s) => s.label === 'Startups Protected')?.target || 150;
  const incidentsInvestigated = stats.find((s) => s.label === 'Incidents Investigated')?.target || 200;

  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: personalInfo.name,
    jobTitle: personalInfo.title,
    description: personalInfo.description,
    url: 'https://pranithjain.qzz.io',
    email: personalInfo.email,
    sameAs: [personalInfo.linkedInUrl, personalInfo.githubUrl, personalInfo.featuredUrl],
    worksFor: {
      '@type': 'Organization',
      name: 'Qubit Capital',
    },
    knowsAbout: [
      'Email Security',
      'Threat Intelligence',
      'OSINT',
      'Phishing Investigation',
      'BEC Detection',
      'DMARC',
      'SPF',
      'DKIM',
      'Cloud Identity Security',
      'MITRE ATT&CK',
      'Cybersecurity',
    ],
    alumniOf: [
      {
        '@type': 'Organization',
        name: 'Qubit Capital',
      },
      {
        '@type': 'Organization',
        name: 'UnifyCX',
      },
      {
        '@type': 'Organization',
        name: 'TekWorks',
      },
    ],
    award: [
      {
        '@type': 'Achievement',
        name: `Secured ${domainsSecured}+ domains across ${startupsProtected}+ startups`,
      },
      {
        '@type': 'Achievement',
        name: `Investigated ${incidentsInvestigated}+ phishing and BEC incidents`,
      },
    ],
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: `${personalInfo.name} Portfolio`,
    url: 'https://pranithjain.qzz.io',
    author: {
      '@type': 'Person',
      name: personalInfo.name,
    },
    description: personalInfo.description,
  };

  const professionalServiceSchema = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: `${personalInfo.name} - Email Security Consulting`,
    description: 'Email security analysis, threat intelligence, and cybersecurity consulting services',
    provider: {
      '@type': 'Person',
      name: personalInfo.name,
    },
    areaServed: 'Global',
    serviceType: [
      'Email Security Consulting',
      'Threat Intelligence Analysis',
      'Phishing Investigation',
      'Security Awareness Training',
      'DMARC Implementation',
    ],
    url: 'https://pranithjain.qzz.io',
    email: personalInfo.email,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(professionalServiceSchema) }}
      />
    </>
  );
}
