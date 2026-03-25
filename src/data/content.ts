export const personalInfo = {
  name: 'Pranith Jain',
  title: 'Security Analyst',
  headline: '"Most phishing investigations end at the alert. Mine start there."',
  description: `I'm Pranith Jain — I investigate phishing incidents starting at the alert: suspicious emails, BEC attempts, and malware payloads. That hands-on experience shaped how I build automation and detection playbooks. Currently expanding into AI security and API threat detection while defending communication integrity for 150+ global brands.`,
  currentFocus: 'Threat intel, email defense, and cloud identity security',
  currentlyLearning: 'API Security & AI for Security',
  availability: 'Open for Consultations & Strategy Calls',
  email: 'hello@pranithjain.qzz.io',
  calendlyUrl: 'https://calendly.com/pranithjain84/30min',
  linkedInUrl: 'https://www.linkedin.com/in/pranithjain',
  githubUrl: 'https://github.com/Pranith-Jain',
  resumeUrl: 'https://app.rezi.ai/s/pranith-jain',
  featuredUrl: 'https://featured.com/p/pranith-jain',
};

export const stats = [
  {
    label: 'Incidents Investigated',
    value: '200+',
    target: 200,
    description: 'Phishing, BEC, and malware incidents investigated and resolved.',
    badge: '25% False Positive Reduction',
  },
  {
    label: 'Response Time',
    value: '<90',
    suffix: 'min',
    description: 'Average incident response time via automated n8n pipelines.',
    progress: 75,
  },
  {
    label: 'Domains Secured',
    value: '1000+',
    target: 1000,
    description: 'Across 150+ Startup Portfolio',
    badge: '98%+ Auth Alignment',
  },
  {
    label: 'Startups Protected',
    value: '150+',
    target: 150,
    description: 'Under Qubit Capital Portfolio',
    badge: 'Enterprise Grade Security',
  },
];

export const skills = [
  {
    title: 'Email Security & Deliverability',
    icon: 'Mail',
    items: [
      'SPF / DKIM / DMARC / BIMI',
      'Phishing & spoofing defense',
      'BEC (Business Email Compromise) detection',
      'Email header & forensic analysis',
      'Sender reputation monitoring & response',
      'Proofpoint & Google Workspace',
    ],
  },
  {
    title: 'Threat Intelligence',
    icon: 'Search',
    items: [
      'Threat hunting & intel operations',
      'MITRE ATT&CK framework mapping',
      'IoC enrichment & correlation',
      'CVE correlation & threat actor tracking',
      'Dark web monitoring & OSINT',
      'Email-borne threat analysis',
    ],
  },
  {
    title: 'Cyber Criminology & OSINT',
    icon: 'Users',
    items: [
      'Advanced Digital Footprinting',
      'Fraud, abuse, and actor profiling',
      'Social engineering risk analysis',
      'Case & entity investigations',
    ],
  },
  {
    title: 'Email Threat Response',
    icon: 'Shield',
    items: [
      'Phishing triage & abuse response',
      'Malware payload analysis & sandboxing',
      'Alert correlation & incident workflows',
      'SOC investigations & escalation',
      'Domain abuse prevention & takedowns',
    ],
  },
  {
    title: 'Cloud Identity Security',
    icon: 'Cloud',
    items: [
      'IAM design & Zero Trust',
      'Identity governance & access reviews',
      'SSO, MFA, and conditional access',
      'API security & threat detection',
      'Cloud directory hardening (GCP/AWS/Azure)',
    ],
  },
  {
    title: 'AI for Security & Automation',
    icon: 'Zap',
    items: [
      'n8n workflow automation & MCP frameworks',
      'AI for security detection & analysis',
      'AI security & prompt injection defense',
      'Security automation playbooks',
      'API security testing & integration',
    ],
  },
];

export const companies = [
  'Alphasearch',
  'BlendHealth',
  'Axolotl Biosciences',
  'Blue Vision Capital',
  'MoneyVerse',
  'Doctor Assistant',
  'HealthSpectra AI',
  'Query Health',
  'Carbon Neutral Homes',
  'VoltPath',
  'Sentient Trader',
  'SwyftFin',
];

export const experiences = [
  {
    title: 'Information Technology Support Specialist',
    company: 'Qubit Capital',
    location: '',
    period: 'Jul 2024 — Present',
    badge: '200+ Incidents • <90min Response',
    sections: [
      {
        title: 'Threat Investigation & Incident Analysis',
        icon: 'Search',
        items: [
          'Investigated 200+ phishing and BEC incidents, analyzing email headers, sandboxing payloads, and documenting attack chains for SOC handoffs.',
          'Achieved 25% false positive reduction via continuous pattern tuning and feedback loops with detection engineering.',
          'Mapped threats to MITRE ATT&CK framework for actor attribution and campaign correlation.',
          'Correlated IoCs across campaigns to identify persistent threat actors and prevent reinfection.',
        ],
      },
      {
        title: 'Detection Improvement & Automation',
        icon: 'Zap',
        items: [
          'Reduced average response time from 4 hours to under 90 minutes via automated n8n pipelines.',
          'Implemented MCP-based threat intelligence pipelines to correlate CVEs, attacker TTPs, and OSINT indicators — reducing per-incident analysis time by 35%.',
          'Achieved 35% reduction in analysis time through automated IoC enrichment and correlation.',
          'Integrated APIs for automated threat intelligence enrichment and ticketing system synchronization.',
        ],
      },
      {
        title: 'Email Authentication & Domain Defense',
        icon: 'Shield',
        items: [
          'Secured 150+ domains with 98%+ authentication alignment (SPF/DKIM/DMARC).',
          'Achieved 60% reduction in spoofing incidents through strict DMARC policies (p=quarantine/reject).',
          'Coordinated 30+ lookalike domain takedown campaigns with registrars and hosting providers.',
          'Implemented continuous monitoring of 200+ domains for authentication drift and abuse.',
          'Built an end-to-end email infrastructure monitoring dashboard using Claude Code, providing real-time visibility across 1,277 active domains, 2,621 inboxes, and warmup health metrics — eliminating manual domain health checks entirely.',
        ],
      },
      {
        title: 'Playbooks & Customer Reporting',
        icon: 'FileText',
        items: [
          'Created and maintained incident response playbooks with step-by-step runbooks for common attack types.',
          'Reduced escalation errors by 30% through standardized procedures and clear decision trees.',
          'Delivered 150+ customer-facing security reports with actionable remediation steps.',
          'Published weekly and monthly threat summaries to stakeholders with trend analysis and recommendations.',
        ],
      },
    ],
  },
  {
    title: 'Junior Support Engineer',
    company: 'UnifyCX',
    location: 'Mysuru, India',
    period: 'Sep 2023 — Jul 2024',
    items: [
      'Strengthened hosted environment security posture by resolving 100+ weekly DNS, SSL/TLS, and email authentication issues — foundation for later specialization in email security infrastructure.',
      'Specialized in deliverability troubleshooting and security hardening for hosted environments.',
    ],
  },
  {
    title: 'Associate Software Developer',
    company: 'TekWorks',
    location: 'Vijayawada, India',
    period: 'Mar 2023 — Sep 2023',
    items: [
      'Built a hospital management system and responsive web UI; worked on API integration and testing workflows.',
    ],
  },
];

export const certifications = {
  core: [
    { title: 'Certified Cyber Criminologist', issuer: 'Virtual Cyber Labs', year: '2025', featured: true },
    { title: 'Proofpoint AI Email Security Specialist', issuer: 'Proofpoint', year: '2025', featured: true },
    { title: 'Effective AI for Practical SecOps Workflows', issuer: 'ISC2', year: '2025', featured: true },
    { title: 'Mastering Cyber Threat Intelligence for SOC Analysts', issuer: 'MCSI', year: '2025', featured: true },
    { title: 'DSPM Fundamentals', issuer: 'Fortra', year: '2025', featured: true },
    { title: 'Social Media Intelligence (SOCMINT)', issuer: 'CyberSudo', year: 'Mar 2026', featured: true },
    { title: 'Certified AI Security Expert', issuer: 'Virtual Cyber Labs', year: 'Mar 2026', featured: true },
  ],
  training: [
    { title: 'IntelVan 2025 Threat Intelligence & OSINT Masterclass', issuer: 'The OSINTion', year: '2025' },
    { title: 'CTRL. ALT. ACT. (Advanced OSINT Training)', issuer: 'Cyber Secured India', year: '2025' },
    { title: 'OpSec – Privacy for Security Professionals', issuer: 'Just Hacking', year: '2025' },
  ],
  bootcamps: [
    { title: 'MindStudio AI Agent Developer 3 Bootcamp', issuer: 'MindStudio', year: '2025' },
    { title: '7-Day Offensive Bootcamp', issuer: 'ZeroRisk Labs', year: '2025' },
  ],
  additional: [
    { title: 'Proofpoint AI Data Security Specialist', issuer: 'Proofpoint', year: '2025' },
    { title: 'Google Cloud Cybersecurity Certificate', issuer: 'Google', year: '2025' },
    { title: 'Multi-Cloud Blue Team Analyst (MCBTA)', issuer: 'CyberWarFare Labs', year: '2025' },
  ],
  internships: [
    { title: 'SOC Analyst Intern', issuer: 'Tracelay', year: '2024' },
    { title: 'Cloud Identity Security Intern', issuer: 'ZeroRisk Labs', year: '2025' },
  ],
  simulations: [
    { title: 'Mastercard - Cybersecurity', issuer: 'Forage', year: '2024' },
    { title: 'AIG - Shields Up: Cybersecurity', issuer: 'Forage', year: '2024' },
  ],
};

export const projects = [
  {
    title: 'Cloud-Based Ransomware Detection & Recovery (GCP)',
    description: 'A cloud security capstone focused on detection signals, recovery workflow design, and protective controls (logging, monitoring, and network hardening).',
    tags: ['GCP', 'Detection Engineering', 'Cloud Logging', 'Recovery'],
  },
  {
    title: 'Email Security Playbook & Investigation Framework',
    description: 'Structured triage and response process for phishing, spoofing, authentication gaps and domain abuse—built to be operational and repeatable.',
    tags: ['IR', 'Email Security', 'SPF/DKIM/DMARC', 'OSINT'],
  },
  {
    title: 'Automation-led Deliverability Monitoring',
    description: 'Workflow automation with n8n + AI agents to monitor sender reputation and authentication health, reducing manual investigation loops.',
    tags: ['n8n', 'AI Agents', 'Dashboards', 'Automation'],
  },
];

export const featuredArticles = [
  {
    title: 'How to Ensure Data Privacy in Cybersecurity',
    description: 'Strategic tips on data protection, encryption, and threat mitigation for modern enterprises.',
    source: 'DevX.com',
    category: 'Cybersecurity Insights',
    url: 'https://www.devx.com/cybersecurity/how-to-ensure-data-privacy-in-cybersecurity-key-protection-tips/',
  },
  {
    title: '15 Initiatives to Build a Strong Cybersecurity Culture',
    description: 'Comprehensive framework for establishing organizational cybersecurity awareness and incident response preparedness.',
    source: 'DevX.com',
    category: 'Cybersecurity Culture',
    url: 'https://www.devx.com/cybersecurity/15-initiatives-to-build-a-strong-cybersecurity-culture/',
  },
  {
    title: 'Featured Expert: OSINT & Threat Intelligence',
    description: 'Specialized expertise in OSINT, data security, threat intelligence, and email deliverability optimization.',
    source: 'Featured.com',
    category: 'Security Specialist',
    url: 'https://featured.com/p/pranith-jain',
  },
];

export const memberships = [
  {
    name: 'UK OSINT Community',
    abbreviation: 'UK',
    period: 'Jan 2026 – Present · 2 mos',
    description: 'Active contributor to one of the premier Open Source Intelligence communities, collaborating with investigators and researchers to advance ethical tradecraft.',
    details: [
      { label: 'Technical Development', text: 'Participate in CTF challenges and skill-building workshops focused on SOCMINT, GEOINT, and IMINT techniques.' },
      { label: 'Tradecraft Exchange', text: 'Test and validate OSINT tools for digital footprinting, ensuring adherence to OPSEC best practices.' },
      { label: 'Knowledge Sharing', text: 'Engage in roundtables on privacy frameworks, breach data analysis, and digital attribution.' },
    ],
    color: 'brand',
  },
  {
    name: 'Messaging, Malware, Mobile Anti-Abuse Working Group',
    abbreviation: 'M3',
    period: 'Feb 2026 – Present · 1 mo',
    description: 'Member of the M3AAWG, a global industry collaboration working to fight messaging abuse, malware, and mobile threats.',
    color: 'emerald',
  },
  {
    name: 'emailexpert',
    abbreviation: 'E',
    period: 'Jun 2025 – Present · 9 mos',
    description: 'Member of the emailexpert community, collaborating with email industry professionals on deliverability, authentication, and email security best practices.',
    color: 'cyan',
  },
];

export const navLinks = [
  { label: 'About', href: '#about' },
  { label: 'Skills', href: '#skills' },
  { label: 'Companies', href: '#companies' },
  {
    label: 'Experience',
    href: '#experience',
    children: [
      { label: 'Threat Investigation', href: '#experience-threat-investigation' },
      { label: 'Detection & Automation', href: '#experience-detection-automation' },
      { label: 'Email & Domain Defense', href: '#experience-domain-defense' },
      { label: 'Playbooks & Reporting', href: '#experience-playbooks' },
    ],
  },
  {
    label: 'Certifications',
    href: '#certifications',
    children: [
      { label: 'Core Certifications', href: '#certifications-core' },
      { label: 'Training', href: '#certifications-training' },
      { label: 'Bootcamps', href: '#certifications-bootcamps' },
      { label: 'Additional', href: '#certifications-additional' },
      { label: 'Internships', href: '#certifications-internships' },
      { label: 'Simulations', href: '#certifications-simulations' },
    ],
  },
  { label: 'Projects', href: '#projects' },
  { label: 'Featured', href: '#featured' },
  { label: 'Memberships', href: '#memberships' },
  { label: 'Contact', href: '#contact' },
];
