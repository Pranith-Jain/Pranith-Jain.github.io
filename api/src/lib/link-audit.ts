/**
 * On-demand link validator for the case-study pipeline.
 *
 * The publish path prunes only *confirmed*-broken citations (404/410/
 * NXDOMAIN) to protect live references behind WAFs. That leniency is
 * correct for generation, but it lets fabricated URLs survive when the
 * discovery LLM invents article slugs on hosts that answer HEAD 200 for
 * any path — the audit closes that gap by deep-verifying every citation
 * surface of a stored post (sources + `## References` body bullets) with
 * the title-sniff soft-404 probe ON, and repairing the post by running
 * the exact same prune logic the generation gate already uses
 * (`verifyAndPruneReferences`).
 *
 * Subrequest budget: every URL costs up to 2 subrequests (HEAD + one deep
 * ranged GET only when HEAD is 200). The caller slices the scan so a
 * single invocation stays within the free-plan 50-subrequest cap.
 */

import { verifyUrls, type LinkStatus, type VerifyResult } from './verify-url';
import { verifyAndPruneReferences, extractReferenceUrls } from '../case-study/generation/verify-references';
import type { Post, PostSource } from '../case-study/types';

export interface AuditPostUrl {
  url: string;
  surface: 'source' | 'reference';
}

/** Extract the full citation surface of a post: the `sources[]` list plus
 *  every URL in a `## References` section of the body. De-duped,
 *  first-seen-order preserved, http(s) only. */
export function extractAuditUrls(post: Pick<Post, 'sources' | 'body'>): AuditPostUrl[] {
  const out: AuditPostUrl[] = [];
  const seen = new Set<string>();
  const push = (url: string, surface: AuditPostUrl['surface']) => {
    if (!/^https?:\/\//i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, surface });
  };
  const sources = (post.sources ?? []) as PostSource[];
  for (const s of sources) push(s.url, 'source');
  for (const u of extractReferenceUrls(post.body ?? '')) push(u, 'reference');
  return out;
}

export interface PostAudit {
  slug: string;
  title: string;
  type: string;
  /** Count of URLs whose deep probe answered 2xx with a real page. */
  verified: number;
  /** Count that could not be confirmed dead (WAF / timeout / probe error). */
  unchecked: number;
  /** Confirmed dead: 404/410, soft-404 (root redirect + title sniff), NXDOMAIN. */
  broken: number;
  brokenUrls: string[];
  checked: number;
  /** Present when the audit hit its per-invocation URL cap mid-post. */
  truncated?: boolean;
  /** Verdicts per URL — the raw evidence behind the counts. */
  statuses: Record<string, LinkStatus>;
}

/**
 * Deep-verify one post's citation surface. Every URL is probed with the
 * soft-404 title sniff ON (HEAD, plus a ranged GET when HEAD is 200) —
 * the same machinery `verifyUrl` exposes with `deepSoft404: true`. The
 * probe never deletes anything; the caller decides.
 */
export async function auditPostLinks(
  post: Pick<Post, 'slug' | 'title' | 'type' | 'sources' | 'body'>,
  verify: (urls: string[]) => Promise<Map<string, VerifyResult>>,
  maxUrls: number
): Promise<PostAudit> {
  const all = extractAuditUrls(post);
  const entries = all.slice(0, maxUrls);
  const truncated = entries.length < all.length;
  const statuses: Record<string, LinkStatus> = {};
  let verified = 0;
  let unchecked = 0;
  const broken: string[] = [];
  if (entries.length > 0) {
    const results = await verify(entries.map((e) => e.url));
    for (const { url } of entries) {
      const r = results.get(url);
      const s: LinkStatus = r?.linkStatus ?? (r?.ok ? 'ok' : 'unchecked');
      statuses[url] = s;
      if (s === 'ok') verified += 1;
      else if (s === 'broken') broken.push(url);
      else unchecked += 1;
    }
  }
  return {
    slug: post.slug,
    title: post.title,
    type: post.type,
    verified,
    unchecked,
    broken: broken.length,
    brokenUrls: broken,
    checked: entries.length,
    truncated,
    statuses,
  };
}

/** Live deep prober for the audit paths (tests inject a stub instead). */
export async function liveDeepVerify(urls: string[]): Promise<Map<string, VerifyResult>> {
  return verifyUrls(urls, 3000, { deepSoft404: true });
}

export interface FixPostResult {
  fixed: boolean;
  /** URLs pruned from `sources` (confirmed dead). */
  droppedSources: string[];
  /** Reference bullets removed from the body (confirmed dead). */
  droppedRefBullets: number;
  verified: number;
  unchecked: number;
  broken: number;
  backedOff: boolean;
  updated: Post;
}

/**
 * Fix a post's broken citations: prune confirmed-dead URLs from both the
 * `sources` list and the body's `## References` bullets using the same
 * verified prune logic as the generation gate (`verifyAndPruneReferences`),
 * then stamp the outcome onto `linkVerification` so the admin and the
 * Drafts/Published tabs reflect the repair. No-ops when nothing is broken.
 */
export async function fixPostLinks(
  post: Post,
  verify: (urls: string[]) => Promise<Map<string, LinkStatus>>
): Promise<FixPostResult> {
  const { body, sources, report } = await verifyAndPruneReferences({
    body: post.body ?? '',
    sources: (post.sources ?? []) as PostSource[],
    verify,
  });
  const brokenSet = new Set(report.broken);
  const droppedSources = (post.sources ?? [])
    .filter((s: PostSource) => brokenSet.has(s.url))
    .map((s: PostSource) => s.url);
  const updated: Post = {
    ...post,
    body,
    sources,
    linkVerification: {
      checked: report.checked,
      verified: report.verified,
      unchecked: report.unchecked,
      broken: report.broken.length,
      brokenUrls: report.broken.slice(0, 5),
    },
  };
  const fixed = droppedSources.length > 0 || report.droppedRefBullets > 0;
  return {
    fixed,
    droppedSources,
    droppedRefBullets: report.droppedRefBullets,
    verified: report.verified,
    unchecked: report.unchecked,
    broken: report.broken.length,
    backedOff: report.backedOff,
    updated,
  };
}
