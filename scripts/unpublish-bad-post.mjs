#!/usr/bin/env node
/**
 * One-shot cleanup for the bogus "agentic North Korean APT Indian
 * government" blog post and any other trend-runner hallucination that
 * has been promoted to the public index. Two modes:
 *
 *   1. LIST MODE (no SLUGS env): fetches the admin posts index and
 *      prints any slugs that look like agentic-trends candidates
 *      (key prefix `agentic-` or candidateId.source = `agentic-trends`).
 *      Pass `--unpublish` to act on every match in the same run.
 *
 *   2. EXPLICIT MODE: SLUGS=a,b,c ADMIN_TOKEN=… unpublishes the given
 *      slugs.
 *
 * Both modes call the existing admin endpoint (no schema change, no
 * wrangler required). The handler in `api/src/routes/case-study-admin.ts`
 * cleans up the post record, the index entry, the schedule slot, and
 * every social:* KV key.
 *
 * Usage:
 *   ADMIN_TOKEN=… node scripts/unpublish-bad-post.mjs                                  # list
 *   ADMIN_TOKEN=… node scripts/unpublish-bad-post.mjs --unpublish                     # list + unpublish all matches
 *   SLUGS=foo,bar ADMIN_TOKEN=… node scripts/unpublish-bad-post.mjs                   # explicit
 *   BASE=https://staging.example.com node scripts/unpublish-bad-post.mjs              # non-prod target
 */

const BASE = process.env.BASE ?? 'https://pranithjain.qzz.io';
const TOKEN = process.env.ADMIN_TOKEN ?? process.env.BLOG_ADMIN_TOKEN;
if (!TOKEN) {
  console.error('ADMIN_TOKEN (or BLOG_ADMIN_TOKEN) is required');
  process.exit(2);
}

const args = new Set(process.argv.slice(2));
const ACT = args.has('--unpublish');

function isAgenticSlug(slug) {
  return slug.startsWith('agentic-');
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'x-admin-token': TOKEN,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function listPosts() {
  const data = await api('/api/v1/admin/case-study/posts');
  return data.posts ?? [];
}

async function unpublish(slug) {
  return api(`/api/v1/admin/case-study/posts/${encodeURIComponent(slug)}/unpublish`, {
    method: 'POST',
  });
}

async function main() {
  const explicit = (process.env.SLUGS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  let targets = explicit;
  if (targets.length === 0) {
    const posts = await listPosts();
    targets = posts.filter((p) => isAgenticSlug(p.slug)).map((p) => p.slug);
    console.log(`scanned ${posts.length} posts; ${targets.length} match /agentic-/`);
    for (const t of targets) console.log(`  · ${t}`);
    if (!ACT) {
      console.log('dry run. Re-run with --unpublish to act, or set SLUGS= to choose manually.');
      return;
    }
  }

  let ok = 0;
  for (const slug of targets) {
    try {
      await unpublish(slug);
      console.log(`✓ unpublished ${slug}`);
      ok += 1;
    } catch (e) {
      console.error(`✗ ${slug}  ${e.message}`);
    }
  }
  console.log(`done: ${ok}/${targets.length} unpublished`);
  process.exit(ok === targets.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
