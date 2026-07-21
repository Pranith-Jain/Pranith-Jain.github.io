import { Hono } from 'hono';
import type { Env } from '../env';
import { requireAdminMiddleware } from '../lib/admin-auth';
import { safeJsonBody } from '../lib/safe-body';
import { getAi } from '../lib/ai-binding';
import { getSchedule } from '../case-study/storage/schedule';
import { listPostIndex } from '../case-study/storage/posts';
import { countAllCandidates } from '../case-study/storage/candidates';
import { countApproved } from '../case-study/storage/approved';
import { countFailures } from '../case-study/storage/failed';
import { generatePost } from '../case-study/generation';
import { putDraft } from '../case-study/storage/drafts';
import { generateLinkedinFromNotes, generateTwitterFromNotes } from '../case-study/generation/social';
import type { Candidate, CaseStudyType } from '../case-study/types';

import { candidatesRouter } from './admin/candidates';
import { approvedRouter } from './admin/approved';
import { scheduleRouter } from './admin/schedule';
import { socialRouter } from './admin/social';
import { draftsRouter } from './admin/drafts';
import { postsRouter } from './admin/posts';
import { failuresRouter } from './admin/failures';
import { inferenceRouter } from './admin/inference';
import { runRouter } from './admin/run';

export function registerAdminRoutes(app: Hono<{ Bindings: Env }>): void {
  const admin = new Hono<{ Bindings: Env }>();
  admin.use('*', requireAdminMiddleware);

  // ─── Generate content from custom input ─────────────────────────────
  admin.post('/generate', async (c) => {
    const parsed = await safeJsonBody<{
      title: string;
      content: string;
      formats?: string[];
      type?: string;
    }>(c, { maxBytes: 128 * 1024 });
    if ('error' in parsed) return parsed.error;
    const { title, content, formats: rawFormats, type } = parsed.value;

    if (!title?.trim()) return c.json({ error: 'title is required' }, 400);
    if (!content?.trim()) return c.json({ error: 'content is required' }, 400);

    const formats = rawFormats ?? ['linkedin', 'twitter'];
    const now = new Date();

    const slug = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);

    const result: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const fmt of formats) {
      try {
        if (fmt === 'blog') {
          const pseudo: Candidate = {
            key: `custom-${slug}`,
            type: (type as CaseStudyType | undefined) ?? 'analysis',
            title,
            rationale: title,
            score: 0.8,
            evidence: { userContent: content },
            discoveredAt: now.toISOString(),
            status: 'pending',
          };
          const post = await generatePost({
            candidate: pseudo,
            ai: getAi(c.env),
            now,
            groqKey: c.env.GROQ_API_KEY,
            googleKey: c.env.GOOGLE_AI_STUDIO_API_KEY,
          });
          await putDraft(c.env.CASE_STUDIES, post);
          result.blog = { slug: post.slug, title: post.title, status: 'draft' };
        } else if (fmt === 'linkedin') {
          const notes = { slug: `custom-${slug}`, title, body: content };
          const { linkedin, generatedAt, _validation } = await generateLinkedinFromNotes(
            notes,
            getAi(c.env),
            now,
            c.env.GROQ_API_KEY,
            c.env.GOOGLE_AI_STUDIO_API_KEY,
            c.env.NVIDIA_API_KEY as string | undefined
          );
          result.linkedin = { content: linkedin, generatedAt, validation: _validation };
        } else if (fmt === 'twitter') {
          const notes = { slug: `custom-${slug}`, title, body: content };
          const { twitter, generatedAt, _validation } = await generateTwitterFromNotes(
            notes,
            getAi(c.env),
            now,
            c.env.GROQ_API_KEY,
            c.env.GOOGLE_AI_STUDIO_API_KEY,
            c.env.NVIDIA_API_KEY as string | undefined
          );
          result.twitter = { content: twitter, generatedAt, validation: _validation };
        } else {
          errors.push(`unknown format: ${fmt}`);
        }
      } catch (err) {
        console.error('handler failed:', err instanceof Error ? err.message : String(err));
        errors.push(`${fmt}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return c.json({
      ok: errors.length === 0,
      slug: `custom-${slug}`,
      result,
      errors: errors.length > 0 ? errors : undefined,
    });
  });

  // ─── Health (counts + Groq connectivity test) ──────────────────────
  admin.get('/health', async (c) => {
    const ns = c.env.CASE_STUDIES;
    const [pendingCount, approvedCount, failureCount, schedule, postsIndex] = await Promise.all([
      countAllCandidates(ns),
      countApproved(ns),
      countFailures(ns),
      getSchedule(ns),
      listPostIndex(ns),
    ]);
    let groqTest: { ok: boolean; detail: string } | undefined;
    if (c.env.GROQ_API_KEY) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${c.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: 'hi' }],
            max_completion_tokens: 5,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const body = await r.text().catch(() => '');
        groqTest = r.ok
          ? { ok: true, detail: `HTTP ${r.status}` }
          : { ok: false, detail: `HTTP ${r.status}: ${body.slice(0, 120)}` };
      } catch (e) {
        console.error('handler failed:', e instanceof Error ? e.message : String(e));
        groqTest = { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    }

    return c.json({
      pendingCount,
      approvedCount,
      scheduleCount: schedule.length,
      failureCount,
      postsCount: postsIndex.length,
      approvalRequired: c.env.BLOG_APPROVAL_REQUIRED === 'true',
      secrets: {
        groq: !!c.env.GROQ_API_KEY,
        google: !!c.env.GOOGLE_AI_STUDIO_API_KEY,
        vulncheck: !!c.env.VULNCHECK_API_TOKEN,
      },
      groqTest,
    });
  });

  // Mount domain sub-routers
  admin.route('/', candidatesRouter);
  admin.route('/', approvedRouter);
  admin.route('/', scheduleRouter);
  admin.route('/', socialRouter);
  admin.route('/', draftsRouter);
  admin.route('/', postsRouter);
  admin.route('/', failuresRouter);
  admin.route('/', inferenceRouter);
  admin.route('/', runRouter);

  app.route('/api/v1/admin', admin);
}
