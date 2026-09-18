/**
 * Anarchy recommendations — deterministic, dependency-free scoring.
 *
 * Zero DOM / zero Node globals on purpose: this module is shared by the SPA
 * (src/pages/Anarchy.tsx) AND the edge worker (worker/lib/anarchy-manifest.ts
 * re-exports thin wrappers), so it must typecheck under the root tsconfig,
 * api/tsconfig and api/tsconfig.worker.json alike. No LLM in the loop —
 * scores come from tag affinity with the user's library, provider affinity,
 * and a difficulty ladder derived from completed courses.
 */

export type RecommendDifficulty = 'beginner' | 'intermediate' | 'advanced';

/** Structural minimum a course needs to be scored. Both the worker slim
 *  rows and the SPA rows satisfy this, so callers keep their own types. */
export interface RecommendCourse {
  id: string;
  title: string;
  tags: string[];
  provider: { name: string; host: string };
  difficulty: RecommendDifficulty;
  hours: number;
}

export interface RecommendInput {
  /** Bookmarked course ids ("0001" or "1" — normalized internally). */
  saved?: string[];
  /** Completed course ids. */
  done?: string[];
  /** In-progress course ids. */
  doing?: string[];
  /** Hard cap: drop candidates longer than this. */
  maxHours?: number;
  /** Max recommendations (default 12, clamped 1..50). */
  limit?: number;
  /** Tag → catalog count, used as a tiny popularity tie-break / cold-start signal. */
  tagPopularity?: Record<string, number>;
}

export interface ScoredCourse<T> {
  course: T;
  score: number;
  reasons: string[];
}

const DIFFICULTY_RANK: Record<RecommendDifficulty, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

function normId(raw: string): string | null {
  const digits = String(raw).trim().replace(/\D/g, '');
  return digits ? digits.padStart(4, '0') : null;
}

function normList(ids: string[] | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of ids ?? []) {
    const id = normId(raw);
    if (id) out.add(id);
  }
  return out;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(limit)));
}

/**
 * Rank catalog courses for a user library. Done / doing / saved courses are
 * never recommended back. Deterministic: ties break by course id ascending.
 */
export function recommendCourses<T extends RecommendCourse>(
  courses: T[],
  opts: RecommendInput = {}
): ScoredCourse<T>[] {
  const saved = normList(opts.saved);
  const done = normList(opts.done);
  const doing = normList(opts.doing);
  const excluded = new Set<string>([...saved, ...done, ...doing]);
  const limit = clampLimit(opts.limit, 12);
  const popularity = opts.tagPopularity ?? {};

  const byId = new Map<string, T>();
  for (const c of courses) {
    const id = normId(c.id);
    if (id && !byId.has(id)) byId.set(id, c);
  }

  // Tag affinity from the library: done weighs most, then saved, then doing.
  // Also remember HOW MANY library courses carry each tag for the reason line.
  const tagWeight = new Map<string, number>();
  const tagCourses = new Map<string, Set<string>>();
  const bump = (libId: string, tags: string[], w: number) => {
    for (const t of tags) {
      tagWeight.set(t, (tagWeight.get(t) ?? 0) + w);
      let s = tagCourses.get(t);
      if (!s) {
        s = new Set<string>();
        tagCourses.set(t, s);
      }
      s.add(libId);
    }
  };
  const provWeight = new Map<string, number>();
  const libCourse = (id: string): T | undefined => byId.get(id);
  for (const id of done) {
    const c = libCourse(id);
    if (!c) continue;
    bump(id, c.tags, 3);
    provWeight.set(c.provider.host, (provWeight.get(c.provider.host) ?? 0) + 2);
  }
  for (const id of saved) {
    const c = libCourse(id);
    if (!c) continue;
    bump(id, c.tags, 2);
    provWeight.set(c.provider.host, (provWeight.get(c.provider.host) ?? 0) + 2);
  }
  for (const id of doing) {
    const c = libCourse(id);
    if (!c) continue;
    bump(id, c.tags, 1);
    provWeight.set(c.provider.host, (provWeight.get(c.provider.host) ?? 0) + 1);
  }

  const hasSignal = tagWeight.size > 0;
  let doneMaxRank = -1;
  let doneCount = 0;
  for (const id of done) {
    const c = libCourse(id);
    if (!c) continue;
    doneCount += 1;
    doneMaxRank = Math.max(doneMaxRank, DIFFICULTY_RANK[c.difficulty] ?? 1);
  }

  const out: ScoredCourse<T>[] = [];
  for (const c of byId.values()) {
    const id = normId(c.id) ?? c.id;
    if (excluded.has(id)) continue;
    if (opts.maxHours !== undefined && c.hours > opts.maxHours) continue;

    let score = 0;
    const reasons: string[] = [];

    // 1. Tag affinity
    const shared = c.tags.filter((t) => tagWeight.has(t));
    if (shared.length > 0) {
      let tagScore = 0;
      let bestTag = shared[0]!;
      for (const t of shared) {
        const w = tagWeight.get(t) ?? 0;
        tagScore += w;
        if (w > (tagWeight.get(bestTag) ?? 0)) bestTag = t;
      }
      score += tagScore;
      const n = tagCourses.get(bestTag)?.size ?? shared.length;
      reasons.push(
        `Shares ${shared.length > 1 ? `${shared.length} tracks (${bestTag})` : bestTag} with ${n} course${n === 1 ? '' : 's'} in your library`
      );
    }

    // 2. Difficulty ladder — nudge one rung above the hardest completed
    // course. Reason first: progression beats provider as a signal.
    if (doneMaxRank >= 0) {
      const rank = DIFFICULTY_RANK[c.difficulty] ?? 1;
      const next = Math.min(doneMaxRank + 1, 2);
      if (rank === next && next > doneMaxRank) {
        score += 3;
        reasons.push(`Next step up: ${c.difficulty} (you finished ${doneCount} course${doneCount === 1 ? '' : 's'})`);
      } else if (rank === doneMaxRank && doneMaxRank === 2) {
        score += 2;
        reasons.push('More advanced work like your completed courses');
      }
    }

    // 3. Provider affinity
    const pw = provWeight.get(c.provider.host) ?? 0;
    if (pw > 0) {
      score += pw;
      reasons.push(`Same provider as your library (${c.provider.name})`);
    }

    // 4. Cold start — no library signal: beginner-friendly + popular first.
    if (!hasSignal) {
      const rank = DIFFICULTY_RANK[c.difficulty] ?? 1;
      score += (2 - rank) * 10 - c.hours;
      const topTag = [...c.tags].sort((a, b) => (popularity[b] ?? 0) - (popularity[a] ?? 0))[0];
      reasons.push(topTag ? `Popular starting point in ${topTag}` : 'Good starting point');
    }

    // 5. Tiny popularity tie-break (keeps ordering stable, never dominates).
    let pop = 0;
    for (const t of c.tags) pop += popularity[t] ?? 0;
    score += pop / 1000;

    out.push({ course: c, score, reasons: reasons.slice(0, 2) });
  }

  out.sort((a, b) => b.score - a.score || a.course.id.localeCompare(b.course.id));
  return out.slice(0, limit);
}

/**
 * Courses similar to one course: shared tags first, then same provider,
 * then same difficulty. Never returns the course itself.
 */
export function similarCourses<T extends RecommendCourse>(
  courses: T[],
  id: string,
  limit = 4
): ScoredCourse<T>[] {
  const targetId = normId(id);
  if (!targetId) return [];
  const target = courses.find((c) => normId(c.id) === targetId);
  if (!target) return [];
  const n = clampLimit(limit, 4);

  const out: ScoredCourse<T>[] = [];
  for (const c of courses) {
    if (normId(c.id) === targetId) continue;
    const shared = c.tags.filter((t) => target.tags.includes(t));
    const sameProvider = c.provider.host !== '' && c.provider.host === target.provider.host;
    if (shared.length === 0 && !sameProvider) continue;
    const score = shared.length * 10 + (sameProvider ? 5 : 0) + (c.difficulty === target.difficulty ? 2 : 0);
    const reasons: string[] = [];
    if (shared.length > 0) reasons.push(`Shares ${shared.slice(0, 2).join(' + ')} with this course`);
    if (sameProvider) reasons.push(`Same provider (${c.provider.name})`);
    out.push({ course: c, score, reasons });
  }
  out.sort((a, b) => b.score - a.score || a.course.id.localeCompare(b.course.id));
  return out.slice(0, n);
}
