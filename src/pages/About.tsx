import { About } from '../components/sections/About';
import { portfolioRepository } from '../infrastructure/repositories';
import { getProfileData } from '../core/use-cases';

const { stats } = getProfileData(portfolioRepository);

interface Chapter {
  period: string;
  paragraphs: string[];
  badges: string[];
}

const storyChapters: Chapter[] = [
  {
    period: '2022 — 2023 / The Foundation',
    paragraphs: [
      'My journey started at AiROBOSOFT as an AIML Intern, where I trained predictive-analytics models with Scikit-learn and Pandas — and learned the gap between a notebook that works and a model that ships.',
      'At TekWorks I built "Arogya", a hospital management system that replaced paper-and-Excel for an entire administrative team. Patient-record lookup went from hours to seconds. I owned the responsive front-end and the REST APIs underneath it.',
    ],
    badges: ['Python', 'React', 'REST APIs'],
  },
  {
    period: '2023 — 2024 / The Front Lines',
    paragraphs: [
      'At UnifyCX, email security found me the way it finds most people — because something was on fire. IP blacklisting and weak SMTP auth had tanked delivery for 200+ enterprise domains. I pulled them back to 95% inbox placement by hardening SPF, DKIM, and DMARC across the fleet. Failures dropped 40%+. I cleaned 60+ web assets, automated SSL/TLS renewals for 300+ domains, and learned that the right infrastructure fix prevents more incidents than any detection rule.',
      'My first SOC seat came at Tracelay as a SOC Analyst Intern. Tier-1 monitoring, alert pattern-matching, and the fundamental question that still drives my work: "what does this alert actually mean?"',
    ],
    badges: ['SPF/DKIM/DMARC', 'SOC', 'WAF', 'SSL/TLS'],
  },
  {
    period: '2024 — Present / Security Automation & AI',
    paragraphs: [
      'At Qubit Capital I own email security for 150+ early-stage startups. SPF, DKIM, and DMARC at 98%+ alignment across 1,300+ domains. Spoofing incidents down 60%. Built a real-time monitoring dashboard with Claude Code that replaced the Monday-morning manual health check.',
      '250+ phishing, BEC, and malware cases investigated. Header analysis, sandbox detonation, IOC pivots. False positives down 25%, analysis time down 35%, remediation above 90%. The n8n automation pipeline dropped mean response from 4 hours to under 75 minutes.',
      'Now I am deep in AI security and Non-Human Identity governance — areas where the attack surface is still being mapped. I have earned certifications in AI security from Proofpoint and Virtual Cyber Labs, because understanding the new attacker toolkit means learning it myself first.',
    ],
    badges: ['n8n Automation', 'AI Security', 'NHI Governance', 'Cloudflare'],
  },
];

export default function AboutPage() {
  return (
    <>
      <h1 className="sr-only">About Pranith Jain</h1>

      <About stats={stats} />

      <section id="story" className="mt-20 scroll-mt-24">
        <div className="mb-10 max-w-2xl">
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
            The Story
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
            How I got here
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
            From code to incidents: the path that shaped the work I do now.
          </p>
        </div>

        <div className="space-y-12">
          {storyChapters.map((chapter) => (
            <div key={chapter.period} className="relative pl-8 sm:pl-10">
              <div className="absolute left-0 top-1 bottom-0 w-px bg-slate-200 dark:bg-slate-800" />
              <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-brand-500 bg-white dark:bg-slate-900" />
              <div className="text-xs font-mono uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400 mb-3">
                {chapter.period}
              </div>
              <div className="space-y-4 text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                {chapter.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {chapter.badges.map((b) => (
                  <span
                    key={b}
                    className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1 text-[11px] font-mono text-slate-500 dark:text-slate-400"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

    </>
  );
}
