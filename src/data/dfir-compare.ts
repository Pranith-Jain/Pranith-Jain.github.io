/**
 * Comparison data for the /dfir/vs page. Each entry compares CRUCIBLE to a
 * single rival product on a fixed set of axes. Answers are 40-60 words to
 * satisfy the AEO answer-length ceiling; longer detail lives in the body
 * section. The same array is consumed twice:
 *   1. <FaqStructuredData> on the page emits FAQPage JSON-LD.
 *   2. The page renders the same Q&A pairs as a visible grid.
 */

export interface CompareEntry {
  /** Rival product name, displayed as the question. */
  rival: string;
  /** Rival's primary URL, rendered as a quiet reference link. */
  rivalUrl: string;
  /** One-sentence framing of what the rival is best at (non-judgmental). */
  rivalSummary: string;
  /** 40-60 word answer explaining when to use which. */
  answer: string;
}

export const COMPARE: CompareEntry[] = [
  {
    rival: 'VirusTotal',
    rivalUrl: 'https://www.virustotal.com',
    rivalSummary: '70+ AV engines plus a sandbox, the strongest single-sample verdict service.',
    answer:
      'VirusTotal aggregates 70-plus antivirus engines plus a sandbox and is the strongest single-sample verdict service available. CRUCIBLE is a browser-side companion focused on the analyst workflow around a sample. Use VirusTotal for hash-based verdicts and detonation. Use CRUCIBLE for cross-source IOC correlation, rule conversion, and email-header triage without uploading the sample.',
  },
  {
    rival: 'ANY.RUN',
    rivalUrl: 'https://any.run',
    rivalSummary: 'Interactive cloud sandbox with a strong free tier for Windows and Linux samples.',
    answer:
      'ANY.RUN is an interactive cloud sandbox with a strong free tier for Windows and Linux samples and excellent malware-config capture. CRUCIBLE does not detonate samples; it is a static, browser-side workbench for the triage steps that come before detonation. Use ANY.RUN for live detonation. Use CRUCIBLE for static IOC checks, rule conversion, and CVE prioritisation.',
  },
  {
    rival: 'Hybrid Analysis',
    rivalUrl: 'https://www.hybrid-analysis.com',
    rivalSummary: 'CrowdStrike-operated sandbox with strong malware family classification.',
    answer:
      'Hybrid Analysis is a CrowdStrike-operated sandbox with strong malware family classification and a generous free public submission quota. CRUCIBLE focuses on the workflow around a sample, not the sample itself. Use Hybrid Analysis for detonation and family classification. Use CRUCIBLE for static IOC enrichment, rule conversion, and email-header analysis without sending the artefact to a hosted sandbox.',
  },
  {
    rival: 'URLScan.io',
    rivalUrl: 'https://urlscan.io',
    rivalSummary: 'Public scan archive for URLs, with screenshot, DOM, and request-log capture.',
    answer:
      'URLScan.io is a public scan archive for URLs that captures a screenshot, the rendered DOM, and the full request log. CRUCIBLE delegates to URLScan.io from its Phishing Triage tool, so users get the same screenshot and resource data. CRUCIBLE adds cross-source IOC correlation and rule conversion on top, useful when a single URL scan is not enough.',
  },
];
