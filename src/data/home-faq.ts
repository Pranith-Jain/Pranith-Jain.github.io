/**
 * On-page FAQ for the portfolio root (/). Five hand-counted Q&A pairs, each
 * 40-60 words, that answer the queries AI engines most often field about
 * Pranith Jain and the portfolio as a whole. The same array is consumed
 * twice:
 *   1. `FaqStructuredData` in Home.tsx emits the matching FAQPage JSON-LD.
 *   2. The <Faq> section renders the same answers to humans.
 * One source of truth, so the schema can never drift from the on-page text.
 */

export const HOME_FAQ: { question: string; answer: string }[] = [
  {
    question: 'Who is Pranith Jain?',
    answer:
      'Pranith Jain is a security analyst and detection engineer who investigates phishing, business email compromise, and commodity malware at scale. He has worked across 1,300-plus domains and 2,700-plus mailboxes, and triaged 250-plus incidents. He builds open, edge-native security tooling on Cloudflare Workers and writes case studies and threat-intel briefings on this site. Current focus: AI security and NHI governance.',
  },
  {
    question: 'What does this portfolio include?',
    answer:
      'Three parts. A profile with a brief, an experience timeline, a skills map, and case studies from real engagements. A free DFIR and Security Toolkit of 60-plus browser-side utilities for IOC checks, CVE triage, rule conversion, and email defense. And a live Threat Intelligence Platform that pulls 90-plus intel sources and correlates IOCs in real time.',
  },
  {
    question: 'Is the DFIR toolkit free?',
    answer:
      'Yes. The DFIR and Security Toolkit is free, with no signup, no rate-limit login, and no data egress from your browser. The static surface is hosted on Cloudflare Workers; each per-tool call hits the public API of the underlying source. A sponsorship page covers hosting and is optional, no credit card, no trial clock, no enterprise tier.',
  },
  {
    question: 'How does the Threat Intel Platform work?',
    answer:
      'The platform aggregates 30-plus open and commercial feeds covering ransomware leak sites, threat-actor channels, CVE publications, dark-web mentions, and social-media signals. A daily job normalises entries, cross-correlates IOCs, and writes the result to a Cloudflare D1 database. The surface renders the latest activity as a 3D globe, a ransomware tracker, an actor knowledge base, and a daily briefing.',
  },
  {
    question: 'How do I contact Pranith Jain?',
    answer:
      'Email is the documented channel: hello at pranithjain.qzz.io. The same address is used for collaboration, hiring conversations, and security disclosures. LinkedIn and X handles are listed on the contact section. A Cal.com booking link is available for scheduled calls. Phone is intentionally not listed to avoid the surface area of publishing a personal number publicly.',
  },
];
