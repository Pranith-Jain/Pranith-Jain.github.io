import type { Ai } from '@cloudflare/workers-types';
import type { Candidate, Post, PostSource } from '../types';
import { buildPrompt } from './templates';
import { runCompletion } from './ai-client';
import { postProcess } from './post-process';
import { renderHeroSvg } from './hero-svg';
import { validateIocsLive, type IocValidationEnv } from './ioc-live-validation';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function excerptFrom(body: string, max = 200): string {
  const stripped = body
    .replace(/^##.*$/gm, '')
    .replace(/[`*_>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length <= max ? stripped : stripped.slice(0, max - 1) + '…';
}

function tagsFor(c: Candidate): string[] {
  // Explicitly string[]: seeding with c.type (a CaseStudyType) would
  // otherwise infer CaseStudyType[] and reject the slugified pushes.
  const t: string[] = [c.type];
  const ev = c.evidence;
  if (ev?.vendor) t.push(slugify(String(ev.vendor)));
  if (ev?.product) t.push(slugify(String(ev.product)));
  if (ev?.family) t.push(slugify(String(ev.family)));
  if (ev?.group) t.push(slugify(String(ev.group)));
  if (Array.isArray(ev.mitre_techniques)) {
    for (const tech of ev.mitre_techniques.slice(0, 4)) {
      if (typeof tech === 'string') t.push(slugify(tech));
    }
  }
  // Vendors from briefing findings make good tags; CWEs do NOT — a weekly
  // briefing has hundreds, which dumped an unreadable `cwe-94cwe-20…` blob
  // on the post. Take a few distinct vendors only.
  if (Array.isArray(ev.sections)) {
    const vendors = new Set<string>();
    for (const section of ev.sections) {
      for (const finding of section.findings ?? []) {
        if (finding.vendor && vendors.size < 6) vendors.add(slugify(String(finding.vendor)));
      }
    }
    t.push(...vendors);
  }
  // Hard cap: tags are a compact label row, never a data dump.
  return Array.from(new Set(t)).filter(Boolean).slice(0, 12);
}

/** Extract source URLs from candidate evidence. */
function extractSources(evidence: Record<string, unknown>): PostSource[] {
  const sources: PostSource[] = [];
  const ev = evidence;

  // Actor discovery stores urls+titles arrays
  if (Array.isArray(ev.urls)) {
    for (const url of ev.urls) {
      if (typeof url === 'string' && url.startsWith('http')) {
        sources.push({ url, title: '' });
      }
    }
  }
  if (Array.isArray(ev.titles) && sources.length > 0) {
    for (let i = 0; i < Math.min(ev.titles.length, sources.length); i++) {
      const src = sources[i];
      if (src && typeof ev.titles[i] === 'string') src.title = ev.titles[i];
    }
  }

  // Ransomware discovery stores victims with url fields
  if (Array.isArray(ev.victims)) {
    for (const v of ev.victims) {
      if (v?.url && typeof v.url === 'string' && v.url.startsWith('http')) {
        sources.push({ url: v.url, title: `${v.victim ?? ''} — ${ev.group ?? ''}` });
      }
    }
  }

  // CVE discovery — add CISA KEV link
  if (ev.cveId) {
    sources.push({ url: `https://nvd.nist.gov/vuln/detail/${ev.cveId}`, title: `NVD — ${ev.cveId}` });
    sources.push({ url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', title: 'CISA KEV Catalog' });
  }

  // Breach/discovery might have a sourceUrl
  if (ev.sourceUrl && typeof ev.sourceUrl === 'string') {
    sources.push({ url: ev.sourceUrl, title: (ev.sourceTitle as string) ?? '' });
  }

  // Briefing evidence stores sources array and per-finding source_urls
  if (Array.isArray(ev.sources)) {
    for (const s of ev.sources) {
      if (typeof s === 'string' && s.startsWith('http')) {
        const title = s.includes('pranithjain.qzz.io/threatintel/briefings/')
          ? 'Live briefing page'
          : (s.replace(/https?:\/\//, '').split('/')[0] ?? s);
        sources.push({ url: s, title });
      }
    }
  }
  if (Array.isArray(ev.sections)) {
    for (const section of ev.sections) {
      for (const finding of section.findings ?? []) {
        if (finding.source_url && typeof finding.source_url === 'string') {
          sources.push({ url: finding.source_url, title: finding.source });
        }
      }
    }
  }

  return sources;
}

export interface GeneratePostDeps {
  candidate: Candidate;
  ai: Ai;
  now: Date;
  /** Groq free-tier key. When set, used as the quality primary; Workers AI
   *  is the fallback. Unset → Workers-AI-only (rate-limit-aware). */
  groqKey?: string;
  /**
   * Optional threat-intel provider keys for layer-2 IOC validation
   * (VT/AbuseIPDB/abuse.ch). When any are set, every extracted IOC is
   * cross-checked at QA time and dropped if upstream returns "not
   * found" everywhere. When unset, the post-process layer-1 placeholder
   * filter is the only defence — still correct, just narrower coverage.
   */
  validationEnv?: IocValidationEnv;
}

export async function generatePost(deps: GeneratePostDeps): Promise<Post> {
  const { candidate, ai, now, groqKey } = deps;

  const sources = extractSources(candidate.evidence);

  const { system, user } = buildPrompt({
    type: candidate.type,
    title: candidate.title,
    facts: candidate.evidence,
    sources,
  });

  const completion = await runCompletion(ai, { system, user }, { groqKey, quality: true });

  const factsText = JSON.stringify(candidate.evidence);
  let processed = postProcess({ type: candidate.type, raw: completion.text, factsText });

  // Self-heal: one targeted repair pass. Triggered by EITHER a structural
  // failure OR a content-QA failure (thin / unsourced / repetitive / low
  // score). The model gets one rewrite with the exact problems fed back,
  // instead of publishing sub-standard output or hard-failing immediately.
  const needsWork = (p: typeof processed) => !p.ok || (p.qa ? !p.qa.passed : false);
  if (needsWork(processed)) {
    const critical = processed.errors.filter((e) => !e.startsWith('missing section:') && !e.startsWith('warning:'));
    const problems = [
      ...critical,
      ...(processed.qa && !processed.qa.passed ? processed.qa.issues.map((i) => `QA: ${i}`) : []),
    ];
    const repair = await runCompletion(
      ai,
      {
        system,
        user:
          `${user}\n\nYOUR PREVIOUS DRAFT FAILED REVIEW: ${problems.join('; ')}.\n` +
          `Rewrite the FULL case study fixing every issue. Every section MUST start with "## " on its own line. ` +
          `Be specific and substantive (no thin sections, no repeated sentences, cite real sources). ` +
          `Only reference facts/CVEs present in the GROUND TRUTH DATA above; mark any historical CVE as context, not a finding.`,
      },
      { groqKey, quality: true }
    );
    processed = postProcess({ type: candidate.type, raw: repair.text, factsText });
  }

  if (!processed.ok) {
    throw new Error(`validation failed: ${processed.errors.join('; ')}`);
  }
  if (processed.qa && !processed.qa.passed) {
    throw new Error(`qa failed: ${processed.qa.issues.join('; ')}`);
  }

  // Layer-2 IOC validation — every IOC the post-process layer extracted
  // is cross-checked against threat-intel providers (VT, AbuseIPDB,
  // abuse.ch). IOCs that every provider explicitly says "not found"
  // are dropped from the post; providers that error keep the IOC
  // (we don't trust our own check). Pure no-op when no provider
  // keys are configured.
  let iocs = processed.iocs;
  if (deps.validationEnv) {
    const live = await validateIocsLive(processed.iocs, deps.validationEnv);
    iocs = live.iocs;
    if (live.droppedCount > 0) {
      console.log(
        JSON.stringify({
          job: 'generate-post',
          stage: 'ioc-live-validation',
          candidate: candidate.key,
          dropped: live.droppedCount,
          validated: live.validatedCount,
          skipped: live.skippedCount,
          reasons: live.dropReasons.slice(0, 5),
        })
      );
    }
  }

  const slug = `${candidate.key}-${slugify(candidate.title).slice(0, 40)}`.replace(/-+/g, '-');
  const hero = renderHeroSvg({ title: candidate.title, type: candidate.type });

  return {
    slug,
    type: candidate.type,
    title: candidate.title,
    excerpt: excerptFrom(processed.body),
    publishedAt: now.toISOString(),
    candidateId: candidate.key,
    body: processed.body,
    hero,
    iocs,
    tags: tagsFor(candidate),
    sources,
    quality: processed.quality,
    qa: processed.qa,
  };
}
