import React, { useState, useEffect } from 'react';

// REMOVE IFRAME that causes CSP issues - replace with a simpler contact section
const CONTACT = {
  email: 'pranithjainbp84@gmail.com',
  linkedIn: 'https://www.linkedin.com/in/pranithjain',
  calendly: 'https://calendly.com/pranithjain84/30min',
  location: 'Greater Bengaluru Area • UAE (Remote-friendly)',
};

const SKILLS = [
  {
    category: 'Email Deliverability & Security',
    items: ['SPF / DKIM / DMARC / BIMI', 'Domain reputation hardening', 'Inbox placement optimization', 'Email header & TLS/SMTP forensics'],
  },
  {
    category: 'Threat Intelligence & OSINT',
    items: ['MITRE ATT&CK mapping', 'Threat hunting (CTH)', 'Indicators validation', 'OSINT workflows & investigation'],
  },
  {
    category: 'Cloud Security (GCP/AWS/Azure)',
    items: ['IAM design', 'Zero Trust concepts', 'CSPM / DSPM / DLP', 'VPC controls & Cloud Armor'],
  },
  {
    category: 'Automation & AI',
    items: ['n8n workflow automation', 'AI agents & LLM tooling', 'Deliverability dashboards', 'Prompt engineering for investigations'],
  },
];

const EXPERIENCE = [
  {
    title: 'Email Deliverability and Security Specialist',
    org: 'Qubit Capital',
    period: 'Jul 2024 — Present',
    location: 'United Arab Emirates',
    bullets: [
      'Secure and operate email infrastructure for 2,000+ mailboxes across 1,000+ domains (Google Workspace, Microsoft Outlook).',
      'Implement SPF, DKIM, DMARC and BIMI; enforce strict MX/TLS policies; isolate domains to protect sender identity.',
      'Run forensic analysis using Postmaster telemetry and SMTP/TLS logs to detect reputation drift, spoofing and abuse patterns.',
      'Automate deliverability monitoring and investigation workflows using n8n + AI tooling to reduce manual effort and response time.',
    ],
    highlight: '96.78% inbox delivery • 25% reduction in spam placement',
  },
  {
    title: "Google Cloud Cybersecurity Scholar (GCLP '25)",
    org: 'Google Cloud Skills Boost',
    period: 'Jun 2025 — Sep 2025',
    location: 'Hands-on training program',
    bullets: [
      'Earned Google Cloud Cybersecurity Certificate and completed practical labs across IAM, VPC design, monitoring and incident response.',
      'Capstone: microservices security using Cloud Run, Cloud SQL and Cloud Armor.',
    ],
  },
  {
    title: 'Cloud Security Intern',
    org: 'ZeroRisk Labs',
    period: 'May 2025 — Jul 2025',
    location: 'Internship',
    bullets: [
      'Built cloud-based threat detection using Cloud Logging, BigQuery and Cloud Functions.',
      'Applied zero-trust network controls using custom firewall rules and VPC Service Controls.',
      'Studied enterprise security requirements (ISO 27001, SOC 2, GDPR, HIPAA).',
    ],
  },
  {
    title: 'SOC Analyst Intern',
    org: 'Tracelay',
    period: 'Jul 2024 — Oct 2024',
    location: 'Bengaluru, India',
    bullets: [
      'Monitored environments using NDR/XDR/EDR and SIEM tooling; analyzed alerts and escalated incidents.',
      'Contributed to threat intelligence reports and improved detection accuracy with external intel sources.',
    ],
  },
  {
    title: 'Junior Support Engineer',
    org: 'UnifyCX',
    period: 'Sep 2023 — Jul 2024',
    location: 'Mysuru, India',
    bullets: [
      'Resolved 100+ weekly tickets across DNS, email, WordPress and SSL/TLS issues with strong client satisfaction.',
      'Specialized in deliverability troubleshooting and security hardening for hosted environments.',
    ],
  },
  {
    title: 'Associate Software Developer',
    org: 'TekWorks',
    period: 'Mar 2023 — Sep 2023',
    location: 'Vijayawada, India',
    bullets: ['Built a hospital management system and responsive web UI; worked on API integration and testing workflows.'],
  },
];

const CERTIFICATIONS = [
  { name: 'Certified Cyber Criminologist', org: 'Virtual Cyber Labs', year: '2025' },
  { name: 'Proofpoint Certified AI Data Security Specialist', org: 'Proofpoint', year: '2025' },
  { name: 'Proofpoint Certified AI Email Security Specialist', org: 'Proofpoint', year: '2025' },
  { name: 'Proofpoint Certified Email Authentication Specialist', org: 'Proofpoint', year: '2025' },
  { name: 'Google Cloud Cybersecurity Certificate', org: 'Google', year: '2025' },
  { name: 'Certified Multi-Cloud Blue Team Analyst (MCBTA)', org: 'CyberWarFare Labs', year: '2025' },
  { name: 'Certified Network Security Practitioner (CNSP)', org: 'The SecOps Group', year: '2025' },
  { name: 'Certified MindStudio AI Agent Developer', org: 'MindStudio', year: '2025' },
  { name: 'OpSec – Privacy for Security Professionals', org: 'Just Hacking Training', year: '2025' },
];

const PROJECTS = [
  {
    title: 'Cloud-Based Ransomware Detection & Recovery (GCP)',
    description:
      'A cloud security capstone focused on detection signals, recovery workflow design, and protective controls (logging, monitoring, and network hardening).',
    tags: ['GCP', 'Detection Engineering', 'Cloud Logging', 'Recovery'],
  },
  {
    title: 'Email Security Playbook & Investigation Framework',
    description:
      'Structured triage and response process for phishing, spoofing, authentication gaps and domain abuse—built to be operational and repeatable.',
    tags: ['IR', 'Email Security', 'SPF/DKIM/DMARC', 'OSINT'],
  },
  {
    title: 'Automation-led Deliverability Monitoring',
    description:
      'Workflow automation with n8n + AI agents to monitor sender reputation and authentication health, reducing manual investigation loops.',
    tags: ['n8n', 'AI Agents', 'Dashboards', 'Automation'],
  },
];

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      
      const stored = localStorage.getItem('theme');
      const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      return stored ? stored === 'dark' : preferred;
    } catch (e) {
      console.warn('Theme initialization from localStorage failed:', e);
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      const stored = localStorage.getItem('theme');
      const preferred = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const shouldBeDark = stored ? stored === 'dark' : preferred;
      
      document.documentElement.classList.toggle('dark', shouldBeDark);
      setIsDark(shouldBeDark);
    } catch (e) {
      console.warn('Theme initialization failed:', e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      document.documentElement.classList.toggle('dark', isDark);
    } catch (e) {
      console.warn('Theme toggle failed:', e);
    }
  }, [isDark]);

  const toggle = () => {
    try {
      setIsDark((current) => {
        const next = !current;
        if (typeof window !== "undefined") {
          localStorage.setItem('theme', next ? 'dark' : 'light');
        }
        return next;
      });
    } catch (e) {
      console.error('Theme toggle error:', e);
    }
  };

  return { isDark, toggle };
}

function IconSun(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 2v2M12 20v2M4 12H2M22 12h-2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M21 12.8A8.5 8.5 0 0 1 11.2 3a7.2 7.2 0 1 0 9.8 9.8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Pill({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200">
      {children}
    </span>
  );
}

function SectionHeading({ kicker, title, subtitle }) {
  return (
    <div className="mx-auto mb-8 max-w-2xl text-center">
      {kicker ? (
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-brand-700 dark:text-brand-300">
          {kicker}
        </div>
      ) : null}
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle ? <p className="mt-3 text-slate-600 dark:text-slate-300">{subtitle}</p> : null}
    </div>
  );
}

function Card({ children, className = '' }) {
  return <div className={`glass rounded-2xl p-6 shadow-sm ${className}`}>{children}</div>;
}

export default function App() {
  const { isDark, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="bg-dot-grid">
        <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/65 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <a href="#top" className="group inline-flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-400 text-sm font-extrabold text-white shadow-glow">
                PJ
              </span>
              <span className="hidden text-sm font-semibold tracking-tight sm:inline">
                Pranith Jain<span className="text-slate-500 dark:text-slate-300"> • Portfolio</span>
              </span>
            </a>

            <nav className="hidden items-center gap-1 md:flex">
              {[
                ['About', 'about'],
                ['Skills', 'skills'],
                ['Experience', 'experience'],
                ['Certifications', 'certifications'],
                ['Projects', 'projects'],
                ['Contact', 'contact'],
              ].map(([label, id]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="rounded-full px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  {label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggle}
                className="grid h-10 w-10 place-items-center rounded-full border border-slate-200/60 bg-white/70 text-slate-700 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDark ? 'Light mode' : 'Dark mode'}
              >
                {isDark ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </header>

        <main id="top" className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6">
          <section className="grid items-start gap-10 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <Pill>Certified Cyber Criminologist</Pill>
                <Pill>Email Deliverability & Security</Pill>
                <Pill>OSINT • Threat Intel</Pill>
              </div>

              <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                Security that protects <span className="text-brand-700 dark:text-brand-300">reputation</span>,
                <br className="hidden sm:block" />
                visibility and delivery.
              </h1>

              <p className="mt-5 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
                I'm Pranith Jain — a Security Analyst focused on email infrastructure security and deliverability. I connect OSINT,
                telemetry and attacker behavior to actionable controls: from SPF/DKIM/DMARC hardening to cloud security operations,
                threat hunting and automation-led remediation.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href={CONTACT.calendly}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-400 px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
                >
                  Book a 30‑min meeting
                </a>
                <a
                  href={CONTACT.linkedIn}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200/60 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                >
                  View LinkedIn
                </a>
                <a
                  href={`mailto:${CONTACT.email}`}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200/60 bg-white/70 px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                >
                  Email me
                </a>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  { label: 'Inbox delivery', value: '96.78%+' },
                  { label: 'Mailboxes secured', value: '2,000+' },
                  { label: 'Domains managed', value: '1,000+' },
                ].map((stat) => (
                  <Card key={stat.label} className="p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {stat.label}
                    </div>
                    <div className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                      {stat.value}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            <aside className="space-y-4">
              <Card>
                <div className="text-sm font-semibold">Current focus</div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li>• Domain reputation & abuse protection</li>
                  <li>• Email authentication (SPF/DKIM/DMARC) & policy enforcement</li>
                  <li>• Threat intelligence + OSINT-driven investigations</li>
                  <li>• Automations with n8n, AI agents and dashboards</li>
                </ul>
              </Card>

              <Card>
                <div className="text-sm font-semibold">Contact</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="text-slate-600 dark:text-slate-300">{CONTACT.location}</div>
                  <a
                    href={`mailto:${CONTACT.email}`}
                    className="block font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {CONTACT.email}
                  </a>
                  <a
                    href={CONTACT.linkedIn}
                    target="_blank"
                    rel="noreferrer"
                    className="block font-medium text-brand-700 hover:underline dark:text-brand-300"
                  >
                    linkedin.com/in/pranithjain
                  </a>
                </div>
              </Card>

              <Card>
                <div className="text-sm font-semibold">Schedule</div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Want to discuss deliverability, threat intel, or cloud security ops? Pick a time that works.
                </p>
                <a
                  href={CONTACT.calendly}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                >
                  Open Calendly
                </a>
              </Card>
            </aside>
          </section>

          <section id="about" className="mt-20 scroll-mt-24">
            <SectionHeading kicker="About" title="Focused on email security & deliverability across domains" />
            <p className="mx-auto max-w-3xl text-center text-slate-600 dark:text-slate-300">
              I specialize in email authentication, domain reputation management, and threat intelligence to protect organizations from email-based threats while maintaining high deliverability rates.
            </p>
          </section>

          <section id="skills" className="mt-20 scroll-mt-24">
            <SectionHeading kicker="Skills" title="Core competencies" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
              {SKILLS.map((cat) => (
                <Card key={cat.category}>
                  <div className="text-sm font-semibold">{cat.category}</div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    {cat.items.map((item) => (
                      <li key={item} className="relative pl-4">
                        <span className="absolute left-0 text-brand-600 dark:text-brand-300">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>

          <section id="experience" className="mt-20 scroll-mt-24">
            <SectionHeading kicker="Experience" title="Career timeline" />
            <div className="grid gap-8">
              {EXPERIENCE.map((exp) => (
                <Card key={`${exp.org}-${exp.period}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-base font-semibold">{exp.title}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">
                        {exp.org} • {exp.location} • {exp.period}
                      </div>
                    </div>
                    {exp.highlight ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        {exp.highlight}
                      </span>
                    ) : null}
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    {exp.bullets.map((bullet, idx) => (
                      <li key={idx} className="relative pl-4">
                        <span className="absolute left-0 text-brand-600 dark:text-brand-300">•</span>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </section>

          <section id="certifications" className="mt-20 scroll-mt-24">
            <SectionHeading kicker="Certifications" title="Credentials & continuous learning" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CERTIFICATIONS.map((cert) => (
                <Card key={`${cert.name}-${cert.org}`}>
                  <div className="text-sm font-semibold">{cert.name}</div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {cert.org} • {cert.year}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section id="projects" className="mt-20 scroll-mt-24">
            <SectionHeading kicker="Projects" title="Recent work & initiatives" />
            <div className="grid gap-6">
              {PROJECTS.map((project) => (
                <Card key={project.title}>
                  <div className="text-base font-semibold">{project.title}</div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{project.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <Pill key={tag}>
                        <span className="text-xs">{tag}</span>
                      </Pill>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section id="contact" className="mt-20 scroll-mt-24">
            <SectionHeading kicker="Contact" title="Let's talk security" subtitle="Reach out to discuss email security, deliverability and threat intelligence challenges." />
            <div className="mx-auto max-w-3xl">
              <Card>
                <div className="text-center">
                  <div className="text-lg font-semibold mb-4">Get in Touch</div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
                    <a
                      href={CONTACT.linkedIn}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-500"
                    >
                      LinkedIn Profile
                    </a>
                    <a
                      href={`mailto:${CONTACT.email}`}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200/60 bg-white/70 px-6 py-3 text-sm font-semibold text-slate-800 transition hover:shadow-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-100"
                    >
                      Email Direct
                    </a>
                    <a
                      href={CONTACT.calendly}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                    >
                      Schedule Meeting
                    </a>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          <footer className="mt-20 border-t border-slate-200/60 py-8 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
            <div>© {new Date().getFullYear()} Pranith Jain. Built with React + Tailwind CSS.</div>
          </footer>
        </main>
      </div>
    </div>
  );
}
