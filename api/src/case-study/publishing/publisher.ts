import type { Candidate, Post, PostIndexEntry, Slot } from '../types';
import { slotIdFor } from '../stable-keys';

export interface RunPublisherDeps {
  pickDueSlot: (now: Date) => Promise<Slot | null>;
  markSlotStatus: (candidateId: string, status: Slot['status'], extras?: Partial<Slot>) => Promise<void>;
  getApproved: (stableKey: string) => Promise<Candidate | null>;
  unapprove: (stableKey: string) => Promise<void>;
  generatePost: (candidate: Candidate, now: Date) => Promise<Post>;
  putPost: (post: Post) => Promise<PostIndexEntry[]>;
  /**
   * Optional draft sink. When `requireApproval` is true the generated
   * post is written here instead of `putPost`; RSS / unapprove / dedup
   * stay on the same path so the candidate isn't re-discovered while a
   * draft is sitting in the queue.
   */
  putDraft?: (post: Post) => Promise<void>;
  refreshRss: (index?: PostIndexEntry[]) => Promise<void>;
  touchDedup: (stableKey: string, when: Date, publishedSlug: string) => Promise<void>;
  recordFailure: (rec: {
    slotId: string;
    candidateId: string;
    error: string;
    rawOutput?: string;
    failedAt: string;
    retries: number;
  }) => Promise<void>;
  now: Date;
  /**
   * Human-approval gate. When true (BLOG_APPROVAL_REQUIRED=true on the
   * worker), the publisher writes a draft and stops there; an admin
   * approves via `/admin/case-study/drafts/:slug/approve`, which is the
   * step that flips it to the public posts index + refreshes RSS.
   * When false, behaviour is identical to the previous auto-publish flow.
   */
  requireApproval?: boolean;
}

export async function runPublisher(deps: RunPublisherDeps): Promise<{ published: number; slug?: string }> {
  const slot = await deps.pickDueSlot(deps.now);
  if (!slot) {
    console.log(JSON.stringify({ job: 'publisher', published: 0, reason: 'no-due-slot', ts: deps.now.toISOString() }));
    return { published: 0 };
  }

  await deps.markSlotStatus(slot.candidateId, 'publishing');

  const candidate = await deps.getApproved(slot.candidateId);
  if (!candidate) {
    await deps.markSlotStatus(slot.candidateId, 'failed', { error: 'approved candidate missing' });
    await deps.recordFailure({
      slotId: slotIdFor(slot.slotAt),
      candidateId: slot.candidateId,
      error: 'approved candidate missing',
      failedAt: deps.now.toISOString(),
      retries: 0,
    });
    return { published: 0 };
  }

  try {
    const post = await deps.generatePost(candidate, deps.now);

    if (deps.requireApproval) {
      if (!deps.putDraft) {
        console.warn(
          JSON.stringify({
            job: 'publisher',
            slug: post.slug,
            warning: 'requireApproval=true but putDraft is unset — falling through to auto-publish',
          })
        );
      } else {
        // Approval gate: write to draft + stop. The candidate stays
        // unapproved-deduped (no re-discovery) but RSS / public index are
        // untouched until an admin approves. The slot transitions to
        // 'draft' so the planner doesn't pick it again.
        await deps.putDraft(post);
        await deps.unapprove(candidate.key);
        await deps.touchDedup(candidate.key, deps.now, post.slug);
        await deps.markSlotStatus(slot.candidateId, 'draft', { publishedSlug: post.slug });
        console.log(
          JSON.stringify({
            job: 'publisher',
            drafted: 1,
            slug: post.slug,
            candidateId: candidate.key,
            ts: deps.now.toISOString(),
            note: 'awaiting admin approval',
          })
        );
        return { published: 0, slug: post.slug };
      }
    }

    const index = await deps.putPost(post);
    await deps.refreshRss(index);
    await deps.unapprove(candidate.key);
    await deps.touchDedup(candidate.key, deps.now, post.slug);
    await deps.markSlotStatus(slot.candidateId, 'published', { publishedSlug: post.slug });

    console.log(
      JSON.stringify({
        job: 'publisher',
        published: 1,
        slug: post.slug,
        candidateId: candidate.key,
        ts: deps.now.toISOString(),
      })
    );
    return { published: 1, slug: post.slug };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await deps.markSlotStatus(slot.candidateId, 'failed', { error: msg });
    await deps.recordFailure({
      slotId: slotIdFor(slot.slotAt),
      candidateId: slot.candidateId,
      error: msg,
      failedAt: deps.now.toISOString(),
      retries: 0,
    });
    console.warn('publisher failed', err);
    return { published: 0 };
  }
}
