import { personalInfo, stats } from '../data/content';

export function StructuredData() {
  // Extract numeric values from stats for schema
  const domainsSecured = stats.find((s) => s.label === 'Domains Secured')?.target || 1300;
  const inboxesMonitored = stats.find((s) => s.label === 'Inboxes Monitored')?.target || 2700;
  const incidentsInvestigated = stats.find((s) => s.label === 'Incidents Investigated')?.target || 200;

  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: personalInfo.name,
    jobTitle: personalInfo.title,
    description: personalInfo.description,
    url: 'https://pranithjain.qzz.io',
    email: personalInfo.email,
    telephone: personalInfo.phone,
    sameAs: [personalInfo.linkedInUrl, personalInfo.githubUrl, personalInfo.featuredUrl],
    worksFor: {
      '@type': 'Organization',
      name: 'Qubit Capital',
    },
    knowsAbout: [
      'Email Security Operations',
      'Email Infrastructure Monitoring',
      'Phishing Investigation',
      'BEC Mitigation',
      'Email Forensics',
      'IOC Identification',
      'Threat Remediation',
      'SOC Automation',
      'Incident Response Automation',
      'n8n Workflows',
      'MCP',
      'Claude Code Integration',
      'Domain Abuse Monitoring',
      'OSINT-driven Threat Intelligence',
      'Email Header Analysis',
      'Sandbox Malware Detection',
      'SMTP Authentication Controls',
      'WAF Rule Tuning',
      'SSL/TLS Certificate Management',
      'Inbox Placement Rate',
      'Email Deliverability Optimization',
      'SPF/DKIM/DMARC Enforcement',
      'Zero Trust Architecture',
      'Cloud Security Monitoring',
      'Dashboard Engineering',
      'Alert Correlation',
      'Threat Actor TTP Analysis',
      'MITRE ATT&CK Mapping',
      'False Positive Reduction',
      'Security Metrics & Reporting',
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
        name: `Secured ${domainsSecured}+ domains across email infrastructure`,
      },
      {
        '@type': 'Achievement',
        name: `Monitoring ${inboxesMonitored}+ inboxes for email infrastructure visibility`,
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
      'SOC Automation',
      'Incident Response Automation',
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
