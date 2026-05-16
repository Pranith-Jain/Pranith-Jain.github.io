import type { Ai } from '@cloudflare/workers-types';
import type { Candidate, Post, PostSource } from '../types';
import { buildPrompt } from './templates';
import { runCompletion } from './ai-client';
import { postProcess } from './post-process';
import { renderHeroSvg } from './hero-svg';

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
  const t = [c.type];
  const ev = c.evidence as any;
  if (ev?.vendor) t.push(slugify(String(ev.vendor)));
  if (ev?.product) t.push(slugify(String(ev.product)));
  if (ev?.family) t.push(slugify(String(ev.family)));
  if (ev?.group) t.push(slugify(String(ev.group)));
  return Array.from(new Set(t)).filter(Boolean);
}

/** Extract source URLs from candidate evidence. */
function extractSources(evidence: Record<string, unknown>): PostSource[] {
  const sources: PostSource[] = [];
  const ev = evidence as any;

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
      if (typeof ev.titles[i] === 'string') sources[i].title = ev.titles[i];
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

  return sources;
}

export interface GeneratePostDeps {
  candidate: Candidate;
  ai: Ai;
  now: Date;
}

export async function generatePost(deps: GeneratePostDeps): Promise<Post> {
  const { candidate, ai, now } = deps;

  const sources = extractSources(candidate.evidence);

  const { system, user } = buildPrompt({
    type: candidate.type,
    title: candidate.title,
    facts: candidate.evidence,
    sources,
  });

  const completion = await runCompletion(ai, { system, user });

  const factsText = JSON.stringify(candidate.evidence);
  const processed = postProcess({ type: candidate.type, raw: completion.text, factsText });
  if (!processed.ok) {
    throw new Error(`validation failed: ${processed.errors.join('; ')}`);
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
    iocs: processed.iocs,
    tags: tagsFor(candidate),
    sources,
    quality: processed.quality,
  };
}
