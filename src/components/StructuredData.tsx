import { personalInfo, stats } from '../data/content';

export function StructuredData() {
  // Extract numeric values from stats for schema
  const domainsSecured = stats.find((s) => s.label === 'Domains Secured')?.target || 1300;
  const inboxesMonitored = stats.find((s) => s.label === 'Inboxes Monitored')?.target || 2700;
  const incidentsInvestigated = stats.find((s) => s.label === 'Incidents Investigated')?.target || 250;

  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: personalInfo.name,
    jobTitle: personalInfo.title,
    description: personalInfo.description,
    url: 'https://pranithjain.qzz.io',
    email: personalInfo.email,
    // Phone deliberately omitted from public schema. Email + Calendly is the
    // documented contact channel; surfacing the personal number to scrapers is
    // unnecessary exposure.
    sameAs: [personalInfo.linkedInUrl, personalInfo.githubUrl, personalInfo.featuredUrl],
    worksFor: {
      '@type': 'Organization',
      name: 'Qubit Capital',
    },
    knowsAbout: [
      'Digital Forensics and Incident Response',
      'DFIR Toolkit Engineering',
      'Detection Engineering',
      'Threat Intelligence',
      'Email Security Operations',
      'Phishing Investigation',
      'BEC Mitigation',
      'Email Forensics',
      'IOC Analysis',
      'IOC Extraction',
      'Subdomain Takeover Detection',
      'JWT Security',
      'IDN Homograph Detection',
      'Threat Remediation',
      'SOC Automation',
      'Incident Response Automation',
      'n8n Workflows',
      'MCP Frameworks',
      'Claude Code Integration',
      'Domain Abuse Monitoring',
      'OSINT-driven Threat Intelligence',
      'Email Header Analysis',
      'Sandbox Malware Detection',
      'SMTP Authentication Controls',
      'WAF Rule Tuning',
      'SSL/TLS Certificate Management',
      'Email Deliverability Optimization',
      'SPF/DKIM/DMARC Enforcement',
      'Zero Trust Architecture',
      'Cloud Security Monitoring',
      'Cloudflare Workers',
      'Edge-native Security Tooling',
      'Alert Correlation',
      'Threat Actor TTP Analysis',
      'MITRE ATT&CK Mapping',
      'STIX 2.1 Ingest',
      'False Positive Reduction',
      'AI Security',
      'NHI Governance',
    ],
    alumniOf: [
      {
        '@type': 'Organization',
        name: 'UnifyCX',
      },
      {
        '@type': 'Organization',
        name: 'TekWorks',
      },
      {
        '@type': 'Organization',
        name: 'AiROBOSOFT',
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
    name: `${personalInfo.name} — Security Analyst, Threat Intel & Security Automation`,
    description:
      'Security analysis, threat intelligence, and security automation. Phishing / BEC / commodity-malware response across 150+ global brands. Builder of an open, edge-hosted DFIR toolkit on Cloudflare Workers.',
    provider: {
      '@type': 'Person',
      name: personalInfo.name,
    },
    areaServed: 'Global',
    serviceType: [
      'Detection Engineering',
      'Threat Intelligence Analysis',
      'Phishing Investigation',
      'Email Security Consulting',
      'DMARC Implementation',
      'DFIR Tooling',
      'SOC Automation',
      'Incident Response Automation',
      'Edge-native Security Infrastructure',
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
