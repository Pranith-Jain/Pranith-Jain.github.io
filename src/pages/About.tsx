import { About } from '../components/sections/About';
import { TimelineChapter } from '../components/sections/TimelineChapter';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { Featured, Memberships } from '../components/sections';
import { stats, featuredArticles, memberships } from '../data/content';
// Panda `css` is imported for one-off layout-only styling in this
// page (e.g. the section header eyebrow + max-width container). The
// recipes in src/styled/recipes.ts own the design tokens; this is
// for layout that doesn't repeat enough to warrant a recipe.
import { css } from '../../styled-system/css';

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

// Panda `css()` calls — one-off layout helpers. The design tokens
// (font-family, font-size, etc.) come from the `panda.config.ts`
// theme.extend.tokens block; these calls only describe layout that
// is unique to this page (max-width, spacing, font-mono, etc.).
// Promoting either to a recipe would add indirection without
// removing duplication — the same string doesn't appear elsewhere.
const styles = {
  story: css({ scrollMarginTop: '24' }),
  eyebrow: css({
    textTransform: 'uppercase',
    fontFamily: 'mono',
    color: 'slate.500',
    _dark: { color: 'slate.400' },
    letterSpacing: '0.2em',
    marginBottom: '3',
  }),
  h2: css({
    fontFamily: 'display',
    fontSize: { base: '3xl', sm: '4xl' },
    fontWeight: 'bold',
    letterSpacing: 'tight',
    color: 'slate.900',
    _dark: { color: 'white' },
  }),
  description: css({
    marginTop: '3',
    fontSize: { base: 'base', sm: 'lg' },
    color: 'muted',
    lineHeight: 'relaxed',
  }),
  headerContainer: css({ marginBottom: '10', maxWidth: '2xl' }),
};

export default function AboutPage() {
  useDocumentMeta({
    title: 'About',
    description:
      'Pranith Jain — security analyst and detection engineer. From email security at UnifyCX (200+ domains, 95% inbox placement) to shipping a free 60+ tool DFIR toolkit on Cloudflare Workers.',
    canonicalPath: '/about',
  });

  return (
    <>
      <h1 className="sr-only">About Pranith Jain</h1>

      <About stats={stats} />

      <section id="story" className={`mt-16 ${styles.story}`}>
        <div className={styles.headerContainer}>
          <div className={styles.eyebrow}>The Story</div>
          <h2 className={styles.h2}>How I got here</h2>
          <p className={styles.description}>From code to incidents: the path that shaped the work I do now.</p>
        </div>

        <div className="stagger space-y-12">
          {storyChapters.map((chapter) => (
            // Migrated from inline timeline markup to <TimelineChapter>
            // (Phase 3) — same visual output, the 3 instances are now
            // expressed declaratively. Layout-only utility strings
            // (mt-16, max-w-2xl, etc.) are still in the className for
            // the dual-pipeline period; they migrate to css() in Phase 4.
            <TimelineChapter key={chapter.period} period={chapter.period} tags={chapter.badges}>
              {chapter.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </TimelineChapter>
          ))}
        </div>
      </section>

      <div className="mt-16">
        <Featured featuredArticles={featuredArticles} />
      </div>
      <div className="mt-16">
        <Memberships memberships={memberships} />
      </div>
    </>
  );
}
