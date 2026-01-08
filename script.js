document.addEventListener('DOMContentLoaded', () => {
  AOS.init({
    duration: 800,
    easing: 'ease-in-out',
    once: true,
    mirror: false,
  });
});

function appData() {
  return {
    darkMode: false,
    sidebarOpen: false,
    activeSection: 'dashboard',

    navItems: [
      { id: 'dashboard', label: 'Dashboard', icon: '📊' },
      { id: 'about', label: 'About', icon: '👤' },
      { id: 'experience', label: 'Experience', icon: '💼', badge: '3' },
      { id: 'certifications', label: 'Certifications', icon: '🎓', badge: '15+' },
      { id: 'projects', label: 'Projects', icon: '🚀', badge: '3' },
      { id: 'featured', label: 'Featured', icon: '⭐', badge: '3' },
      { id: 'contact', label: 'Contact', icon: '📧' },
    ],

    secondaryNav: [
      { id: 'dashboard', label: 'Home' },
      { id: 'about', label: 'About' },
      { id: 'experience', label: 'Experience' },
      { id: 'certifications', label: 'Certifications' },
      { id: 'projects', label: 'Projects' },
      { id: 'featured', label: 'Featured' },
      { id: 'contact', label: 'Contact' },
    ],

    get currentSectionTitle() {
      const titles = {
        dashboard: 'Dashboard',
        about: 'About Me',
        experience: 'Career Timeline',
        certifications: 'Credentials',
        projects: 'Recent Work',
        featured: 'Expert Features',
        contact: 'Get In Touch',
      };
      return titles[this.activeSection] || 'Dashboard';
    },

    get currentSectionSubtitle() {
      const subtitles = {
        dashboard: 'Overview of your security platform',
        about: 'Professional profile and background',
        experience: 'Work history and achievements',
        certifications: 'Training and credentials',
        projects: 'Featured initiatives and contributions',
        featured: 'Industry recognition and publications',
        contact: 'Reach out for consultations',
      };
      return subtitles[this.activeSection] || '';
    },

    skills: [
      {
        id: 1,
        icon: '🛡️',
        title: 'Email Security',
        delay: 0,
        items: [
          'SPF/DKIM/DMARC/BIMI Implementation',
          'Inbox Placement Optimization',
          'Reputation Management',
          'Phishing & Spoofing Mitigation',
          'Domain Abuse Monitoring',
        ]
      },
      {
        id: 2,
        icon: '🎯',
        title: 'Threat Intelligence',
        delay: 100,
        items: [
          'Threat hunting & DFIR workflows',
          'Indicator of Compromise (IoC) analysis',
          'Dark web monitoring & intel',
          'Malware behavior analysis',
        ]
      },
      {
        id: 3,
        icon: '👤',
        title: 'OSINT & Investigations',
        delay: 200,
        items: [
          'Advanced Digital Footprinting',
          'Crypto & Blockchain tracing',
          'Social engineering risk analysis',
          'People & Entity investigations',
        ]
      },
      {
        id: 4,
        icon: '🛡️',
        title: 'Security Operations',
        delay: 300,
        items: [
          'ExtraHop NDR & Sophos XDR',
          'EDR & SIEM (Sumo Logic, ELK)',
          'SOC operations & alert analysis',
          'Vulnerability management',
        ]
      },
      {
        id: 5,
        icon: '☁️',
        title: 'Cloud Security',
        delay: 400,
        items: [
          'IAM design & Zero Trust',
          'CSPM / DSPM / DLP',
          'VPC controls & Cloud Armor',
          'GCP/AWS/Azure environments',
        ]
      },
      {
        id: 6,
        icon: '⚡',
        title: 'Automation & AI',
        delay: 500,
        items: [
          'n8n workflow automation',
          'AI agents & LLM tooling',
          'Deliverability monitoring bots',
          'Custom reputation dashboards',
        ]
      },
    ],

    companies: [
      'Alphasearch', 'BlendHealth', 'Axolotl Biosciences', 'Blue Vision Capital',
      'MoneyVerse', 'Doctor Assistant', 'HealthSpectra AI', 'Query Health',
      'Carbon Neutral Homes', 'VoltPath', 'Sentient Trader', 'SwyftFin',
    ],

    experience: [
      {
        role: 'Email Deliverability and Security Specialist',
        company: 'Qubit Capital',
        period: 'Jul 2024 — Present',
        achievement: '96.78% inbox delivery • 25% reduction in spam placement',
        details: [
          'Architect and secure high-volume outbound email infrastructure for lead generation, cold email and investor outreach across 2,000 plus mailboxes and 1,000 plus domains on Google Workspace and Microsoft Outlook. Own SPF, DKIM, DMARC and BIMI implementation. Enforce strict MX and TLS policies, domain isolation and transport security to protect sender identity, brand visibility and inbox trust.',
          'Design and execute domain and mailbox warmup strategies. Calibrate ramp curves, daily volumes, reply simulation and engagement ratios. Define campaign-level sending limits segmented by domain, mailbox and persona. Continuously adjust based on inbox placement, throttling signals and reputation telemetry.',
          'Perform forensic deliverability and abuse analysis using Google Postmaster Tools, MailReach, GlockApps and SMTP or TLS logs. Detect anomalous sending behavior, reputation drift, spoofing attempts and mailbox provider enforcement patterns. Lead remediation that improved inbox placement and reply rates.',
          'Build and harden outbound GTM infrastructure for 150 plus startups and enterprises across AI, HealthTech, FinTech, Energy and SaaS. Supported brands include AlphaSearch, BlendHealth, Axolotl Biosciences, Blue Vision Capital and MoneyVerse. Create and maintain an email deliverability dashboard to centralize inbox health, reputation signals and campaign performance for faster diagnosis and decision-making.',
          'Apply AI and automation across deliverability and GTM workflows using GenAI, prompt engineering, agentic browsing, n8n automation and App Script. Automate warmup governance, monitoring, alerting and remediation. Maintain Email Security and Deliverability Playbook covering phishing risk, domain abuse and compliant cold outreach.',
        ]
      },
      {
        role: 'Junior Support Engineer',
        company: 'UnifyCX',
        period: 'Sep 2023 — Jul 2024',
        achievement: null,
        details: [
          'Resolved 100+ weekly tickets across DNS, email, WordPress and SSL/TLS issues with strong client satisfaction.',
          'Specialized in deliverability troubleshooting and security hardening for hosted environments.',
        ]
      },
      {
        role: 'Associate Software Developer',
        company: 'TekWorks',
        period: 'Mar 2023 — Sep 2023',
        achievement: null,
        details: [
          'Built a hospital management system and responsive web UI; worked on API integration and testing workflows.',
        ]
      },
    ],

    certifications: [
      { category: 'Advanced Training', name: 'CTRL. ALT. ACT. (Advanced OSINT Training)', issuer: 'Cyber Secured India', period: 'Nov 2025 - Oct 2025' },
      { category: 'Bootcamp', name: 'MindStudio AI Agent Developer 3 Bootcamp', issuer: 'MindStudio', period: 'Aug 2025 - Sept 2025' },
      { category: 'Certification', name: 'Certified Cyber Criminologist', issuer: 'Virtual Cyber Labs', period: 'Oct 2025 - Dec 2025' },
      { category: 'Scholarship', name: 'Google Cloud Cybersecurity Scholar (GCLP \'25)', issuer: 'Google Cloud Skills Boost', period: 'Jun 2025 - Sep 2025' },
      { category: 'Internship', name: 'Cloud Security Intern', issuer: 'ZeroRisk Labs', period: 'May 2025 - Jul 2025' },
      { category: 'Internship', name: 'SOC Analyst Intern', issuer: 'Tracelay', period: 'Jul 2024 - Oct 2024' },
      { category: 'Bootcamp', name: '7-Day Offensive Bootcamp', issuer: 'ZeroRisk Labs', period: 'May 2025' },
      { category: 'Internship', name: 'HCS - Penetration Testing Internship', issuer: 'Hacktify', period: 'Feb 2025' },
      { category: 'Internship', name: 'Cybersecurity Internship', issuer: 'The Red Users', period: 'Nov 2024' },
      { category: 'Job Simulation', name: 'AIG - Shields Up: Cybersecurity', issuer: 'Forage', period: 'Jun 2024' },
      { category: 'Job Simulation', name: 'Verizon - Cloud Platform', issuer: 'Forage', period: 'Jun 2024' },
      { category: 'Job Simulation', name: 'Mastercard - Cybersecurity', issuer: 'Forage', period: 'Jun 2024' },
      { category: 'Lab Work', name: 'SOC Labs', issuer: 'LetsDefend', period: 'June 2024 - Sept 2024' },
      { category: 'Threat Analysis', name: 'Threat Analysis Training', issuer: 'Picus Security', period: 'July 2024 - Sept 2024' },
      { category: 'Certification', name: 'Proofpoint Certified AI Data Security Specialist', issuer: 'Proofpoint', period: '2025' },
      { category: 'Certification', name: 'Proofpoint Certified AI Email Security Specialist', issuer: 'Proofpoint', period: '2025' },
      { category: 'Certification', name: 'Proofpoint Certified Email Authentication Specialist', issuer: 'Proofpoint', period: '2025' },
      { category: 'Certification', name: 'Google Cloud Cybersecurity Certificate', issuer: 'Google', period: '2025' },
      { category: 'Certification', name: 'Multi-Cloud Blue Team Analyst (MCBTA)', issuer: 'CyberWarFare Labs', period: '2025' },
      { category: 'Certification', name: 'Network Security Practitioner (CNSP)', issuer: 'The SecOps Group', period: '2025' },
      { category: 'Training', name: 'OpSec – Privacy for Security Professionals', issuer: 'Just Hacking Training', period: '2025' },
    ],

    projects: [
      {
        title: 'Cloud-Based Ransomware Detection & Recovery (GCP)',
        description: 'A cloud security capstone focused on detection signals, recovery workflow design, and protective controls (logging, monitoring, and network hardening).',
        technologies: ['GCP', 'Detection Engineering', 'Cloud Logging', 'Recovery'],
      },
      {
        title: 'Email Security Playbook & Investigation Framework',
        description: 'Structured triage and response process for phishing, spoofing, authentication gaps and domain abuse—built to be operational and repeatable.',
        technologies: ['IR', 'Email Security', 'SPF/DKIM/DMARC', 'OSINT'],
      },
      {
        title: 'Automation-led Deliverability Monitoring',
        description: 'Workflow automation with n8n + AI agents to monitor sender reputation and authentication health, reducing manual investigation loops.',
        technologies: ['n8n', 'AI Agents', 'Dashboards', 'Automation'],
      },
    ],

    featured: [
      {
        url: 'https://www.devx.com/cybersecurity/how-to-ensure-data-privacy-in-cybersecurity-key-protection-tips/',
        letter: 'D',
        type: 'Published Article',
        title: 'How to Ensure Data Privacy in Cybersecurity',
        description: 'Strategic tips on data protection, encryption, and threat mitigation for modern enterprises.',
        platform: 'DevX.com',
        category: 'Cybersecurity Insights',
      },
      {
        url: 'https://www.devx.com/cybersecurity/15-initiatives-to-build-a-strong-cybersecurity-culture/',
        letter: 'D',
        type: 'Published Article',
        title: '15 Initiatives to Build a Strong Cybersecurity Culture',
        description: 'Comprehensive framework for establishing organizational cybersecurity awareness and incident response preparedness.',
        platform: 'DevX.com',
        category: 'Cybersecurity Culture',
      },
      {
        url: 'https://featured.com/p/pranith-jain',
        letter: 'F',
        type: 'Expert Profile',
        title: 'Featured Expert: OSINT & Threat Intelligence',
        description: 'Specialized expertise in OSINT, data security, threat intelligence, and email deliverability optimization.',
        platform: 'Featured.com',
        category: 'Security Specialist',
      },
    ],

    toggleTheme() {
      this.darkMode = !this.darkMode;
      if (this.darkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    },

    init() {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark') {
        this.darkMode = true;
        document.documentElement.classList.add('dark');
      } else if (savedTheme === 'light') {
        this.darkMode = false;
        document.documentElement.classList.remove('dark');
      } else {
        this.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (this.darkMode) {
          document.documentElement.classList.add('dark');
        }
      }
    },
  };
}
