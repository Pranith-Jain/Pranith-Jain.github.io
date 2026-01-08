document.addEventListener('DOMContentLoaded', () => {
  // --- AOS Initialization ---
  AOS.init({
    duration: 800,
    easing: 'ease-in-out',
    once: true,
    mirror: false,
  });
});

// --- Alpine.js App Data ---
function appData() {
  return {
    darkMode: false,
    mobileMenuOpen: false,
    activeSection: 'dashboard',

    // Navigation items with mega menus
    navItems: [
      { id: 'dashboard', label: 'Dashboard' },
      { 
        id: 'overview', 
        label: 'Overview',
        children: [
          { id: 'about', label: 'About', icon: '👤', description: 'Learn more about me' },
          { id: 'experience', label: 'Experience', icon: '💼', description: 'My professional journey' },
          { id: 'skills', label: 'Skills', icon: '🛠️', description: 'Technical expertise' },
        ]
      },
      {
        id: 'portfolio',
        label: 'Portfolio',
        children: [
          { id: 'projects', label: 'Projects', icon: '🚀', description: 'Featured work' },
          { id: 'certifications', label: 'Certifications', icon: '🎓', description: 'Credentials' },
        ]
      },
      { id: 'contact', label: 'Contact' },
    ],

    // Sidebar navigation items
    sidebarItems: [
      { id: 'dashboard', label: 'Dashboard', icon: '📊', badge: null },
      { id: 'about', label: 'About Me', icon: '👤', badge: null },
      { id: 'experience', label: 'Experience', icon: '💼', badge: '5+' },
      { id: 'skills', label: 'Skills', icon: '🛠️', badge: null },
      { id: 'projects', label: 'Projects', icon: '🚀', badge: '12+' },
      { id: 'certifications', label: 'Certifications', icon: '🎓', badge: '8' },
      { id: 'contact', label: 'Contact', icon: '📧', badge: null },
    ],

    // Feature cards for dashboard
    features: [
      { 
        id: 1, 
        icon: '🛡️', 
        title: 'Email Security', 
        description: 'Protect outbound communication channels with advanced authentication protocols',
        aos: 'fade-up'
      },
      { 
        id: 2, 
        icon: '🎯', 
        title: 'Deliverability Optimization', 
        description: 'Maximize email deliverability rates through infrastructure hardening',
        aos: 'fade-up'
      },
      { 
        id: 3, 
        icon: '🔍', 
        title: 'Threat Intelligence', 
        description: 'OSINT-based threat detection and proactive security measures',
        aos: 'fade-up'
      },
      { 
        id: 4, 
        icon: '⚙️', 
        title: 'Infrastructure Hardening', 
        description: 'Secure GTM infrastructure and reputation telemetry systems',
        aos: 'fade-up'
      },
      { 
        id: 5, 
        icon: '📊', 
        title: 'Security Audits', 
        description: 'Comprehensive security assessments and vulnerability management',
        aos: 'fade-up'
      },
      { 
        id: 6, 
        icon: '🤝', 
        title: 'Consulting', 
        description: 'Strategic guidance on email security and deliverability best practices',
        aos: 'fade-up'
      },
    ],

    // Expertise tabs
    expertiseTabs: [
      {
        label: 'Email Security',
        title: 'Email Security & Deliverability',
        description: 'Specialized in protecting outbound email infrastructure, implementing SPF/DKIM/DMARC protocols, and maintaining high deliverability rates for enterprise clients.',
        skills: ['SPF/DKIM/DMARC', 'BIMI Implementation', 'Reputation Management', 'Deliverability Auditing', 'Email Authentication', 'Anti-Phishing']
      },
      {
        label: 'Threat Intelligence',
        title: 'OSINT & Threat Intelligence',
        description: 'Expert in Open Source Intelligence gathering, threat hunting, and proactive security measures to identify and mitigate emerging cyber threats.',
        skills: ['OSINT Tools', 'Threat Hunting', 'Vulnerability Assessment', 'Security Analytics', 'Threat Modeling', 'Risk Assessment']
      },
      {
        label: 'Cloud Security',
        title: 'Cloud Security & Infrastructure',
        description: 'Securing cloud-native environments, implementing zero-trust architectures, and hardening infrastructure for maximum resilience.',
        skills: ['Cloud Security', 'Zero Trust', 'Infrastructure Hardening', 'Network Security', 'Identity Management', 'Security Monitoring']
      },
      {
        label: 'Compliance',
        title: 'Compliance & Governance',
        description: 'Ensuring regulatory compliance and implementing governance frameworks across security operations.',
        skills: ['GDPR Compliance', 'SOC 2', 'ISO 27001', 'Security Policies', 'Audit Preparation', 'Risk Management']
      },
    ],

    // Professional experience
    experience: [
      {
        role: 'Security Analyst & Email Deliverability Expert',
        company: 'Independent Consultant',
        period: '2022 - Present',
        description: 'Helping 150+ global brands secure their outbound email infrastructure and maintain optimal deliverability rates. Specializing in reputation management and threat intelligence.',
        skills: ['Email Security', 'Deliverability', 'DMARC', 'Consulting']
      },
      {
        role: 'Cyber Security Analyst',
        company: 'Enterprise Security',
        period: '2020 - 2022',
        description: 'Led threat intelligence initiatives and implemented security measures to protect organizational assets. Conducted vulnerability assessments and security audits.',
        skills: ['Threat Intelligence', 'Security Analysis', 'Penetration Testing', 'Risk Assessment']
      },
      {
        role: 'Junior Security Engineer',
        company: 'Tech Solutions',
        period: '2019 - 2020',
        description: 'Assisted in implementing security controls and monitoring systems. Participated in incident response and security operations.',
        skills: ['Security Operations', 'Monitoring', 'Incident Response']
      },
    ],

    // Skill categories
    skillCategories: [
      {
        name: 'Email Security',
        icon: '📧',
        skills: ['SPF', 'DKIM', 'DMARC', 'BIMI', 'MIME-Defang', 'Postfix', 'Sendmail', 'Exim']
      },
      {
        name: 'Security Tools',
        icon: '🔐',
        skills: ['Wireshark', 'Nmap', 'Burp Suite', 'Metasploit', 'Snort', 'Suricata', 'OSSEC', 'Wazuh']
      },
      {
        name: 'Threat Intelligence',
        icon: '🎯',
        skills: ['Maltego', 'Shodan', 'Censys', 'VirusTotal', 'AbuseIPDB', 'Have I Been Pwned', 'SecurityTrails']
      },
      {
        name: 'Cloud & DevOps',
        icon: '☁️',
        skills: ['AWS', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'Git']
      },
      {
        name: 'Scripting & Automation',
        icon: '⚡',
        skills: ['Python', 'Bash', 'PowerShell', 'JavaScript', 'Git', 'CI/CD', 'API Integration']
      },
      {
        name: 'Network Security',
        icon: '🌐',
        skills: ['Firewall Rules', 'VPN', 'IDS/IPS', 'SIEM', 'Log Analysis', 'Network Forensics', 'Packet Analysis']
      },
    ],

    // Featured projects
    projects: [
      {
        icon: '🛡️',
        title: 'Enterprise Email Security Platform',
        description: 'Developed a comprehensive email security solution with real-time threat detection and automated SPF/DKIM/DMARC validation for enterprise clients.',
        tech: ['Python', 'Django', 'PostgreSQL', 'Redis', 'Docker'],
        status: 'Active'
      },
      {
        icon: '📊',
        title: 'Deliverability Analytics Dashboard',
        description: 'Built a real-time analytics dashboard to track email deliverability metrics, sender reputation scores, and campaign performance across multiple domains.',
        tech: ['React', 'Node.js', 'GraphQL', 'InfluxDB', 'Grafana'],
        status: 'Active'
      },
      {
        icon: '🔍',
        title: 'OSINT Threat Intelligence Tool',
        description: 'Created an automated OSINT gathering tool that aggregates threat data from multiple sources and generates actionable intelligence reports.',
        tech: ['Python', 'Elasticsearch', 'Kibana', 'APIs', 'Machine Learning'],
        status: 'Active'
      },
      {
        icon: '⚙️',
        title: 'Infrastructure Hardening Framework',
        description: 'Developed an automated infrastructure hardening framework that applies security best practices across cloud environments and on-premises systems.',
        tech: ['Terraform', 'Ansible', 'Python', 'CIS Benchmarks', 'AWS IAM'],
        status: 'Completed'
      },
      {
        icon: '🎯',
        title: 'Phishing Simulation Platform',
        description: 'Built a phishing awareness and simulation platform to train employees on email security best practices and measure susceptibility rates.',
        tech: ['Vue.js', 'Node.js', 'MongoDB', 'SendGrid API'],
        status: 'Completed'
      },
      {
        icon: '📈',
        title: 'Security Metrics Pipeline',
        description: 'Implemented a security metrics collection and visualization pipeline to track key performance indicators and compliance status.',
        tech: ['Prometheus', 'Grafana', 'Python', 'Custom Scripts'],
        status: 'Active'
      },
    ],

    // Certifications
    certifications: [
      {
        icon: '🎓',
        name: 'Certified Cyber Criminologist',
        issuer: 'Cyber Crime Investigation Bureau',
        year: '2023'
      },
      {
        icon: '🔐',
        name: 'CEH - Certified Ethical Hacker',
        issuer: 'EC-Council',
        year: '2022'
      },
      {
        icon: '📧',
        name: 'Email Deliverability Specialist',
        issuer: 'Return Path',
        year: '2022'
      },
      {
        icon: '☁️',
        name: 'AWS Security Specialty',
        issuer: 'Amazon Web Services',
        year: '2021'
      },
      {
        icon: '🛡️',
        name: 'CompTIA Security+',
        issuer: 'CompTIA',
        year: '2020'
      },
      {
        icon: '🔍',
        name: 'OSINT Professional',
        issuer: 'SANS Institute',
        year: '2020'
      },
      {
        icon: '📊',
        name: 'Google Cloud Security',
        issuer: 'Google Cloud',
        year: '2021'
      },
      {
        icon: '🎖️',
        name: 'ISO 27001 Lead Implementer',
        issuer: 'PECB',
        year: '2022'
      },
    ],

    // Theme toggle functionality
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

    // Initialize theme from localStorage or system preference
    init() {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark') {
        this.darkMode = true;
        document.documentElement.classList.add('dark');
      } else if (savedTheme === 'light') {
        this.darkMode = false;
        document.documentElement.classList.remove('dark');
      } else {
        // Use system preference
        this.darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (this.darkMode) {
          document.documentElement.classList.add('dark');
        }
      }
    },
  };
}

// Initialize the app - make sure Alpine is loaded first
window.addEventListener('load', () => {
  if (typeof Alpine !== 'undefined') {
    Alpine.data('appData', appData);
  }
});
