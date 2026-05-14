import type { Candidate, Post, Slot } from '../types';
import { slotIdFor } from '../stable-keys';

export interface RunPublisherDeps {
  pickDueSlot: (now: Date) => Promise<Slot | null>;
  markSlotStatus: (candidateId: string, status: Slot['status'], extras?: Partial<Slot>) => Promise<void>;
  getApproved: (stableKey: string) => Promise<Candidate | null>;
  unapprove: (stableKey: string) => Promise<void>;
  generatePost: (candidate: Candidate, now: Date) => Promise<Post>;
  putPost: (post: Post) => Promise<void>;
  refreshRss: () => Promise<void>;
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
    await deps.putPost(post);
    await deps.refreshRss();
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
  } catch (err: any) {
    const msg = String(err?.message ?? err);
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
