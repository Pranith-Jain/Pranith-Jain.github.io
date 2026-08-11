import { Hono } from 'hono';
import type { Env } from '../../env';
import { badRequest, notFound } from '../../lib/api-error';
import { listPostIndex } from '../../case-study/storage/posts';
import { getPost, putPost } from '../../case-study/storage/posts';
import { auditPostLinks, fixPostLinks, liveDeepVerify, type PostAudit } from '../../lib/link-audit';
import { liveVerifyUrls } from '../../case-study/generation/verify-references';
import { validSlug } from './shared';

export const linkAuditRouter = new Hono<{ Bindings: Env }>();

/**
 * Per-invocation subrequest budget for one audit pass. Every URL costs up
 * to 2 subrequests (HEAD + one deep ranged GET when HEAD is 200 for the
 * soft-404 title sniff), and KV reads count toward the free-plan cap of
 * 50. 22 URLs × 2 probes + 2 KV reads keeps a single pass provably under
 * budget; the caller pages with `after` until `done` is true.
 */
const AUDIT_MAX_URLS = 22;

/**
 * Scan published posts for broken citations, in budgeted passes.
 * `GET /api/v1/admin/links/audit?after=<slug>` — walks the post index from
 * the cursor, deep-verifies citation URLs (soft-404 title sniff ON), and
 * returns the per-post breakdown. Repeat with the returned `nextAfter`
 * until `done`.
 */
linkAuditRouter.get('/links/audit', async (c) => {
  const after = c.req.query('after') ?? '';
  if (after !== '' && !validSlug(after)) return badRequest(c, 'invalid after cursor');

  const index = await listPostIndex(c.env.CASE_STUDIES);
  const ordered = [...index].sort((a, b) => a.slug.localeCompare(b.slug));
  const startIdx = after === '' ? 0 : ordered.findIndex((e) => e.slug > after);
  if (startIdx < 0) return c.json({ scanned: 0, done: true });

  const audits: PostAudit[] = [];
  let checked = 0;
  let verified = 0;
  let unchecked = 0;
  let broken = 0;
  let done = true;

  for (const entry of ordered.slice(startIdx)) {
    if (checked >= AUDIT_MAX_URLS) {
      done = false;
      break;
    }
    const post = await getPost(c.env.CASE_STUDIES, entry.slug);
    if (!post) continue;
    const budget = AUDIT_MAX_URLS - checked;
    const audit = await auditPostLinks(post, liveDeepVerify, budget);
    checked += audit.checked;
    verified += audit.verified;
    unchecked += audit.unchecked;
    broken += audit.broken;
    audits.push(audit);
  }

  const lastSlug = audits.length > 0 ? audits[audits.length - 1]!.slug : after;
  return c.json({
    scanned: audits.length,
    checked,
    verified,
    unchecked,
    broken,
    posts: audits,
    nextAfter: done ? undefined : lastSlug,
    done,
  });
});

/**
 * Repair one post's broken citations.
 * `POST /api/v1/admin/links/:slug/audit-fix` — runs the same deep probe as
 * the audit, prunes confirmed-dead URLs from `sources` and the body's
 * `## References` bullets (with the backing-off rule: never empty the
 * section), stamps the outcome on `linkVerification`, and persists.
 */
linkAuditRouter.post('/links/:slug/audit-fix', async (c) => {
  const slug = c.req.param('slug');
  if (!validSlug(slug)) return badRequest(c, 'invalid slug');
  const post = await getPost(c.env.CASE_STUDIES, slug);
  if (!post) return notFound(c, 'post not found');

  const result = await fixPostLinks(post, liveVerifyUrls);
  if (result.fixed) {
    await putPost(c.env.CASE_STUDIES, result.updated);
    // Keep the D1 search mirror (used by /blog search + briefings) in sync.
    c.executionCtx.waitUntil(
      import('../../case-study/storage/cs-posts-d1')
        .then(async ({ upsertCsPostD1 }) => {
          if (c.env.BRIEFINGS_DB) await upsertCsPostD1(c.env.BRIEFINGS_DB, result.updated);
        })
        .catch(() => {})
    );
  }
  return c.json({
    ok: true,
    fixed: result.fixed,
    backedOff: result.backedOff,
    droppedSources: result.droppedSources,
    droppedRefBullets: result.droppedRefBullets,
    verified: result.verified,
    unchecked: result.unchecked,
    broken: result.broken,
  });
});
