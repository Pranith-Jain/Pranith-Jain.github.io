import type { Ai } from '@cloudflare/workers-types';
import type { Candidate, Post, PostSource } from '../types';
import { buildPrompt, requiredSections } from './templates';
import { runCompletion } from './ai-client';
import { postProcess } from './post-process';
import { renderHeroSvg } from './hero-svg';
import { generateAiImage, buildHeroImagePrompt, buildBodyImagePrompt, injectBodyImage } from './ai-image';
import { validateIocsLive, type IocValidationEnv } from './ioc-live-validation';
import { verifyAndPruneReferences } from './verify-references';
import type { LinkStatus } from '../../lib/verify-url';

// ── Fact verification (pre-generation) ──────────────────────────────────

interface VerifiedFacts {
  cves: string[];
  iocs: string[];
  actors: string[];
  families: string[];
  techniques: string[];
  sectors: string[];
  countries: string[];
  dates: string[];
  summary: string;
}

const FACT_VERIFY_SYSTEM = `You are a fact extractor for a CTI pipeline. Given raw evidence from threat intelligence sources, extract and verify the key facts that can be used in a blog post.

RULES:
- Extract ONLY facts explicitly present in the evidence. Do NOT infer or invent.
- For CVEs: extract complete CVE IDs (CVE-YYYY-NNNNN). If a CVE is partial (e.g., "CVE-2024"), note it as incomplete.
- For IOCs: extract IPs, domains, hashes, URLs that appear in the evidence.
- For actors/groups: extract named threat actors or ransomware groups.
- For techniques: extract MITRE ATT&CK IDs (T1234 or T1234.567).
- For sectors/countries: extract mentioned sectors and countries.
- For dates: extract specific dates mentioned.
- Return a JSON object with these fields. Empty arrays are valid.

Output ONLY valid JSON, no markdown.`;

function buildFactVerifyPrompt(evidence: Record<string, unknown>): string {
  const evidenceStr = JSON.stringify(evidence, null, 2);
  return `<evidence>\n${evidenceStr.slice(0, 10000)}\n</evidence>\n\nExtract and verify all factual claims from this evidence.`;
}

/**
 * Pre-generation fact verification: extract structured facts from evidence
 * before writing. These verified facts are injected into the prompt to
 * ground the content generation in actual data.
 */
async function verifyFacts(
  evidence: Record<string, unknown>,
  ai: Ai,
  groqKey?: string,
  googleKey?: string
): Promise<VerifiedFacts | null> {
  try {
    const result = await runCompletion(
      ai,
      {
        system: FACT_VERIFY_SYSTEM,
        user: buildFactVerifyPrompt(evidence),
        maxTokens: 1500,
        temperature: 0.1,
      },
      { googleKey, groqKey, quality: true, preferGroq: true }
    );

    const text = result.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<VerifiedFacts>;
    return {
      cves: Array.isArray(parsed.cves) ? parsed.cves.filter((c) => /^CVE-\d{4}-\d{4,7}$/.test(c)) : [],
      iocs: Array.isArray(parsed.iocs) ? parsed.iocs.slice(0, 20) : [],
      actors: Array.isArray(parsed.actors) ? parsed.actors.slice(0, 10) : [],
      families: Array.isArray(parsed.families) ? parsed.families.slice(0, 10) : [],
      techniques: Array.isArray(parsed.techniques) ? parsed.techniques.filter((t) => /^T\d{4}(\.\d{3})?$/.test(t)) : [],
      sectors: Array.isArray(parsed.sectors) ? parsed.sectors.slice(0, 10) : [],
      countries: Array.isArray(parsed.countries) ? parsed.countries.slice(0, 10) : [],
      dates: Array.isArray(parsed.dates) ? parsed.dates.slice(0, 10) : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '',
    };
  } catch {
    return null; // Non-fatal — generation continues without verified facts
  }
}

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
      if (!section || typeof section !== 'object') continue;
      const findings = (section as Record<string, unknown>).findings;
      if (!Array.isArray(findings)) continue;
      for (const finding of findings) {
        if (finding && typeof finding === 'object' && 'vendor' in (finding as Record<string, unknown>)) {
          const v = (finding as Record<string, unknown>).vendor;
          if (typeof v === 'string' && vendors.size < 6) vendors.add(slugify(v));
        }
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
      if (!section || typeof section !== 'object') continue;
      const findings = (section as Record<string, unknown>).findings;
      if (!Array.isArray(findings)) continue;
      for (const finding of findings) {
        if (!finding || typeof finding !== 'object') continue;
        const f = finding as Record<string, unknown>;
        if (typeof f.source_url === 'string') {
          sources.push({ url: f.source_url, title: typeof f.source === 'string' ? f.source : '' });
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
  /** Google AI Studio API key for Gemini-based completion fallback. */
  googleKey?: string;
  /**
   * Optional threat-intel provider keys for layer-2 IOC validation
   * (VT/AbuseIPDB/abuse.ch). When any are set, every extracted IOC is
   * cross-checked at QA time and dropped if upstream returns "not
   * found" everywhere. When unset, the post-process layer-1 placeholder
   * filter is the only defence — still correct, just narrower coverage.
   */
  validationEnv?: IocValidationEnv;
  /**
   * Optional admin-supplied regeneration hints. Forwarded into the
   * user prompt so a manual "regenerate draft" can steer the rewrite
   * without a code change — e.g. "every References bullet MUST be a
   * markdown link to a real URL" or "drop the Sigma rule and replace
   * with an attack-flow chart".
   */
  notes?: string;
  /**
   * Injectable reference-URL verifier (HEAD checks). Defaults to the
   * real `verifyAndPruneReferences` HEAD verifier in production. Tests
   * pass a deterministic stub so generation stays hermetic. Maps each
   * URL to 'ok' (resolves), 'broken' (confirmed 4xx/5xx), or 'unchecked'
   * (transient network/timeout — kept on the benefit of the doubt).
   */
  verifyRefs?: (urls: string[]) => Promise<Map<string, LinkStatus>>;
  /**
   * Optional AI-illustration generation. When present + enabled, generatePost
   * produces a hero image and one in-body image via Workers AI, stores the
   * bytes through `put`, sets `heroImageUrl`, and injects the body image as
   * markdown. Absent/disabled → no images (the SVG hero is used). Every step
   * is best-effort: a generation failure silently falls back. `put` is
   * injected so the storage side stays out of this module.
   */
  aiImages?: {
    enabled: boolean;
    put: (slug: string, name: string, bytes: Uint8Array) => Promise<void>;
  };
}

export async function generatePost(deps: GeneratePostDeps): Promise<Post> {
  const { candidate, ai, now, groqKey, googleKey, notes } = deps;

  // ── Step 1: Verify facts before writing ──────────────────────────────
  // Extract structured facts from evidence to ground the content generation.
  const verifiedFacts = await verifyFacts(candidate.evidence, ai, groqKey, googleKey);

  const sources = extractSources(candidate.evidence);

  // Required section outline. Same source the postProcess uses,
  // so the model and the validator agree on the heading list.
  // Helps the rewrite path produce sections that survive the
  // missing-section check (the model often substitutes near-
  // equivalent headings that the strict validator rejects).
  // Wrapped in <required_outline> so the model sees it as a
  // structural constraint, not just a hint.
  const required = requiredSections(candidate.type);
  const outlineNote =
    required.length > 0
      ? `\n\n<required_outline>\nYour post MUST include these ## section headings (exact text, in this order). You may add more, but every one of these MUST appear:\n${required.map((s) => `- ${s}`).join('\n')}\n</required_outline>`
      : '';
  const { system, user } = buildPrompt({
    type: candidate.type,
    title: candidate.title,
    facts: candidate.evidence,
    sources,
  });

  // Inject verified facts into the prompt for grounding
  const factNote = verifiedFacts
    ? `\n\n<verified_facts>\nThese facts have been extracted and verified from the evidence. Use ONLY these facts (plus the ground truth data) when making specific claims:\n` +
      `CVEs: ${verifiedFacts.cves.length > 0 ? verifiedFacts.cves.join(', ') : 'none'}\n` +
      `Actors: ${verifiedFacts.actors.length > 0 ? verifiedFacts.actors.join(', ') : 'none'}\n` +
      `Families: ${verifiedFacts.families.length > 0 ? verifiedFacts.families.join(', ') : 'none'}\n` +
      `Techniques: ${verifiedFacts.techniques.length > 0 ? verifiedFacts.techniques.join(', ') : 'none'}\n` +
      `Sectors: ${verifiedFacts.sectors.length > 0 ? verifiedFacts.sectors.join(', ') : 'none'}\n` +
      `IOCs: ${verifiedFacts.iocs.length > 0 ? verifiedFacts.iocs.slice(0, 5).join(', ') + (verifiedFacts.iocs.length > 5 ? ` (+${verifiedFacts.iocs.length - 5} more)` : '') : 'none'}\n` +
      `</verified_facts>`
    : '';

  const notesBlock =
    notes && notes.trim()
      ? `\n\n<admin_notes>\nThe following guidance was supplied by the admin regenerating this draft. Honour it literally — do not soften or interpret loosely:\n${notes.trim()}\n</admin_notes>`
      : '';
  const completion = await runCompletion(
    ai,
    { system, user: user + factNote + outlineNote + notesBlock },
    { googleKey, groqKey, quality: true, preferGroq: true }
  );

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
          `${user + factNote + outlineNote + notesBlock}\n\nYOUR PREVIOUS DRAFT FAILED REVIEW: ${problems.join('; ')}.\n` +
          `Rewrite the FULL case study fixing every issue. Every section MUST start with "## " on its own line. ` +
          `Be specific and substantive (no thin sections, no repeated sentences, cite real sources). ` +
          `Only reference facts/CVEs present in the GROUND TRUTH DATA above; mark any historical CVE as context, not a finding.`,
      },
      { googleKey, groqKey, quality: true, preferGroq: true }
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

  // ── Reference-URL verification (final gate) ──────────────────────────
  // Every discovery runner's URLs converge here unverified — and the LLM
  // can invent article paths on otherwise-valid hosts (e.g.
  // bleepingcomputer.com/news/security/<fake-slug>) that the hostname-only
  // post-process filter happily keeps. HEAD-check the union of the post's
  // sources and its `## References` URLs and drop the confirmed-broken
  // ones from BOTH surfaces before they ship as clickable citations.
  const refCheck = await verifyAndPruneReferences({
    body: processed.body,
    sources,
    verify: deps.verifyRefs,
  });
  const finalBody = refCheck.body;
  const finalSources = refCheck.sources;
  if (
    refCheck.report.droppedSources > 0 ||
    refCheck.report.droppedRefBullets > 0 ||
    refCheck.report.broken.length > 0
  ) {
    console.log(
      JSON.stringify({
        job: 'generate-post',
        stage: 'reference-verification',
        candidate: candidate.key,
        checked: refCheck.report.checked,
        brokenCount: refCheck.report.broken.length,
        droppedSources: refCheck.report.droppedSources,
        droppedRefBullets: refCheck.report.droppedRefBullets,
        backedOff: refCheck.report.backedOff,
        broken: refCheck.report.broken.slice(0, 5),
      })
    );
  }

  const slug = `${candidate.key}-${slugify(candidate.title).slice(0, 40)}`.replace(/-+/g, '-');
  const hero = renderHeroSvg({ title: candidate.title, type: candidate.type });

  // ── AI illustrations (best-effort) ───────────────────────────────────
  // A hero image (preferred over the SVG banner on the blog page) + one
  // in-body image. Any failure falls back silently — never blocks publish.
  let heroImageUrl: string | undefined;
  let bodyWithImages = finalBody;
  if (deps.aiImages?.enabled) {
    const promptCtx = { title: candidate.title, type: candidate.type };
    try {
      const heroBytes = await generateAiImage(ai, buildHeroImagePrompt(promptCtx));
      if (heroBytes) {
        await deps.aiImages.put(slug, 'hero', heroBytes);
        heroImageUrl = `/api/v1/blog-image/${slug}/hero`;
      }
      const bodyBytes = await generateAiImage(ai, buildBodyImagePrompt(promptCtx));
      if (bodyBytes) {
        await deps.aiImages.put(slug, 'body1', bodyBytes);
        bodyWithImages = injectBodyImage(finalBody, `/api/v1/blog-image/${slug}/body1`, candidate.title);
      }
      console.log(
        JSON.stringify({
          job: 'generate-post',
          stage: 'ai-images',
          candidate: candidate.key,
          hero: !!heroImageUrl,
          body: bodyWithImages !== finalBody,
        })
      );
    } catch (err) {
      console.warn('ai-image generation failed (using SVG hero):', err instanceof Error ? err.message : String(err));
    }
  }

  return {
    slug,
    type: candidate.type,
    title: candidate.title,
    excerpt: excerptFrom(finalBody),
    publishedAt: now.toISOString(),
    candidateId: candidate.key,
    body: bodyWithImages,
    hero,
    heroImageUrl,
    iocs,
    tags: tagsFor(candidate),
    sources: finalSources,
    quality: processed.quality,
    qa: processed.qa,
    // Snapshot the candidate evidence so an admin can later hit
    // POST /api/v1/admin/drafts/:slug/regenerate?mode=rewrite and have
    // the model see the same facts the original draft was grounded in.
    // The publisher clears the candidate blob on success; without this
    // snapshot, rewrite mode would have to fall back to a candidate
    // reconstructed from the previous draft body.
    evidence: candidate.evidence,
  };
}
